import { BadRequestException } from '@nestjs/common';
import { AutomationRulesService } from './automation-rules.service';
import type { AutomationRulesRepository } from './repositories/automation-rules.repository';

const target = { treatmentId: '11111111-1111-4111-8111-111111111111' };

function build(promotionExists = true) {
  const repository = {
    create: jest.fn((dto: unknown) => Promise.resolve(dto)),
    findPromotion: jest.fn(() =>
      Promise.resolve(promotionExists ? { id: 'p' } : null),
    ),
  };
  const service = new AutomationRulesService(
    repository as unknown as AutomationRulesRepository,
  );
  return { service, repository };
}

describe('AutomationRulesService.create', () => {
  it('acepta un seguimiento con mensaje de mantenimiento para un tratamiento', async () => {
    const { service, repository } = build();
    await service.create({
      ...target,
      reactivationDays: 30,
      templateCode: 'MAINTENANCE_REMINDER',
    });
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it('acepta un recordatorio previo sin seguimiento', async () => {
    const { service } = build();
    await expect(
      service.create({ ...target, reminderDays: 2 }),
    ).resolves.toBeDefined();
  });

  it('rechaza una regla sin recordatorio ni seguimiento', async () => {
    const { service } = build();
    await expect(service.create({ ...target })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rechaza un mensaje sin los días del seguimiento', async () => {
    const { service } = build();
    await expect(
      service.create({
        ...target,
        reminderDays: 1,
        templateCode: 'MAINTENANCE_REMINDER',
      }),
    ).rejects.toThrow('días del seguimiento');
  });

  it('exige promoción solo para el mensaje que la usa', async () => {
    const { service } = build();
    await expect(
      service.create({
        ...target,
        reactivationDays: 60,
        templateCode: 'REACTIVATION_PROMO',
      }),
    ).rejects.toThrow('necesita una promoción');
    await expect(
      service.create({
        ...target,
        reactivationDays: 60,
        templateCode: 'MAINTENANCE_REMINDER',
        promotionId: '22222222-2222-4222-8222-222222222222',
      }),
    ).rejects.toThrow('no usa promoción');
  });

  it('rechaza una promoción que no existe', async () => {
    const { service } = build(false);
    await expect(
      service.create({
        ...target,
        reactivationDays: 60,
        templateCode: 'REACTIVATION_PROMO',
        promotionId: '22222222-2222-4222-8222-222222222222',
      }),
    ).rejects.toThrow('no existe');
  });
});
