import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { PromotionsRepository } from './promotions.repository';

const TREATMENT = '3f1c2c1e-9d52-4a5e-8d6d-0b8f9d3b1111';
const CATEGORY = '4a2d3d2f-0e63-4b6f-9e7e-1c9f0e4c2222';
const PRODUCT = '5b3e4e3a-1f74-4c7a-8f8f-2d0a1f5d3333';
const KIT_CATEGORY = '6c4f5f4b-2a85-4d8b-9a9a-3e1b2a6e4444';

function build(overlap: { id: string; name: string } | null = null) {
  const repository = {
    findOverlapping: jest.fn().mockResolvedValue(overlap),
    targetExists: jest.fn().mockResolvedValue(true),
    create: jest.fn().mockResolvedValue({ id: 'new' }),
    update: jest.fn().mockResolvedValue({ id: 'p1' }),
    countBlockingReferences: jest
      .fn()
      .mockResolvedValue({ automationRules: 0, openCampaigns: 0 }),
    delete: jest.fn().mockResolvedValue({ id: 'p1' }),
    findById: jest.fn().mockResolvedValue({
      id: 'p1',
      name: 'Actual',
      treatmentId: TREATMENT,
      categoryId: null,
      productId: null,
      productCategoryId: null,
      startsAt: new Date('2026-11-01T05:00:00Z'),
      endsAt: new Date('2026-11-10T05:00:00Z'),
      isActive: true,
    }),
  };
  const service = new PromotionsService(
    repository as unknown as PromotionsRepository,
  );
  return { service, repository };
}

const dto = {
  name: 'Semana del alisado',
  discountPercentage: 15,
  startsAt: '2026-11-10T00:00:00-05:00',
  endsAt: '2026-11-17T23:59:59-05:00',
};

describe('PromotionsService', () => {
  it('crea la promoción cuando no se cruza con otra del mismo objetivo', async () => {
    const { service, repository } = build();
    await service.create({ ...dto, categoryId: CATEGORY });
    expect(repository.findOverlapping).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { field: 'categoryId', id: CATEGORY },
      }),
    );
    expect(repository.create).toHaveBeenCalled();
  });

  it('rechaza una promoción que se cruza con otra activa del mismo objetivo', async () => {
    const { service, repository } = build({ id: 'x', name: 'Octubre' });
    await expect(
      service.create({ ...dto, treatmentId: TREATMENT }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('sigue exigiendo un único objetivo y un rango válido antes de revisar cruces', async () => {
    const { service, repository } = build();
    await expect(service.create({ ...dto })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.create({
        ...dto,
        categoryId: CATEGORY,
        startsAt: dto.endsAt,
        endsAt: dto.startsAt,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.findOverlapping).not.toHaveBeenCalled();
  });

  it('al editar revisa los cruces excluyendo la propia promoción', async () => {
    const { service, repository } = build();
    await service.update('p1', { endsAt: '2026-11-20T23:59:59-05:00' });
    expect(repository.findOverlapping).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { field: 'treatmentId', id: TREATMENT },
        excludeId: 'p1',
      }),
    );
  });

  it('al desactivar una promoción no revisa cruces', async () => {
    const { service, repository } = build({ id: 'x', name: 'Otra' });
    await service.update('p1', { isActive: false });
    expect(repository.findOverlapping).not.toHaveBeenCalled();
    expect(repository.update).toHaveBeenCalled();
  });

  it('elimina una promoción que nadie usa', async () => {
    const { service, repository } = build();
    await service.remove('p1');
    expect(repository.delete).toHaveBeenCalledWith('p1');
  });

  it('no elimina una promoción usada por reglas de automatización o campañas abiertas y dice por qué', async () => {
    const { service, repository } = build();
    repository.countBlockingReferences.mockResolvedValue({
      automationRules: 1,
      openCampaigns: 2,
    });
    await expect(service.remove('p1')).rejects.toThrow(
      /1 regla de automatización y 2 campañas en curso o pausadas/,
    );
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('responde 404 al eliminar una promoción que no existe', async () => {
    const { service, repository } = build();
    repository.findById.mockResolvedValue(null);
    await expect(service.remove('p1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('crea una promoción para un producto o kit y solo revisa cruces con ese producto', async () => {
    const { service, repository } = build();
    await service.create({ ...dto, productId: PRODUCT });
    expect(repository.findOverlapping).toHaveBeenCalledWith(
      expect.objectContaining({ target: { field: 'productId', id: PRODUCT } }),
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: PRODUCT,
        treatmentId: null,
        categoryId: null,
        productCategoryId: null,
      }),
    );
  });

  it('rechaza una promoción con dos objetivos, como un servicio y un producto', async () => {
    const { service, repository } = build();
    await expect(
      service.create({ ...dto, treatmentId: TREATMENT, productId: PRODUCT }),
    ).rejects.toThrow('una sola cosa');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('no crea la promoción si el producto elegido ya no existe', async () => {
    const { service, repository } = build();
    repository.targetExists.mockResolvedValue(false);
    await expect(
      service.create({ ...dto, productCategoryId: KIT_CATEGORY }),
    ).rejects.toThrow('ya no existe');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('al cambiar el objetivo de servicio a producto limpia el anterior', async () => {
    const { service, repository } = build();
    await service.update('p1', { productId: PRODUCT });
    expect(repository.update).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ productId: PRODUCT, treatmentId: null }),
    );
  });
});
