import { SiigoSyncStatus } from '@prisma/client';
import { SiigoError } from '../client/siigo.errors';
import {
  SIIGO_MAX_ATTEMPTS,
  SIIGO_STALE_SENDING_MS,
  decideFailure,
  describeFailure,
  isDue,
  retryDelayMs,
} from './siigo-sync.policy';

const now = new Date('2026-11-20T12:00:00.000Z');
const ago = (ms: number) => new Date(now.getTime() - ms);

describe('retryDelayMs', () => {
  it('crece de forma exponencial y se detiene en 30 minutos', () => {
    expect(retryDelayMs(1)).toBe(60_000);
    expect(retryDelayMs(2)).toBe(120_000);
    expect(retryDelayMs(3)).toBe(240_000);
    expect(retryDelayMs(20)).toBe(30 * 60_000);
  });
});

describe('decideFailure', () => {
  it.each(['RATE_LIMIT', 'TIMEOUT', 'UNAVAILABLE'] as const)(
    '%s se reintenta',
    (kind) => {
      expect(decideFailure(new SiigoError(kind, 'x'), 1)).toBe('RETRY');
    },
  );

  it('al agotar los intentos pasa a fallido', () => {
    expect(
      decideFailure(new SiigoError('TIMEOUT', 'x'), SIIGO_MAX_ATTEMPTS),
    ).toBe('FAIL');
  });

  it.each(['AUTH', 'NOT_CONFIGURED'] as const)(
    '%s pausa el barrido sin gastar intentos',
    (kind) => {
      expect(decideFailure(new SiigoError(kind, 'x'), 1)).toBe('PAUSE');
    },
  );

  it.each(['VALIDATION', 'DUPLICATE', 'UNKNOWN'] as const)(
    '%s bloquea para revisión manual',
    (kind) => {
      expect(decideFailure(new SiigoError(kind, 'x'), 1)).toBe('BLOCK');
    },
  );

  it('un error propio inesperado bloquea', () => {
    expect(decideFailure(new Error('boom'), 1)).toBe('BLOCK');
  });
});

describe('isDue', () => {
  it('un pendiente sin intentos se envía de inmediato', () => {
    expect(
      isDue(
        {
          status: SiigoSyncStatus.PENDIENTE,
          attempts: 0,
          updatedAt: ago(0),
        },
        now,
      ),
    ).toBe(true);
  });

  it('un pendiente reintentado espera su espera exponencial', () => {
    const row = { status: SiigoSyncStatus.PENDIENTE, attempts: 2 };
    expect(isDue({ ...row, updatedAt: ago(119_000) }, now)).toBe(false);
    expect(isDue({ ...row, updatedAt: ago(120_000) }, now)).toBe(true);
  });

  it('un envío en curso solo se retoma si quedó colgado', () => {
    const row = { status: SiigoSyncStatus.ENVIANDO, attempts: 1 };
    expect(isDue({ ...row, updatedAt: ago(60_000) }, now)).toBe(false);
    expect(isDue({ ...row, updatedAt: ago(SIIGO_STALE_SENDING_MS) }, now)).toBe(
      true,
    );
  });

  it.each([
    SiigoSyncStatus.SINCRONIZADO,
    SiigoSyncStatus.FALLIDO,
    SiigoSyncStatus.BLOQUEADO,
  ])('%s nunca se reenvía solo', (status) => {
    expect(isDue({ status, attempts: 1, updatedAt: ago(10 ** 9) }, now)).toBe(
      false,
    );
  });
});

describe('describeFailure', () => {
  it('incluye los códigos de Siigo y no pasa de 500 caracteres', () => {
    const error = new SiigoError('VALIDATION', 'Rechazado', 400, [
      { code: 'invalid_value', message: 'Valor inválido', params: [] },
    ]);
    expect(describeFailure(error)).toBe(
      'Rechazado | invalid_value: Valor inválido',
    );
    expect(describeFailure(new Error('x'.repeat(900)))).toHaveLength(500);
  });
});
