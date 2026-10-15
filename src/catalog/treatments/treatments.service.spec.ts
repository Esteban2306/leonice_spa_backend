import { ConflictException } from '@nestjs/common';
import { Promotion } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { TreatmentsService } from './treatments.service';
import { TreatmentsRepository } from './treatments.repository';
import { CategoriesService } from '../categories/categories.service';
import { SafeCacheService } from '../../infrastructure/redis/safe-cache.service';
import { PromotionsService } from '../../promotions/promotions.service';
import {
  FindAdminTreatmentsQueryDto,
  TreatmentSortField,
} from './dto/find-admin-treatments-query.dto';
import { CatalogStatusFilter, SortOrder } from '../common/catalog-filters';
import { CloudinaryService } from '../../infrastructure/cloudinary/cloudinary.service';
import { AppException } from '../../common/errors/app.exception';

jest.mock('../../infrastructure/redis/safe-cache.service', () => ({
  SafeCacheService: class {},
}));

jest.mock('../../infrastructure/cloudinary/cloudinary.service', () => ({
  CloudinaryService: class {},
}));

const NAILS = 'cat-nails';

function treatment(id: string, name: string, reservations = 0) {
  return {
    id,
    categoryId: NAILS,
    name,
    requiresPriorAssessment: false,
    hasHairVariablePricing: false,
    basePriceMin: new Decimal(35),
    basePriceMax: new Decimal(35),
    baseDurationMinMinutes: 90,
    baseDurationMaxMinutes: 90,
    isActive: true,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    category: { id: NAILS, name: 'Uñas' },
    hairLengthPricing: [],
    hairColorSurcharges: [],
    _count: { reservations },
  };
}

function promotion(treatmentId: string): Promotion {
  return {
    id: 'promo-1',
    name: 'Semana de uñas',
    discountPercentage: new Decimal(20),
    startsAt: new Date('2026-10-01T00:00:00Z'),
    endsAt: new Date('2026-10-31T00:00:00Z'),
    treatmentId,
    categoryId: null,
    isActive: true,
    createdAt: new Date('2026-10-01T00:00:00Z'),
  };
}

function query(
  overrides: Partial<FindAdminTreatmentsQueryDto> = {},
): FindAdminTreatmentsQueryDto {
  return {
    status: CatalogStatusFilter.ALL,
    sortBy: TreatmentSortField.NAME,
    sortOrder: SortOrder.ASC,
    ...overrides,
  };
}

describe('TreatmentsService (admin)', () => {
  const repository = {
    findForAdmin: jest.fn(),
    findById: jest.fn(),
    findByCategoryAndName: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    isSlugTaken: jest.fn(),
    setVideo: jest.fn(),
    clearVideo: jest.fn(),
  };
  const categories = { findOne: jest.fn() };
  const cache = { delete: jest.fn() };
  const promotions = { findAllCurrentlyValid: jest.fn() };
  const cloudinary = {
    treatmentVideoPublicId: jest.fn(),
    uploadTreatmentVideo: jest.fn(),
    destroyVideo: jest.fn(),
  };

  const service = new TreatmentsService(
    repository as unknown as TreatmentsRepository,
    categories as unknown as CategoriesService,
    cache as unknown as SafeCacheService,
    promotions as unknown as PromotionsService,
    cloudinary as unknown as CloudinaryService,
  );

  beforeEach(() => jest.resetAllMocks());

  it('expone el conteo de reservas y el precio con promoción', async () => {
    repository.findForAdmin.mockResolvedValue([
      treatment('t-1', 'Pedespa tradicional', 53),
    ]);
    promotions.findAllCurrentlyValid.mockResolvedValue([promotion('t-1')]);

    const [view] = await service.findAllForAdmin(query());

    expect(view.reservationCount).toBe(53);
    expect(view.activePromotion?.id).toBe('promo-1');
    expect(view).not.toHaveProperty('_count');
    expect(view).toMatchObject({ effectiveBasePriceMin: 28 });
  });

  it('filtra por servicios con o sin promoción vigente', async () => {
    repository.findForAdmin.mockResolvedValue([
      treatment('t-1', 'Pedespa tradicional'),
      treatment('t-2', 'Uñas Dipping'),
    ]);
    promotions.findAllCurrentlyValid.mockResolvedValue([promotion('t-1')]);

    const withPromo = await service.findAllForAdmin(
      query({ hasActivePromotion: true }),
    );
    const withoutPromo = await service.findAllForAdmin(
      query({ hasActivePromotion: false }),
    );

    expect(withPromo.map((t) => t.id)).toEqual(['t-1']);
    expect(withoutPromo.map((t) => t.id)).toEqual(['t-2']);
  });

  it('rechaza renombrar a un nombre que ya existe en la categoría', async () => {
    repository.findById.mockResolvedValue(treatment('t-1', 'Tradicional'));
    promotions.findAllCurrentlyValid.mockResolvedValue([]);
    repository.findByCategoryAndName.mockResolvedValue({ id: 't-2' });

    await expect(
      service.update('t-1', { name: 'Permanente' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('permite guardar sin cambiar el nombre', async () => {
    repository.findById.mockResolvedValue(treatment('t-1', 'Tradicional'));
    promotions.findAllCurrentlyValid.mockResolvedValue([]);
    repository.update.mockResolvedValue({ id: 't-1' });

    await service.update('t-1', { basePriceMin: 35, basePriceMax: 35 });

    expect(repository.findByCategoryAndName).not.toHaveBeenCalled();
    expect(repository.update).toHaveBeenCalledWith('t-1', {
      basePriceMin: 35,
      basePriceMax: 35,
    });
  });

  it('genera un slug único dentro de la categoría al crear', async () => {
    categories.findOne.mockResolvedValue({ id: NAILS });
    repository.findByCategoryAndName.mockResolvedValue(null);
    repository.isSlugTaken.mockImplementation(
      (_category: string, slug: string) =>
        Promise.resolve(slug === 'unas-dipping'),
    );
    repository.create.mockResolvedValue({ id: 't-9' });

    await service.create({ categoryId: NAILS, name: 'Uñas Dipping' });

    expect(repository.create).toHaveBeenCalledWith({
      categoryId: NAILS,
      name: 'Uñas Dipping',
      slug: 'unas-dipping-2',
    });
  });

  it('reemplaza el video y borra el anterior de Cloudinary', async () => {
    repository.findById.mockResolvedValue({
      ...treatment('t-1', 'Alisado'),
      videoUrl: 'https://old.mp4',
      videoPublicId: 'old-video',
    });
    promotions.findAllCurrentlyValid.mockResolvedValue([]);
    cloudinary.treatmentVideoPublicId.mockReturnValue('new-video');
    cloudinary.uploadTreatmentVideo.mockResolvedValue({
      url: 'https://new.mp4',
      posterUrl: 'https://new.jpg',
      publicId: 'new-video',
    });
    repository.setVideo.mockResolvedValue({ id: 't-1' });

    await service.uploadVideo('t-1', Buffer.from('video'));

    expect(repository.setVideo).toHaveBeenCalledWith('t-1', {
      videoUrl: 'https://new.mp4',
      posterUrl: 'https://new.jpg',
      videoPublicId: 'new-video',
    });
    expect(cloudinary.destroyVideo).toHaveBeenCalledWith('old-video');
    expect(cache.delete).toHaveBeenCalledWith('catalog:showcase:tree');
  });

  it('no toca la base si la subida del video falla', async () => {
    repository.findById.mockResolvedValue(treatment('t-1', 'Alisado'));
    promotions.findAllCurrentlyValid.mockResolvedValue([]);
    cloudinary.treatmentVideoPublicId.mockReturnValue('new-video');
    cloudinary.uploadTreatmentVideo.mockRejectedValue(new Error('timeout'));

    await expect(
      service.uploadVideo('t-1', Buffer.from('video')),
    ).rejects.toBeInstanceOf(AppException);
    expect(repository.setVideo).not.toHaveBeenCalled();
    expect(cloudinary.destroyVideo).toHaveBeenCalledWith('new-video');
  });
});
