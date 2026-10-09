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

jest.mock('../../infrastructure/redis/safe-cache.service', () => ({
  SafeCacheService: class {},
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
  };
  const categories = { findOne: jest.fn() };
  const cache = { delete: jest.fn() };
  const promotions = { findAllCurrentlyValid: jest.fn() };

  const service = new TreatmentsService(
    repository as unknown as TreatmentsRepository,
    categories as unknown as CategoriesService,
    cache as unknown as SafeCacheService,
    promotions as unknown as PromotionsService,
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
});
