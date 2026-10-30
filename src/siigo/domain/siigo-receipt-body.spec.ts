import { PaymentMethod } from '@prisma/client';
import { buildSiigoIncomePayload } from './siigo-income-payload';
import { bogotaDate, buildSiigoReceipts } from './siigo-receipt-body';
import { SiigoReceiptMapping } from '../siigo-receipt-mapping';

const mapping: SiigoReceiptMapping = {
  documentTypeId: 170674,
  incomeConceptId: 174,
  cashPaymentTypeId: 3719,
  transferPaymentTypeId: 3720,
  costCenterId: null,
  customer: { identification: '222222222222', branchOffice: '0' },
};

const payload = (
  parts: { cash: number; transfer: number; advance: number },
  completedAt = new Date('2026-11-20T15:00:00.000Z'),
) =>
  buildSiigoIncomePayload({
    reservationId: '0f8fad5b-d9cb-469f-a165-70867728950e',
    completedAt,
    treatment: { id: 't1', name: 'Alisado orgánico' },
    price: parts.cash + parts.transfer + parts.advance,
    paymentMethod: PaymentMethod.MIXTO,
    ...parts,
  });

describe('buildSiigoReceipts', () => {
  it('arma un recibo de otros ingresos con la forma que documenta Siigo', () => {
    const receipts = buildSiigoReceipts(
      payload({ cash: 250, transfer: 0, advance: 0 }),
      mapping,
    );

    expect(receipts).toEqual([
      {
        line: 'CASH',
        body: {
          document: { id: 170674 },
          type: 'MiscIncome',
          date: '2026-11-20',
          customer: { identification: '222222222222', branch_office: '0' },
          income: { id: 174 },
          payment: { id: 3719, value: 250000 },
          observations: 'Leonice Spa - Alisado orgánico - reserva 0f8fad5b',
        },
      },
    ]);
  });

  it('agrupa transferencia y anticipo en el medio de pago de transferencia', () => {
    const receipts = buildSiigoReceipts(
      payload({ cash: 150, transfer: 50, advance: 50 }),
      mapping,
    );

    expect(receipts.map((r) => r.line)).toEqual(['CASH', 'TRANSFER']);
    expect(receipts[0].body.payment).toEqual({ id: 3719, value: 150000 });
    expect(receipts[1].body.payment).toEqual({ id: 3720, value: 100000 });
  });

  it('el total de los recibos es el valor completo del tratamiento', () => {
    const receipts = buildSiigoReceipts(
      payload({ cash: 150, transfer: 0, advance: 100 }),
      mapping,
    );
    const total = receipts.reduce(
      (sum, r) => sum + (r.body.payment as { value: number }).value,
      0,
    );

    expect(total).toBe(250000);
  });

  it('omite las líneas en cero', () => {
    const receipts = buildSiigoReceipts(
      payload({ cash: 0, transfer: 80, advance: 0 }),
      mapping,
    );

    expect(receipts.map((r) => r.line)).toEqual(['TRANSFER']);
  });

  it('incluye el centro de costo solo cuando está configurado', () => {
    const withCenter = buildSiigoReceipts(
      payload({ cash: 10, transfer: 0, advance: 0 }),
      { ...mapping, costCenterId: 55 },
    );

    expect(withCenter[0].body.cost_center).toBe(55);
    expect(
      buildSiigoReceipts(
        payload({ cash: 10, transfer: 0, advance: 0 }),
        mapping,
      )[0].body,
    ).not.toHaveProperty('cost_center');
  });

  it('no incluye datos personales de la clienta', () => {
    const [receipt] = buildSiigoReceipts(
      payload({ cash: 10, transfer: 0, advance: 0 }),
      mapping,
    );

    expect(JSON.stringify(receipt.body)).not.toMatch(/573|@/);
  });
});

describe('bogotaDate', () => {
  it('usa el día de Bogotá y no el de UTC', () => {
    expect(bogotaDate(new Date('2026-11-21T03:00:00.000Z'))).toBe('2026-11-20');
    expect(bogotaDate(new Date('2026-11-21T05:00:00.000Z'))).toBe('2026-11-21');
  });
});
