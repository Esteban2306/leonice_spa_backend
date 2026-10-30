import { PaymentMethod } from '@prisma/client';
import { buildSiigoIncomePayload } from './siigo-income-payload';

describe('buildSiigoIncomePayload', () => {
  it('registra el valor completo del tratamiento, no solo el saldo cobrado', () => {
    const payload = buildSiigoIncomePayload({
      reservationId: 'r1',
      completedAt: new Date('2026-11-20T15:00:00.000Z'),
      treatment: { id: 't1', name: 'Alisado' },
      price: 250,
      paymentMethod: PaymentMethod.MIXTO,
      cash: 150,
      transfer: 0,
      advance: 100,
    });

    expect(payload).toEqual({
      version: 1,
      reservationId: 'r1',
      completedAt: '2026-11-20T15:00:00.000Z',
      treatment: { id: 't1', name: 'Alisado' },
      amountCopThousands: 250,
      paymentMethod: 'MIXTO',
      breakdownCopThousands: { cash: 150, transfer: 0, advance: 100 },
    });
  });

  it('no incluye datos personales de la clienta', () => {
    const payload = buildSiigoIncomePayload({
      reservationId: 'r1',
      completedAt: new Date(),
      treatment: { id: 't1', name: 'Alisado' },
      price: 100,
      paymentMethod: PaymentMethod.EFECTIVO,
      cash: 100,
      transfer: 0,
      advance: 0,
    });

    expect(Object.keys(payload).sort()).toEqual([
      'amountCopThousands',
      'breakdownCopThousands',
      'completedAt',
      'paymentMethod',
      'reservationId',
      'treatment',
      'version',
    ]);
  });
});
