import { EVENT_TYPES } from '../../common/events/constants/event.types';
import {
  parseReceiptContact,
  RECEIPT_RETRIES_THRESHOLD,
  ReceiptAlertsService,
} from './receipt-alerts.service';
import { describeReceiptReasons } from './receipt-reason-labels';

function build() {
  const store = new Map<string, unknown>();
  const cache = {
    get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: jest.fn((key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    delete: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
    setIfAbsent: jest.fn((key: string, value: unknown) => {
      if (store.has(key)) return Promise.resolve(false);
      store.set(key, value);
      return Promise.resolve(true);
    }),
  };
  const clients = {
    findByPhone: jest.fn().mockResolvedValue({ name: 'Angélica' }),
  };
  const eventBus = { publishAsync: jest.fn().mockResolvedValue([true]) };
  const service = new ReceiptAlertsService(
    cache as never,
    clients as never,
    eventBus as never,
  );
  return { service, cache, clients, eventBus };
}

const contact = { phone: '+573001112233', key: '573001112233' };

describe('parseReceiptContact', () => {
  it('normaliza un teléfono de WhatsApp', () => {
    expect(parseReceiptContact('573001112233')).toEqual({
      phone: '+573001112233',
      key: '573001112233',
    });
  });

  it('un chat con LID no tiene teléfono pero sí una clave propia', () => {
    expect(parseReceiptContact('98765432101234@lid')).toEqual({
      phone: null,
      key: 'lid:98765432101234',
    });
  });

  it.each([null, undefined, '', 'sin-digitos'])(
    'sin contacto utilizable (%s) devuelve null',
    (value) => {
      expect(parseReceiptContact(value)).toBeNull();
    },
  );
});

describe('ReceiptAlertsService.invalid', () => {
  it('no avisa con el primer rechazo', async () => {
    const { service, eventBus } = build();

    const attempts = await service.invalid(contact, 'v1', [
      'AMOUNT_GTE_FAILED',
    ]);

    expect(attempts).toBe(1);
    expect(eventBus.publishAsync).not.toHaveBeenCalled();
  });

  it(`avisa una sola vez al llegar a ${RECEIPT_RETRIES_THRESHOLD} rechazos seguidos`, async () => {
    const { service, eventBus } = build();

    await service.invalid(contact, 'v1', ['AMOUNT_GTE_FAILED']);
    await service.invalid(contact, 'v2', ['DESTINATION_WITHIN_FAILED']);
    await service.invalid(contact, 'v3', ['DESTINATION_WITHIN_FAILED']);

    expect(eventBus.publishAsync).toHaveBeenCalledTimes(1);
    expect(eventBus.publishAsync).toHaveBeenCalledWith(
      EVENT_TYPES.CONDUIT_RECEIPT_ISSUE,
      {
        kind: 'RETRIES',
        phone: '+573001112233',
        clientName: 'Angélica',
        reason: 'la cuenta destino no coincide con la del spa',
        attempts: 2,
        verificationId: 'v2',
      },
    );
  });

  it('un comprobante bueno corta la racha', async () => {
    const { service, eventBus } = build();

    await service.invalid(contact, 'v1', ['AMOUNT_GTE_FAILED']);
    await service.valid(contact);
    await service.invalid(contact, 'v2', ['AMOUNT_GTE_FAILED']);

    expect(eventBus.publishAsync).not.toHaveBeenCalled();
  });

  it('cada clienta cuenta aparte', async () => {
    const { service, eventBus } = build();
    const other = { phone: '+573009998877', key: '573009998877' };

    await service.invalid(contact, 'v1', []);
    await service.invalid(other, 'v2', []);

    expect(eventBus.publishAsync).not.toHaveBeenCalled();
  });

  it('un chat sin teléfono avisa sin buscar a la clienta', async () => {
    const { service, clients, eventBus } = build();
    const lid = { phone: null, key: 'lid:1' };

    await service.invalid(lid, 'v1', []);
    await service.invalid(lid, 'v2', []);

    expect(clients.findByPhone).not.toHaveBeenCalled();
    expect(eventBus.publishAsync).toHaveBeenCalledWith(
      EVENT_TYPES.CONDUIT_RECEIPT_ISSUE,
      expect.objectContaining({ phone: null, clientName: null }),
    );
  });

  it('si el aviso falla no rompe el conteo ni lanza', async () => {
    const { service, eventBus } = build();
    eventBus.publishAsync.mockRejectedValue(new Error('cola caída'));

    await service.invalid(contact, 'v1', []);
    await expect(service.invalid(contact, 'v2', [])).resolves.toBe(2);
  });
});

describe('ReceiptAlertsService.review', () => {
  it('avisa de inmediato con el motivo en español y sin datos del comprobante', async () => {
    const { service, eventBus } = build();

    await service.review(contact, 'v9', ['DESTINATION_MISSING']);

    expect(eventBus.publishAsync).toHaveBeenCalledWith(
      EVENT_TYPES.CONDUIT_RECEIPT_ISSUE,
      {
        kind: 'REVIEW',
        phone: '+573001112233',
        clientName: 'Angélica',
        reason: 'no se alcanzó a leer la cuenta destino',
        attempts: 1,
        verificationId: 'v9',
      },
    );
  });
});

describe('ReceiptAlertsService.alreadySeen', () => {
  it('la segunda entrega del mismo evento se reconoce como duplicada', async () => {
    const { service } = build();

    expect(await service.alreadySeen('evt-1')).toBe(false);
    expect(await service.alreadySeen('evt-1')).toBe(true);
  });

  it('sin id de evento no se descarta nada', async () => {
    const { service } = build();

    expect(await service.alreadySeen(undefined)).toBe(false);
    expect(await service.alreadySeen(undefined)).toBe(false);
  });

  it('si Redis no responde se procesa (mejor un aviso repetido que perderlo)', async () => {
    const { service, cache } = build();
    (cache.setIfAbsent as jest.Mock).mockResolvedValue(null);

    expect(await service.alreadySeen('evt-2')).toBe(false);
  });
});

describe('describeReceiptReasons', () => {
  it('une los motivos sin repetirlos', () => {
    expect(
      describeReceiptReasons([
        'AMOUNT_GTE_FAILED',
        'DATE_WITHIN_DAYS_FAILED',
        'AMOUNT_GTE_FAILED',
      ]),
    ).toBe(
      'el monto es menor al abono mínimo; la fecha del comprobante es muy antigua',
    );
  });

  it('con códigos desconocidos o vacíos usa un texto genérico', () => {
    expect(describeReceiptReasons([])).toBe(
      'el sistema no pudo validarlo por sí solo',
    );
    expect(describeReceiptReasons(['ALGO_NUEVO'])).toBe(
      'el sistema no pudo validarlo por sí solo',
    );
  });
});
