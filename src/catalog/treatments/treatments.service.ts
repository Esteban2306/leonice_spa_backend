import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminTreatmentRecord,
  TreatmentsRepository,
  TreatmentWithRelations,
} from './treatments.repository';
import { FindAdminTreatmentsQueryDto } from './dto/find-admin-treatments-query.dto';
import { CategoriesService } from '../categories/categories.service';
import { CreateTreatmentDto } from './dto/create-treatment.dto';
import { UpdateTreatmentDto } from './dto/update-treatment.dto';
import { SafeCacheService } from '../../infrastructure/redis/safe-cache.service';
import {
  CATALOG_CACHE_KEYS,
  CATALOG_CACHE_TTL_SECONDS,
} from '../constants/catalog-cache.constants';
import { Decimal } from '@prisma/client/runtime/library';
import { SetHairColorSurchargesDto } from './dto/set-hair-color-surcharges.dto';
import { SetHairLengthPricingDto } from './dto/set-hair-length-pricing.dto';
import { HairColor, HairLength, Promotion } from '@prisma/client';
import { combineHairPricing } from 'src/clients/domain/compute-treatment-pricing';
import { PromotionsService } from 'src/promotions/promotions.service';
import { resolveApplicablePromotion } from 'src/promotions/domain/resolve-applicable-promotion';
import { CloudinaryService } from 'src/infrastructure/cloudinary/cloudinary.service';
import { AppException } from 'src/common/errors/app.exception';
import { uniqueSlug } from '../common/slugify';

interface RangeCheck {
  basePriceMin?: number | Decimal | null;
  basePriceMax?: number | Decimal | null;
  baseDurationMinMinutes?: number | Decimal | null;
  baseDurationMaxMinutes?: number | Decimal | null;
}

@Injectable()
export class TreatmentsService {
  private readonly logger = new Logger(TreatmentsService.name);

  constructor(
    private readonly repository: TreatmentsRepository,
    private readonly categoriesService: CategoriesService,
    private readonly cache: SafeCacheService,
    private readonly promotionsService: PromotionsService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async findAll(categoryId?: string) {
    const cached = await this.cache.get<TreatmentWithRelations[]>(
      CATALOG_CACHE_KEYS.treatments,
    );
    const treatments = cached ?? (await this.loadAndCacheAll());

    const filtered = categoryId
      ? treatments.filter((t) => t.categoryId === categoryId)
      : treatments;

    const activePromotions =
      await this.promotionsService.findAllCurrentlyValid();
    return filtered.map((t) => this.withPromotion(t, activePromotions));
  }

  async findAllForAdmin(query: FindAdminTreatmentsQueryDto) {
    const [treatments, activePromotions] = await Promise.all([
      this.repository.findForAdmin(query),
      this.promotionsService.findAllCurrentlyValid(),
    ]);

    const views = treatments.map((t) => this.toAdminView(t, activePromotions));
    if (query.hasActivePromotion === undefined) return views;
    return views.filter(
      (view) => (view.activePromotion !== null) === query.hasActivePromotion,
    );
  }

  async findOne(id: string) {
    const treatment = await this.repository.findById(id);
    if (!treatment) throw new NotFoundException('Tratamiento no encontrado');

    const activePromotions =
      await this.promotionsService.findAllCurrentlyValid();
    return this.withPromotion(treatment, activePromotions);
  }

  async create(dto: CreateTreatmentDto) {
    await this.categoriesService.findOne(dto.categoryId);
    this.assertConsistentRanges(dto);

    const existing = await this.repository.findByCategoryAndName(
      dto.categoryId,
      dto.name,
    );
    if (existing)
      throw new ConflictException(`Ya existe "${dto.name}" en esta categoría`);

    const slug = await uniqueSlug(dto.name, (candidate) =>
      this.repository.isSlugTaken(dto.categoryId, candidate),
    );
    const treatment = await this.repository.create({ ...dto, slug });
    await this.invalidateCache();
    return treatment;
  }

  async update(id: string, dto: UpdateTreatmentDto) {
    const current = await this.findOne(id);
    this.assertConsistentRanges({ ...current, ...dto });

    const nextCategoryId = dto.categoryId ?? current.categoryId;
    const nextName = dto.name ?? current.name;
    if (nextCategoryId !== current.categoryId || nextName !== current.name) {
      if (nextCategoryId !== current.categoryId) {
        await this.categoriesService.findOne(nextCategoryId);
      }
      const existing = await this.repository.findByCategoryAndName(
        nextCategoryId,
        nextName,
      );
      if (existing && existing.id !== id)
        throw new ConflictException(
          `Ya existe "${nextName}" en esta categoría`,
        );
    }

    const treatment = await this.repository.update(id, dto);
    await this.invalidateCache();
    return treatment;
  }

  async uploadVideo(id: string, fileBuffer: Buffer) {
    const current = await this.findOne(id);

    const publicId = this.cloudinary.treatmentVideoPublicId(id);
    let uploaded: { url: string; posterUrl: string; publicId: string };
    try {
      uploaded = await this.cloudinary.uploadTreatmentVideo(
        fileBuffer,
        publicId,
      );
    } catch (error) {
      await this.destroyVideoQuietly(publicId);
      this.logger.error(
        `Fallo subiendo el video del servicio ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new AppException('TREATMENT_VIDEO_UPLOAD_FAILED', { cause: error });
    }

    try {
      const treatment = await this.repository.setVideo(id, {
        videoUrl: uploaded.url,
        posterUrl: uploaded.posterUrl,
        videoPublicId: uploaded.publicId,
      });
      await this.invalidateCache();
      if (current.videoPublicId)
        await this.destroyVideoQuietly(current.videoPublicId);
      return treatment;
    } catch (error) {
      await this.destroyVideoQuietly(uploaded.publicId);
      throw error;
    }
  }

  async removeVideo(id: string) {
    const current = await this.findOne(id);
    if (!current.videoUrl) throw new AppException('TREATMENT_VIDEO_NOT_FOUND');

    const treatment = await this.repository.clearVideo(id);
    await this.invalidateCache();
    if (current.videoPublicId)
      await this.destroyVideoQuietly(current.videoPublicId);
    return treatment;
  }

  async setHairLengthPricing(
    treatmentId: string,
    entries: SetHairLengthPricingDto['entries'],
  ) {
    const treatment = await this.findOne(treatmentId);
    if (!treatment.hasHairVariablePricing) {
      throw new BadRequestException(
        'Activa "hasHairVariablePricing" antes de configurar precios por largo de cabello',
      );
    }

    const allLengths = Object.values(HairLength);
    const provided = new Set(entries.map((e) => e.hairLength));
    const missing = allLengths.filter((l) => !provided.has(l));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Faltan precios para: ${missing.join(', ')}`,
      );
    }
    if (provided.size !== entries.length) {
      throw new BadRequestException(
        'No puedes repetir el mismo largo de cabello más de una vez',
      );
    }

    return this.repository.replaceHairLengthPricing(treatmentId, entries);
  }

  async setHairColorSurcharges(
    treatmentId: string,
    entries: SetHairColorSurchargesDto['entries'],
  ) {
    const treatment = await this.findOne(treatmentId);
    if (!treatment.hasHairVariablePricing) {
      throw new BadRequestException(
        'Activa "hasHairVariablePricing" antes de configurar recargos por color',
      );
    }

    const colors = entries.map((e) => e.hairColor);
    if (new Set(colors).size !== colors.length) {
      throw new BadRequestException(
        'No puedes repetir el mismo color de cabello más de una vez',
      );
    }

    return this.repository.replaceHairColorSurcharges(treatmentId, entries);
  }

  async getHairLengthPricing(id: string) {
    await this.findOne(id);
    const pricing = await this.repository.findHairLengthPricing(id);
    if (pricing.length === 0) {
      throw new BadRequestException(
        'Este tratamiento no tiene precios configurados por largo de cabello',
      );
    }
    return pricing;
  }

  async getHairColorSurcharges(id: string) {
    await this.findOne(id);
    return this.repository.findHairColorSurcharges(id);
  }

  async getHairPricingMatrix(treatmentId: string) {
    const treatment = await this.findOne(treatmentId);
    if (!treatment.hasHairVariablePricing) {
      throw new BadRequestException(
        'Este tratamiento no tiene precios variables por cabello',
      );
    }

    const [lengthPricing, colorSurcharges] = await Promise.all([
      this.repository.findHairLengthPricing(treatmentId),
      this.repository.findHairColorSurcharges(treatmentId),
    ]);

    const allColors = Object.values(HairColor);
    const matrix = lengthPricing.flatMap((lengthRow) =>
      allColors.map((color) => ({
        hairLength: lengthRow.hairLength,
        hairColor: color,
        ...combineHairPricing(
          lengthPricing,
          colorSurcharges,
          lengthRow.hairLength,
          color,
        ),
      })),
    );

    return { lengthPricing, colorSurcharges, matrix };
  }

  private assertConsistentRanges(data: RangeCheck) {
    if (
      data.basePriceMin != null &&
      data.basePriceMax != null &&
      data.basePriceMin > data.basePriceMax
    ) {
      throw new BadRequestException(
        'El precio mínimo no puede ser mayor que el máximo',
      );
    }
    if (
      data.baseDurationMinMinutes != null &&
      data.baseDurationMaxMinutes != null &&
      data.baseDurationMinMinutes > data.baseDurationMaxMinutes
    ) {
      throw new BadRequestException(
        'La duración mínima no puede ser mayor que la máxima',
      );
    }
  }

  private async loadAndCacheAll() {
    const treatments = await this.repository.findAllActive();
    void this.cache.set(
      CATALOG_CACHE_KEYS.treatments,
      treatments,
      CATALOG_CACHE_TTL_SECONDS,
    );
    return treatments;
  }

  private toAdminView(
    treatment: AdminTreatmentRecord,
    activePromotions: Promotion[],
  ) {
    const { _count, ...rest } = treatment;
    return {
      ...this.withPromotion(rest, activePromotions),
      reservationCount: _count.reservations,
    };
  }

  private withPromotion<T extends TreatmentWithRelations>(
    treatment: T,
    activePromotions: Promotion[],
  ) {
    const promo = resolveApplicablePromotion(activePromotions, {
      treatmentId: treatment.id,
      categoryId: treatment.categoryId,
    });
    if (!promo) return { ...treatment, activePromotion: null };

    const discount = Number(promo.discountPercentage) / 100;
    const applyDiscount = (price: unknown) =>
      price != null
        ? Number((Number(price) * (1 - discount)).toFixed(2))
        : null;

    return {
      ...treatment,
      activePromotion: {
        id: promo.id,
        name: promo.name,
        discountPercentage: promo.discountPercentage.toString(),
      },
      effectiveBasePriceMin: applyDiscount(treatment.basePriceMin),
      effectiveBasePriceMax: applyDiscount(treatment.basePriceMax),
    };
  }

  private async destroyVideoQuietly(publicId: string) {
    try {
      await this.cloudinary.destroyVideo(publicId);
    } catch (error) {
      this.logger.warn(
        `No se pudo borrar el video ${publicId} de Cloudinary: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async invalidateCache() {
    await Promise.all([
      this.cache.delete(CATALOG_CACHE_KEYS.treatments),
      this.cache.delete(CATALOG_CACHE_KEYS.showcase),
    ]);
  }
}
