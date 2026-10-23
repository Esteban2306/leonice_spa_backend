import { BusinessSettingsService } from './business-settings.service';
import type { PrismaService } from '../infrastructure/database/prisma.service';

describe('BusinessSettingsService.publicHours', () => {
  const build = (
    windows: { dayOfWeek: number; startMinute: number; endMinute: number }[],
  ) => {
    const findMany = jest.fn().mockResolvedValue(windows);
    const prisma = {
      client: { operatingWindow: { findMany } },
    } as unknown as PrismaService;
    return {
      service: new BusinessSettingsService(prisma, {
        publish: jest.fn(),
      } as never),
      findMany,
    };
  };

  it('devuelve los siete días con sus franjas en hora de Bogotá', async () => {
    const { service } = build([
      { dayOfWeek: 1, startMinute: 8 * 60, endMinute: 12 * 60 },
      { dayOfWeek: 1, startMinute: 14 * 60, endMinute: 17 * 60 + 30 },
      { dayOfWeek: 6, startMinute: 7 * 60, endMinute: 12 * 60 },
    ]);

    const result = await service.publicHours();

    expect(result.timeZone).toBe('America/Bogota');
    expect(result.days).toHaveLength(7);
    expect(result.days[0]).toEqual({ dayOfWeek: 0, windows: [] });
    expect(result.days[1].windows).toEqual([
      { opens: '08:00', closes: '12:00' },
      { opens: '14:00', closes: '17:30' },
    ]);
    expect(result.days[6].windows).toEqual([
      { opens: '07:00', closes: '12:00' },
    ]);
  });

  it('solo expone día y franjas, sin ids ni datos internos', async () => {
    const { service, findMany } = build([]);
    await service.publicHours();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { dayOfWeek: true, startMinute: true, endMinute: true },
      }),
    );
  });
});
