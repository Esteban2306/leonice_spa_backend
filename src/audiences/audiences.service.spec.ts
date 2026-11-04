import { ClientTagKey } from '@prisma/client';
import type { MarketingFrequencyService } from '../marketing/marketing-frequency.service';
import { AudiencesService, buildAudienceWhere } from './audiences.service';
import { PrismaService } from '../infrastructure/database/prisma.service';

const NOW = new Date('2026-11-10T15:00:00Z');

describe('buildAudienceWhere', () => {
  it('siempre deja fuera a las clientas anonimizadas', () => {
    const where = buildAudienceWhere({}, NOW);
    expect(where.AND).toEqual([
      { phone: { not: { startsWith: 'anonimizado-' } } },
    ]);
  });

  it('exige todas las etiquetas incluidas y ninguna de las excluidas', () => {
    const where = buildAudienceWhere(
      {
        tags: [ClientTagKey.APTA_PROMOCION, ClientTagKey.RECURRENTE],
        excludeTags: [ClientTagKey.NO_SHOW_REITERADO],
      },
      NOW,
    ) as { AND: unknown[] };
    expect(where.AND).toContainEqual({
      tags: { some: { key: ClientTagKey.APTA_PROMOCION } },
    });
    expect(where.AND).toContainEqual({
      tags: { some: { key: ClientTagKey.RECURRENTE } },
    });
    expect(where.AND).toContainEqual({
      tags: { none: { key: ClientTagKey.NO_SHOW_REITERADO } },
    });
  });

  it('traduce las ventanas de visita a fechas relativas a hoy', () => {
    const where = buildAudienceWhere(
      { visitedWithinDays: 365, notVisitedForDays: 90 },
      NOW,
    ) as {
      AND: Array<{
        reservations?: {
          some?: { completedAt: { gte: Date } };
          none?: { completedAt: { gte: Date } };
        };
      }>;
    };
    const some = where.AND.find((item) => item.reservations?.some);
    const none = where.AND.find((item) => item.reservations?.none);
    expect(some?.reservations?.some?.completedAt.gte.toISOString()).toBe(
      '2025-11-10T15:00:00.000Z',
    );
    expect(none?.reservations?.none?.completedAt.gte.toISOString()).toBe(
      '2026-08-12T15:00:00.000Z',
    );
  });
});

describe('AudiencesService.preview', () => {
  function build(recent: string[] = []) {
    const count = jest.fn().mockResolvedValueOnce(4).mockResolvedValueOnce(7);
    if (recent.length > 0) count.mockResolvedValueOnce(3);
    count.mockResolvedValue(30);
    const findMany = jest
      .fn()
      .mockResolvedValue([{ id: 'a', name: 'Ana', phone: '+57300' }]);
    const prisma = { client: { client: { count, findMany } } };
    return {
      service: new AudiencesService(
        prisma as unknown as PrismaService,
        {
          recentlyContactedIds: jest.fn().mockResolvedValue(recent),
        } as unknown as MarketingFrequencyService,
      ),
      count,
    };
  }

  it('informa cuántas quedan fuera por no tener WhatsApp ni consentimiento', async () => {
    const { service } = build();
    const result = await service.preview({}, true, NOW);
    expect(result).toEqual({
      total: 30,
      excluded: { withoutWhatsapp: 4, withoutConsent: 7, recentlyMessaged: 0 },
      sample: [{ id: 'a', name: 'Ana', phone: '+57300' }],
    });
  });

  it('descuenta a quienes recibieron otro mensaje de marketing hace poco', async () => {
    const { service, count } = build(['c1', 'c2', 'c3']);
    const result = await service.preview({}, true, NOW);
    expect(result.excluded.recentlyMessaged).toBe(3);
    expect(result.total).toBe(30);
    expect(count).toHaveBeenCalledTimes(4);
  });

  it('si el mensaje no es de marketing no exige consentimiento', async () => {
    const { service, count } = build();
    const result = await service.preview({}, false, NOW);
    expect(result.excluded.withoutConsent).toBe(0);
    expect(count).toHaveBeenCalledTimes(2);
  });
});
