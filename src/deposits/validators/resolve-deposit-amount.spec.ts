import { DepositCoverage } from '@prisma/client';
import { resolveDepositAmount } from './resolve-deposit-amount';

const MIN = 20_000;

describe('resolveDepositAmount', () => {
  it('ANTICIPO sin monto usa el mínimo', () => {
    expect(
      resolveDepositAmount({
        coverage: DepositCoverage.ANTICIPO,
        requested: undefined,
        minimum: MIN,
      }),
    ).toEqual({ ok: true, amount: MIN });
  });

  it('respeta un monto mayor al mínimo', () => {
    expect(
      resolveDepositAmount({
        coverage: DepositCoverage.ANTICIPO,
        requested: 35_000,
        minimum: MIN,
      }),
    ).toEqual({ ok: true, amount: 35_000 });
  });

  it('rechaza un monto menor al mínimo', () => {
    expect(
      resolveDepositAmount({
        coverage: DepositCoverage.ANTICIPO,
        requested: 10_000,
        minimum: MIN,
      }),
    ).toEqual({ ok: false, reason: 'BELOW_MINIMUM' });
  });

  it('PAGO_COMPLETO exige monto explícito', () => {
    expect(
      resolveDepositAmount({
        coverage: DepositCoverage.PAGO_COMPLETO,
        requested: undefined,
        minimum: MIN,
      }),
    ).toEqual({ ok: false, reason: 'AMOUNT_REQUIRED_FOR_FULL_PAYMENT' });
  });

  it('PAGO_COMPLETO con monto válido lo acepta', () => {
    expect(
      resolveDepositAmount({
        coverage: DepositCoverage.PAGO_COMPLETO,
        requested: 380_000,
        minimum: MIN,
      }),
    ).toEqual({ ok: true, amount: 380_000 });
  });

  it('el monto exacto del mínimo es válido', () => {
    expect(
      resolveDepositAmount({
        coverage: DepositCoverage.ANTICIPO,
        requested: MIN,
        minimum: MIN,
      }),
    ).toEqual({ ok: true, amount: MIN });
  });
});
