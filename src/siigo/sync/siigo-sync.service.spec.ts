import { ConfigService } from '@nestjs/config';
import { PaymentMethod, SiigoSync, SiigoSyncStatus } from '@prisma/client';
import { SiigoVoucherBody } from '../client/siigo.client';
import { FakeSiigoClient } from '../client/siigo-fake.client';
import { SiigoError } from '../client/siigo.errors';
import { buildSiigoIncomePayload } from '../domain/siigo-income-payload';
import { SiigoSyncService } from './siigo-sync.service';

const NOW = new Date('2026-11-20T15:00:00.000Z');

const env: Record<string, string> = {
  SIIGO_ENABLED: 'true',
  SIIGO_USERNAME: 'u',
  SIIGO_ACCESS_KEY: 'k',
  SIIGO_PARTNER_ID: 'leonicespa',
  SIIGO_RECEIPT_DOCUMENT_ID: '170674',
  SIIGO_INCOME_CONCEPT_ID: '174',
  SIIGO_PAYMENT_CASH_ID: '3719',
  SIIGO_PAYMENT_TRANSFER_ID: '3720',
  SIIGO_CUSTOMER_IDENTIFICATION: '222222222222',
};

const configOf = (values: Record<string, string>) =>
  ({
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  }) as unknown as ConfigService;

let seq = 0;
function row(
  parts: { cash: number; transfer: number; advance: number },
  overrides: Partial<SiigoSync> = {},
): SiigoSync {
  seq += 1;
  const reservationId = `0f8fad5b-d9cb-469f-a165-7086772895${String(seq).padStart(2, '0')}`;
  return {
    id: `sync-${seq}`,
    reservationId,
    status: SiigoSyncStatus.PENDIENTE,
    payload: buildSiigoIncomePayload({
      reservationId,
      completedAt: NOW,
      treatment: { id: 't1', name: 'Alisado' },
      price: parts.cash + parts.transfer + parts.advance,
      paymentMethod: PaymentMethod.MIXTO,
      ...parts,
    }) as unknown as SiigoSync['payload'],
    attempts: 0,
    lastError: null,
    siigoDocumentId: null,
    receipts: null,
    createdAt: new Date(NOW.getTime() - 3_600_000 + seq),
    updatedAt: new Date(NOW.getTime() - 3_600_000),
    syncedAt: null,
    ...overrides,
  };
}

function memoryPrisma(rows: SiigoSync[]) {
  const apply = (target: SiigoSync, data: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(data)) {
      if (
        value &&
        typeof value === 'object' &&
        ('increment' in value || 'decrement' in value)
      ) {
        const delta = value as { increment?: number; decrement?: number };
        (target as unknown as Record<string, number>)[key] +=
          (delta.increment ?? 0) - (delta.decrement ?? 0);
      } else {
        (target as unknown as Record<string, unknown>)[key] = value;
      }
    }
    target.updatedAt = new Date(NOW.getTime() + 1);
  };
  const find = (id: string) => rows.find((r) => r.id === id)!;
  return {
    client: {
      siigoSync: {
        findMany: ({ where }: { where: { status: { in: string[] } } }) =>
          Promise.resolve(
            rows
              .filter((r) => where.status.in.includes(r.status))
              .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
              .map((r) => ({ ...r })),
          ),
        updateMany: ({
          where,
          data,
        }: {
          where: { id: string; status: string; updatedAt: Date };
          data: Record<string, unknown>;
        }) => {
          const target = find(where.id);
          if (
            target.status !== where.status ||
            target.updatedAt.getTime() !== where.updatedAt.getTime()
          ) {
            return Promise.resolve({ count: 0 });
          }
          apply(target, data);
          return Promise.resolve({ count: 1 });
        },
        findUnique: ({ where }: { where: { id: string } }) =>
          Promise.resolve({ ...find(where.id) }),
        update: ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          apply(find(where.id), data);
          return Promise.resolve({ ...find(where.id) });
        },
      },
    },
  };
}

class SecondCallFails extends FakeSiigoClient {
  private calls = 0;

  override createVoucher(body: SiigoVoucherBody, idempotencyKey: string) {
    this.calls += 1;
    if (this.calls === 2) {
      return Promise.reject(new SiigoError('UNAVAILABLE', 'caído'));
    }
    return super.createVoucher(body, idempotencyKey);
  }
}

function build(
  rows: SiigoSync[],
  values = env,
  siigo: FakeSiigoClient = new FakeSiigoClient(),
) {
  const service = new SiigoSyncService(
    memoryPrisma(rows) as never,
    configOf(values),
    siigo,
  );
  return { service, siigo, rows };
}

describe('SiigoSyncService.sweep', () => {
  it('no hace nada mientras Siigo está desactivado', async () => {
    const { service, siigo, rows } = build(
      [row({ cash: 100, transfer: 0, advance: 0 })],
      { ...env, SIIGO_ENABLED: 'false' },
    );

    const summary = await service.sweep(NOW);

    expect(summary.skipped).toBe(true);
    expect(siigo.vouchers).toHaveLength(0);
    expect(rows[0].status).toBe(SiigoSyncStatus.PENDIENTE);
  });

  it('no envía nada si faltan las equivalencias con Siigo', async () => {
    const { SIIGO_PAYMENT_CASH_ID: _omit, ...partial } = env;
    const { service, siigo, rows } = build(
      [row({ cash: 100, transfer: 0, advance: 0 })],
      partial,
    );

    const summary = await service.sweep(NOW);

    expect(summary.skipped).toBe(true);
    expect(siigo.vouchers).toHaveLength(0);
    expect(rows[0].attempts).toBe(0);
  });

  it('crea el recibo y marca la cita como sincronizada', async () => {
    const { service, siigo, rows } = build([
      row({ cash: 250, transfer: 0, advance: 0 }),
    ]);

    const summary = await service.sweep(NOW);

    expect(summary.synced).toBe(1);
    expect(siigo.vouchers).toHaveLength(1);
    expect(rows[0].status).toBe(SiigoSyncStatus.SINCRONIZADO);
    expect(rows[0].syncedAt).not.toBeNull();
    expect(rows[0].lastError).toBeNull();
    expect(rows[0].siigoDocumentId).toBe('RC-1-1');
  });

  it('un pago mixto crea dos recibos con llaves distintas', async () => {
    const { service, siigo, rows } = build([
      row({ cash: 150, transfer: 0, advance: 100 }),
    ]);

    await service.sweep(NOW);

    expect(siigo.vouchers).toHaveLength(2);
    const keys = siigo.vouchers.map((v) => v.idempotencyKey);
    expect(new Set(keys).size).toBe(2);
    expect(rows[0].siigoDocumentId).toBe('RC-1-1, RC-1-2');
  });

  it('un fallo temporal deja la cita pendiente y conserva el error', async () => {
    const { service, siigo, rows } = build([
      row({ cash: 100, transfer: 0, advance: 0 }),
    ]);
    siigo.failNext(new SiigoError('TIMEOUT', 'Siigo no respondió'));

    const summary = await service.sweep(NOW);

    expect(summary.retried).toBe(1);
    expect(rows[0].status).toBe(SiigoSyncStatus.PENDIENTE);
    expect(rows[0].attempts).toBe(1);
    expect(rows[0].lastError).toContain('Siigo no respondió');
  });

  it('no reintenta antes de que pase la espera', async () => {
    const { service, siigo, rows } = build([
      row({ cash: 100, transfer: 0, advance: 0 }),
    ]);
    siigo.failNext(new SiigoError('TIMEOUT', 'x'));
    await service.sweep(NOW);

    const early = await service.sweep(new Date(NOW.getTime() + 30_000));
    expect(early.synced).toBe(0);
    expect(rows[0].attempts).toBe(1);

    const later = await service.sweep(new Date(NOW.getTime() + 61_000));
    expect(later.synced).toBe(1);
    expect(rows[0].status).toBe(SiigoSyncStatus.SINCRONIZADO);
  });

  it('un rechazo de validación bloquea la cita', async () => {
    const { service, siigo, rows } = build([
      row({ cash: 100, transfer: 0, advance: 0 }),
    ]);
    siigo.failNext(
      new SiigoError('VALIDATION', 'Concepto inexistente', 400, [
        { code: 'invalid_value', message: 'income.id', params: [] },
      ]),
    );

    const summary = await service.sweep(NOW);

    expect(summary.blocked).toBe(1);
    expect(rows[0].status).toBe(SiigoSyncStatus.BLOQUEADO);
    expect(rows[0].lastError).toContain('invalid_value');
  });

  it('un error de credenciales pausa el barrido sin gastar intentos', async () => {
    const { service, siigo, rows } = build([
      row({ cash: 100, transfer: 0, advance: 0 }),
      row({ cash: 100, transfer: 0, advance: 0 }),
    ]);
    siigo.failNext(new SiigoError('AUTH', 'Credenciales inválidas', 401));

    const summary = await service.sweep(NOW);

    expect(summary.paused).toBe(true);
    expect(rows.map((r) => r.status)).toEqual([
      SiigoSyncStatus.PENDIENTE,
      SiigoSyncStatus.PENDIENTE,
    ]);
    expect(rows.map((r) => r.attempts)).toEqual([0, 0]);
    expect(siigo.vouchers).toHaveLength(0);
  });

  it('si falla el segundo recibo, el reintento no repite el primero', async () => {
    const { service, siigo, rows } = build(
      [row({ cash: 150, transfer: 0, advance: 100 })],
      env,
      new SecondCallFails(),
    );

    await service.sweep(NOW);
    expect(rows[0].status).toBe(SiigoSyncStatus.PENDIENTE);
    expect(siigo.vouchers).toHaveLength(1);

    await service.sweep(new Date(NOW.getTime() + 61_000));
    expect(siigo.vouchers).toHaveLength(2);
    expect(rows[0].status).toBe(SiigoSyncStatus.SINCRONIZADO);
  });

  it('retoma un envío que quedó colgado', async () => {
    const stale = row(
      { cash: 100, transfer: 0, advance: 0 },
      {
        status: SiigoSyncStatus.ENVIANDO,
        attempts: 1,
        updatedAt: new Date(NOW.getTime() - 11 * 60_000),
      },
    );
    const { service, rows } = build([stale]);

    await service.sweep(NOW);

    expect(rows[0].status).toBe(SiigoSyncStatus.SINCRONIZADO);
  });

  it('no toca las citas ya sincronizadas, fallidas ni bloqueadas', async () => {
    const { service, siigo } = build([
      row(
        { cash: 100, transfer: 0, advance: 0 },
        { status: SiigoSyncStatus.SINCRONIZADO },
      ),
      row(
        { cash: 100, transfer: 0, advance: 0 },
        { status: SiigoSyncStatus.FALLIDO },
      ),
      row(
        { cash: 100, transfer: 0, advance: 0 },
        { status: SiigoSyncStatus.BLOQUEADO },
      ),
    ]);

    await service.sweep(NOW);

    expect(siigo.vouchers).toHaveLength(0);
  });

  it('respeta el límite de solicitudes por barrido y deja el resto para el siguiente', async () => {
    const many = Array.from({ length: 95 }, () =>
      row({ cash: 100, transfer: 0, advance: 0 }),
    );
    const { service, siigo, rows } = build(many);

    const summary = await service.sweep(NOW);

    expect(siigo.vouchers).toHaveLength(90);
    expect(summary.paused).toBe(true);
    expect(
      rows.filter((r) => r.status === SiigoSyncStatus.PENDIENTE),
    ).toHaveLength(5);
  });

  it('una cita sin nada que registrar queda sincronizada sin llamar a Siigo', async () => {
    const { service, siigo, rows } = build([
      row({ cash: 0, transfer: 0, advance: 0 }),
    ]);

    await service.sweep(NOW);

    expect(siigo.vouchers).toHaveLength(0);
    expect(rows[0].status).toBe(SiigoSyncStatus.SINCRONIZADO);
    expect(rows[0].siigoDocumentId).toBeNull();
  });
});
