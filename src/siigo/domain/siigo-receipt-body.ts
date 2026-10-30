import { SiigoVoucherBody } from '../client/siigo.client';
import { SiigoReceiptMapping } from '../siigo-receipt-mapping';
import { SiigoIncomePayload } from './siigo-income-payload';

export type SiigoReceiptLine = 'CASH' | 'TRANSFER';

export interface SiigoReceipt {
  line: SiigoReceiptLine;
  body: SiigoVoucherBody;
}

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
const PESOS_PER_THOUSAND = 1000;

const toPesos = (thousands: number) =>
  Math.round(thousands * PESOS_PER_THOUSAND);

export function bogotaDate(instant: Date): string {
  return new Date(instant.getTime() - BOGOTA_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

export function buildSiigoReceipts(
  payload: SiigoIncomePayload,
  mapping: SiigoReceiptMapping,
): SiigoReceipt[] {
  const { cash, transfer, advance } = payload.breakdownCopThousands;
  const lines: { line: SiigoReceiptLine; thousands: number; id: number }[] = [
    { line: 'CASH', thousands: cash, id: mapping.cashPaymentTypeId },
    {
      line: 'TRANSFER',
      thousands: transfer + advance,
      id: mapping.transferPaymentTypeId,
    },
  ];

  const date = bogotaDate(new Date(payload.completedAt));
  const observations = `Leonice Spa - ${payload.treatment.name} - reserva ${payload.reservationId.slice(0, 8)}`;

  return lines
    .filter((entry) => toPesos(entry.thousands) > 0)
    .map((entry) => ({
      line: entry.line,
      body: {
        document: { id: mapping.documentTypeId },
        type: 'MiscIncome',
        date,
        customer: {
          identification: mapping.customer.identification,
          branch_office: mapping.customer.branchOffice,
        },
        ...(mapping.costCenterId === null
          ? {}
          : { cost_center: mapping.costCenterId }),
        income: { id: mapping.incomeConceptId },
        payment: { id: entry.id, value: toPesos(entry.thousands) },
        observations,
      },
    }));
}
