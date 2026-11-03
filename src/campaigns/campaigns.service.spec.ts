import { BadRequestException, ConflictException } from '@nestjs/common';
import { CampaignStatus } from '@prisma/client';
import { AudiencesService } from '../audiences/audiences.service';
import { ConduitTemplateResolver } from '../conduit/templates/conduit-template-resolver';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { CampaignsService } from './campaigns.service';

const NOW = new Date('2026-11-09T15:00:00Z');
const PROMO_ID = '3f1c2c1e-9d52-4a5e-8d6d-0b8f9d3b1111';

const members = [
  { id: 'a', name: 'Ana', phone: '+571', lastVisitAt: new Date('2026-09-01Z') },
  { id: 'b', name: 'Bea', phone: '+572', lastVisitAt: new Date('2026-08-01Z') },
  {
    id: 'c',
    name: 'Cata',
    phone: '+573',
    lastVisitAt: new Date('2026-07-01Z'),
  },
];

function build(
  overrides: {
    configured?: boolean;
    promotion?: unknown;
    members?: typeof members;
    status?: CampaignStatus;
  } = {},
) {
  const created: unknown[] = [];
  const prisma = {
    client: {
      campaignSettings: { findUnique: jest.fn().mockResolvedValue(null) },
      campaignRecipient: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      promotion: {
        findUnique: jest.fn().mockResolvedValue(
          'promotion' in overrides
            ? overrides.promotion
            : {
                isActive: true,
                endsAt: new Date('2026-11-30T00:00:00Z'),
              },
        ),
      },
      campaign: {
        create: jest.fn().mockImplementation((args: unknown) => {
          created.push(args);
          return Promise.resolve({ id: 'new' });
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'new',
          name: 'X',
          templateCode: 'PROMOTION_BROADCAST',
          promotionId: PROMO_ID,
          audience: {},
          pace: 'EQUILIBRADO',
          status: overrides.status ?? CampaignStatus.RUNNING,
          pausedReason: null,
          totalRecipients: 3,
          startsAt: NOW,
          finishedAt: null,
          createdAt: NOW,
        }),
        update: jest.fn(),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    },
  };
  const audiences = {
    members: jest.fn().mockResolvedValue(overrides.members ?? members),
    preview: jest.fn().mockResolvedValue({
      total: 3,
      excluded: { withoutWhatsapp: 0, withoutConsent: 0 },
      sample: [],
    }),
  };
  const templates = {
    describe: jest.fn().mockResolvedValue([
      {
        name: 'PROMOTION_BROADCAST',
        configured: overrides.configured ?? true,
      },
    ]),
  };
  const service = new CampaignsService(
    prisma as unknown as PrismaService,
    audiences as unknown as AudiencesService,
    templates as unknown as ConduitTemplateResolver,
  );
  return { service, prisma, created };
}

const dto = {
  name: 'Promo noviembre',
  templateCode: 'PROMOTION_BROADCAST',
  promotionId: PROMO_ID,
  filter: {},
  pace: 'EQUILIBRADO' as const,
};

describe('CampaignsService.create', () => {
  it('crea la campaña con un horario de envío distinto para cada clienta', async () => {
    const { service, created } = build();
    await service.create(dto, NOW);
    const data = (
      created[0] as {
        data: {
          totalRecipients: number;
          recipients: {
            create: Array<{ clientId: string; scheduledAt: Date }>;
          };
        };
      }
    ).data;
    expect(data.totalRecipients).toBe(3);
    const rows = data.recipients.create;
    expect(rows.map((row) => row.clientId).sort()).toEqual(['a', 'b', 'c']);
    expect(new Set(rows.map((row) => row.scheduledAt.getTime())).size).toBe(3);
  });

  it('no deja anunciar con una plantilla que no sea difundible', async () => {
    const { service } = build();
    await expect(
      service.create({ ...dto, templateCode: 'CLIENT_RESCHEDULED' }, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('exige una promoción vigente cuando la plantilla la anuncia', async () => {
    const { service } = build({ promotion: null });
    await expect(service.create(dto, NOW)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const noPromo = build();
    await expect(
      noPromo.service.create({ ...dto, promotionId: undefined }, NOW),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza lanzar si la plantilla no existe en Conduit o la audiencia está vacía', async () => {
    const missing = build({ configured: false });
    await expect(missing.service.create(dto, NOW)).rejects.toBeInstanceOf(
      ConflictException,
    );
    const empty = build({ members: [] });
    await expect(empty.service.create(dto, NOW)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('CampaignsService control', () => {
  it('solo pausa una campaña en curso y solo reanuda una pausada', async () => {
    const running = build({ status: CampaignStatus.RUNNING });
    await running.service.pause('new');
    expect(running.prisma.client.campaign.update).toHaveBeenCalled();
    await expect(running.service.resume('new', NOW)).rejects.toBeInstanceOf(
      ConflictException,
    );
    const paused = build({ status: CampaignStatus.PAUSED });
    await expect(paused.service.pause('new')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('al cancelar descarta los envíos pendientes', async () => {
    const { service, prisma } = build();
    await service.cancel('new', NOW);
    expect(prisma.client.campaignRecipient.updateMany).toHaveBeenCalledWith({
      where: { campaignId: 'new', status: 'PENDING' },
      data: { status: 'SKIPPED', errorMessage: 'Campaña cancelada' },
    });
  });
});
