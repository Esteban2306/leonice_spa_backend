import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { PromotionsRepository } from './promotions.repository';

const TREATMENT = '3f1c2c1e-9d52-4a5e-8d6d-0b8f9d3b1111';
const CATEGORY = '4a2d3d2f-0e63-4b6f-9e7e-1c9f0e4c2222';

function build(overlap: { id: string; name: string } | null = null) {
  const repository = {
    findOverlapping: jest.fn().mockResolvedValue(overlap),
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
      expect.objectContaining({ categoryId: CATEGORY }),
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
      expect.objectContaining({ treatmentId: TREATMENT, excludeId: 'p1' }),
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
});
