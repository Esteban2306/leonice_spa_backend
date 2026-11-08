import { CampaignRecipientStatus, CampaignStatus } from '@prisma/client';
import { ConduitApiClient } from '../conduit/client/conduit-api.client';
import { ConduitTemplateResolver } from '../conduit/templates/conduit-template-resolver';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { SafeCacheService } from '../infrastructure/redis/safe-cache.service';
import { CampaignRunnerService } from './campaign-runner.service';
import type { MarketingFrequencyService } from '../marketing/marketing-frequency.service';
import type { ConduitSystemPauseService } from '../conduit/pause/conduit-system-pause.service';
import { CampaignsService } from './campaigns.service';

const objectContaining = (value: object): unknown =>
  expect.objectContaining(value);

const MONDAY_10AM = new Date('2026-11-09T15:00:00Z');
const MONDAY_9PM = new Date('2026-11-10T02:00:00Z');

const campaign = {
  id: 'camp',
  templateCode: 'REACTIVATION',
  promotionId: null,
  marketing: true,
  pace: 'EQUILIBRADO',
};

const dueRecipient = {
  id: 'rec',
  clientId: 'client',
  attempts: 0,
  campaign,
};

const client = {
  name: 'Ana',
  phone: '+573001112233',
  whatsappJid: '573001112233@s.whatsapp.net',
  consentRecords: [{ id: 'c1' }],
  reservations: [{ completedAt: new Date('2026-09-01T15:00:00Z') }],
};

function build(
  overrides: {
    due?: unknown;
    sentToday?: number;
    sentLastHour?: number;
    lastSentAt?: Date | null;
    client?: unknown;
    send?: jest.Mock;
    templateId?: string | null;
    breaker?: Array<{ status: CampaignRecipientStatus }>;
    blockedUntil?: Date | null;
    paused?: boolean;
  } = {},
) {
  const update = jest.fn().mockResolvedValue({});
  const count = jest
    .fn()
    .mockImplementation((args: { where: { status?: unknown } }) =>
      args.where.status === CampaignRecipientStatus.PENDING
        ? Promise.resolve(2)
        : Promise.resolve(overrides.sentLastHour ?? 0),
    );
  const prisma = {
    client: {
      campaignRecipient: {
        findFirst: jest
          .fn()
          .mockImplementation((args: { include?: unknown }) =>
            args.include
              ? Promise.resolve(
                  'due' in overrides ? overrides.due : dueRecipient,
                )
              : Promise.resolve(
                  overrides.lastSentAt
                    ? { sentAt: overrides.lastSentAt }
                    : null,
                ),
          ),
        findMany: jest.fn().mockResolvedValue(overrides.breaker ?? []),
        count,
        update,
      },
      campaign: { updateMany: jest.fn() },
      client: {
        findUnique: jest
          .fn()
          .mockResolvedValue('client' in overrides ? overrides.client : client),
      },
      promotion: { findUnique: jest.fn() },
    },
  };
  const campaigns = {
    getSettings: jest.fn().mockResolvedValue({
      sendWindows: [{ startMinute: 480, endMinute: 690 }],
      maxPerDay: 90,
    }),
    sentToday: jest.fn().mockResolvedValue(overrides.sentToday ?? 0),
    pause: jest.fn().mockResolvedValue({}),
  };
  const send =
    overrides.send ?? jest.fn().mockResolvedValue({ delivered: true });
  const conduit = { sendWhatsappMessage: send };
  const templates = {
    resolve: jest
      .fn()
      .mockResolvedValue(
        'templateId' in overrides ? overrides.templateId : 'tpl-1',
      ),
  };
  const cache = { setIfAbsent: jest.fn() };
  const frequency = {
    blockedUntil: jest.fn().mockResolvedValue(overrides.blockedUntil ?? null),
  };
  const runner = new CampaignRunnerService(
    prisma as unknown as PrismaService,
    campaigns as unknown as CampaignsService,
    conduit as unknown as ConduitApiClient,
    templates as unknown as ConduitTemplateResolver,
    cache as unknown as SafeCacheService,
    frequency as unknown as MarketingFrequencyService,
    {
      isPaused: jest.fn().mockResolvedValue(overrides.paused ?? false),
    } as unknown as ConduitSystemPauseService,
  );
  return { runner, prisma, campaigns, send, update };
}

describe('CampaignRunnerService.tick', () => {
  it('con el sistema en pausa no envía nada y deja la campaña como está', async () => {
    const { runner, send, update } = build({ paused: true });
    expect(await runner.tick(MONDAY_10AM)).toBe('blocked');
    expect(send).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('fuera de las franjas de envío no manda nada', async () => {
    const { runner, send } = build();
    expect(await runner.tick(MONDAY_9PM)).toBe('idle');
    expect(send).not.toHaveBeenCalled();
  });

  it('sin envíos vencidos no hace nada', async () => {
    const { runner, send } = build({ due: null });
    expect(await runner.tick(MONDAY_10AM)).toBe('idle');
    expect(send).not.toHaveBeenCalled();
  });

  it('envía un solo mensaje por turno y lo marca como enviado', async () => {
    const { runner, send, update } = build();
    expect(await runner.tick(MONDAY_10AM)).toBe('sent');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '+573001112233',
        templateId: 'tpl-1',
        idempotencyKey: 'campaign:camp:client',
        variables: { nombre: 'Ana', dias: '69' },
      }),
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: 'rec' },
      data: objectContaining({
        status: CampaignRecipientStatus.SENT,
        sentAt: MONDAY_10AM,
      }),
    });
  });

  it('respeta la separación mínima con el último envío', async () => {
    const { runner, send } = build({
      lastSentAt: new Date(MONDAY_10AM.getTime() - 10_000),
    });
    expect(await runner.tick(MONDAY_10AM)).toBe('blocked');
    expect(send).not.toHaveBeenCalled();
  });

  it('respeta el tope por hora y el tope diario', async () => {
    const hourly = build({ sentLastHour: 30 });
    expect(await hourly.runner.tick(MONDAY_10AM)).toBe('blocked');
    const daily = build({ sentToday: 90 });
    expect(await daily.runner.tick(MONDAY_10AM)).toBe('blocked');
    expect(hourly.send).not.toHaveBeenCalled();
    expect(daily.send).not.toHaveBeenCalled();
  });

  it('omite a quien ya no tiene consentimiento de marketing y no envía', async () => {
    const { runner, send, update } = build({
      client: { ...client, consentRecords: [] },
    });
    await runner.tick(MONDAY_10AM);
    expect(send).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'rec' },
      data: objectContaining({
        status: CampaignRecipientStatus.SKIPPED,
        errorMessage: 'Sin consentimiento de marketing',
      }),
    });
  });

  it('omite a quien ya recibió otro mensaje de marketing dentro del plazo', async () => {
    const { runner, send, update } = build({
      blockedUntil: new Date('2026-11-30T12:00:00Z'),
    });
    await runner.tick(MONDAY_10AM);
    expect(send).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'rec' },
      data: objectContaining({
        status: CampaignRecipientStatus.SKIPPED,
        errorMessage: expect.stringContaining('30 de noviembre') as string,
      }),
    });
  });

  it('un fallo pasajero reprograma el envío en vez de descartarlo', async () => {
    const { runner, update } = build({
      send: jest.fn().mockResolvedValue({ delivered: false, reason: 'caído' }),
    });
    await runner.tick(MONDAY_10AM);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'rec' },
      data: objectContaining({
        attempts: 1,
        scheduledAt: new Date(MONDAY_10AM.getTime() + 5 * 60_000),
      }),
    });
  });

  it('tres fallos definitivos seguidos pausan la campaña', async () => {
    const failed = { status: CampaignRecipientStatus.FAILED };
    const { runner, campaigns } = build({
      send: jest
        .fn()
        .mockResolvedValue({ delivered: false, permanent: true, reason: 'x' }),
      breaker: [failed, failed, failed],
    });
    await runner.tick(MONDAY_10AM);
    expect(campaigns.pause).toHaveBeenCalledWith(
      'camp',
      expect.stringContaining('3 envíos seguidos fallaron'),
    );
  });

  it('si la plantilla no está creada en Conduit pausa la campaña sin enviar', async () => {
    const { runner, campaigns, send } = build({ templateId: null });
    await runner.tick(MONDAY_10AM);
    expect(send).not.toHaveBeenCalled();
    expect(campaigns.pause).toHaveBeenCalledWith(
      'camp',
      'La plantilla no está creada en Conduit',
    );
  });

  it('al terminar el último envío pendiente cierra la campaña', async () => {
    const { runner, prisma } = build();
    prisma.client.campaignRecipient.count = jest.fn().mockResolvedValue(0);
    await runner.tick(MONDAY_10AM);
    expect(prisma.client.campaign.updateMany).toHaveBeenCalledWith({
      where: { id: 'camp', status: CampaignStatus.RUNNING },
      data: { status: CampaignStatus.COMPLETED, finishedAt: MONDAY_10AM },
    });
  });
});
