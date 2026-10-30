import { ConfigService } from '@nestjs/config';
import { SiigoError } from './client/siigo.errors';

export interface SiigoReceiptMapping {
  documentTypeId: number;
  incomeConceptId: number;
  cashPaymentTypeId: number;
  transferPaymentTypeId: number;
  costCenterId: number | null;
  customer: { identification: string; branchOffice: string };
}

const REQUIRED_INTEGERS = [
  ['SIIGO_RECEIPT_DOCUMENT_ID', 'documentTypeId'],
  ['SIIGO_INCOME_CONCEPT_ID', 'incomeConceptId'],
  ['SIIGO_PAYMENT_CASH_ID', 'cashPaymentTypeId'],
  ['SIIGO_PAYMENT_TRANSFER_ID', 'transferPaymentTypeId'],
] as const;

const parsePositiveInt = (value: unknown): number | null => {
  const text = (
    typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  ).trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

export function readSiigoReceiptMapping(
  config: ConfigService,
): SiigoReceiptMapping {
  const problems: string[] = [];
  const integers: Record<string, number> = {};

  for (const [envName, key] of REQUIRED_INTEGERS) {
    const parsed = parsePositiveInt(config.get(envName));
    if (parsed === null) problems.push(envName);
    else integers[key] = parsed;
  }

  const identification = String(
    config.get('SIIGO_CUSTOMER_IDENTIFICATION', ''),
  ).trim();
  if (identification === '') problems.push('SIIGO_CUSTOMER_IDENTIFICATION');

  const costCenterRaw = String(config.get('SIIGO_COST_CENTER_ID', '')).trim();
  const costCenterId =
    costCenterRaw === '' ? null : parsePositiveInt(costCenterRaw);
  if (costCenterRaw !== '' && costCenterId === null) {
    problems.push('SIIGO_COST_CENTER_ID');
  }

  if (problems.length > 0) {
    throw new SiigoError(
      'NOT_CONFIGURED',
      `Faltan o son inválidos los datos de equivalencia con Siigo: ${problems.join(', ')}`,
    );
  }

  return {
    documentTypeId: integers.documentTypeId,
    incomeConceptId: integers.incomeConceptId,
    cashPaymentTypeId: integers.cashPaymentTypeId,
    transferPaymentTypeId: integers.transferPaymentTypeId,
    costCenterId,
    customer: {
      identification,
      branchOffice:
        String(config.get('SIIGO_CUSTOMER_BRANCH_OFFICE', '0')).trim() || '0',
    },
  };
}
