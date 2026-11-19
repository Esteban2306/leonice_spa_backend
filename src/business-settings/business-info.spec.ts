import {
  EVENT_DESCRIPTION_MAX,
  EVENT_NAME_MAX,
  EVENT_PRIZES_MAX,
} from '../promo-events/dto/promo-event.dto';
import { BusinessSettingsService } from './business-settings.service';
import {
  BUSINESS_INFO_MAPPING_RULES,
  buildBotBusinessInfo,
  businessInfoEventPayload,
} from './business-info';
import { EVENT_TYPES } from '../common/events/constants/event.types';
import { ConduitOutboxListener } from '../conduit/listeners/conduit-outbox.listener';
import type { PrismaService } from '../infrastructure/database/prisma.service';

const SETTINGS = {
  depositAmount: 50,
  depositInstructions: 'Nequi 300 000 0000 a nombre de Leonice.',
  depositPolicy: 'El anticipo separa el cupo.',
  cancellationPolicy: 'Cancelar con 24 horas.',
  address: 'Calle 1 # 2-3',
  additionalInfo: null,
};

const WINDOWS = [
  { dayOfWeek: 1, startMinute: 8 * 60, endMinute: 12 * 60 },
  { dayOfWeek: 1, startMinute: 14 * 60, endMinute: 18 * 60 },
  { dayOfWeek: 6, startMinute: 9 * 60, endMinute: 13 * 60 },
];

describe('payload del hook business.info.updated', () => {
  const payload = businessInfoEventPayload(
    buildBotBusinessInfo(SETTINGS, WINDOWS),
  );

  it('presenta el anticipo en pesos y el horario en una línea', () => {
    expect(payload.deposit_amount).toBe(`$${(50000).toLocaleString('es-CO')}`);
    expect(payload.schedule).toContain(
      'lunes 8:00 a. m. a 12:00 p. m. y 2:00 p. m. a 6:00 p. m.',
    );
    expect(payload.schedule).toContain('sábado 9:00 a. m. a 1:00 p. m.');
    expect(payload.schedule).toContain('domingo cerrado');
  });

  it('el WhatsApp de Leo nunca llega al bot: ni en los datos del negocio ni en el hook', () => {
    const info = buildBotBusinessInfo(
      { ...SETTINGS, ownerContactPhone: '+57 310 000 1122' } as never,
      WINDOWS,
    );
    expect(JSON.stringify(info)).not.toContain('1122');
    expect(JSON.stringify(payload)).not.toContain('1122');
    expect(Object.values(BUSINESS_INFO_MAPPING_RULES)).not.toContain(
      'negocio.whatsapp_de_leo',
    );
  });

  it('un dato borrado viaja como cadena vacía para que Conduit no conserve el anterior', () => {
    expect(payload.additional_info).toBe('');
    const cleared = businessInfoEventPayload(
      buildBotBusinessInfo(
        { ...SETTINGS, depositAmount: null, address: null },
        WINDOWS,
      ),
    );
    expect(cleared.deposit_amount).toBe('');
    expect(cleared.address).toBe('');
  });

  it('cada campo del payload tiene regla de mapeo hacia una variable negocio.* y viceversa', () => {
    expect(Object.keys(BUSINESS_INFO_MAPPING_RULES).sort()).toEqual(
      Object.keys(payload).sort(),
    );
    for (const target of Object.values(BUSINESS_INFO_MAPPING_RULES)) {
      expect(target).toMatch(/^negocio\.[a-z_]+$/);
    }
  });
});

describe('BusinessSettingsService.update', () => {
  it('guarda y avisa que la información del negocio cambió', async () => {
    const saved = { id: 'default', ...SETTINGS };
    const upsert = jest.fn().mockResolvedValue(saved);
    const publish = jest.fn();
    const service = new BusinessSettingsService(
      { client: { businessSettings: { upsert } } } as unknown as PrismaService,
      { publish } as never,
    );

    await expect(service.update({ address: 'Nueva' }, 'u1')).resolves.toBe(
      saved,
    );
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(EVENT_TYPES.BUSINESS_INFO_CHANGED, {
      source: 'settings',
    });
  });

  it('si guardar falla no avisa', async () => {
    const publish = jest.fn();
    const service = new BusinessSettingsService(
      {
        client: {
          businessSettings: {
            upsert: jest.fn().mockRejectedValue(new Error('db')),
          },
        },
      } as unknown as PrismaService,
      { publish } as never,
    );
    await expect(service.update({ address: 'x' })).rejects.toThrow('db');
    expect(publish).not.toHaveBeenCalled();
  });
});

describe('ConduitOutboxListener.handleBusinessInfoChanged', () => {
  it('encola business.info.updated con la información vigente', async () => {
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const listener = new ConduitOutboxListener(
      { enqueue } as never,
      {
        forBot: () => Promise.resolve(buildBotBusinessInfo(SETTINGS, WINDOWS)),
      } as never,
    );
    await listener.handleBusinessInfoChanged();
    expect(enqueue).toHaveBeenCalledWith(
      'business.info.updated',
      expect.objectContaining({
        address: 'Calle 1 # 2-3',
        deposit_instructions: SETTINGS.depositInstructions,
      }),
    );
  });

  it('los eventos vigentes llegan al bot y sin eventos el dato queda vacío', () => {
    const withEvent = businessInfoEventPayload(
      buildBotBusinessInfo(SETTINGS, WINDOWS, [
        {
          name: 'Rifa de aniversario',
          description: 'Por cada visita recibes una boleta para la rifa.',
          prizes: 'Kit de productos y un ritual completo',
          endsAt: new Date('2026-11-30T23:59:59-05:00'),
        },
      ]),
    );
    expect(withEvent.active_events).toBe(
      'Rifa de aniversario (hasta el 30 de noviembre): Por cada visita recibes una boleta para la rifa. Premios: Kit de productos y un ritual completo',
    );
    expect(BUSINESS_INFO_MAPPING_RULES.active_events).toBe(
      'negocio.eventos_vigentes',
    );
    expect(
      businessInfoEventPayload(buildBotBusinessInfo(SETTINGS, WINDOWS))
        .active_events,
    ).toBe('');
  });

  it('un evento con todos sus textos al máximo cabe en los 500 caracteres que el bot lee de cada dato', () => {
    const payload = businessInfoEventPayload(
      buildBotBusinessInfo(SETTINGS, WINDOWS, [
        {
          name: 'n'.repeat(EVENT_NAME_MAX),
          description: 'd'.repeat(EVENT_DESCRIPTION_MAX),
          prizes: 'p'.repeat(EVENT_PRIZES_MAX),
          endsAt: new Date('2026-09-30T23:59:59-05:00'),
        },
      ]),
    );
    expect(payload.active_events.length).toBeLessThanOrEqual(500);
  });
});
