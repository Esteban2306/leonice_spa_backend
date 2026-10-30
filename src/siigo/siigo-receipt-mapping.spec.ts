import { ConfigService } from '@nestjs/config';
import { SiigoError } from './client/siigo.errors';
import { readSiigoReceiptMapping } from './siigo-receipt-mapping';

const complete = {
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

describe('readSiigoReceiptMapping', () => {
  it('lee los identificadores y deja sucursal 0 y sin centro de costo por defecto', () => {
    expect(readSiigoReceiptMapping(configOf(complete))).toEqual({
      documentTypeId: 170674,
      incomeConceptId: 174,
      cashPaymentTypeId: 3719,
      transferPaymentTypeId: 3720,
      costCenterId: null,
      customer: { identification: '222222222222', branchOffice: '0' },
    });
  });

  it('acepta centro de costo y sucursal', () => {
    const mapping = readSiigoReceiptMapping(
      configOf({
        ...complete,
        SIIGO_COST_CENTER_ID: '12',
        SIIGO_CUSTOMER_BRANCH_OFFICE: '2',
      }),
    );

    expect(mapping.costCenterId).toBe(12);
    expect(mapping.customer.branchOffice).toBe('2');
  });

  it('lista todo lo que falta o es inválido', () => {
    let error: unknown;
    try {
      readSiigoReceiptMapping(
        configOf({
          ...complete,
          SIIGO_INCOME_CONCEPT_ID: 'abc',
          SIIGO_CUSTOMER_IDENTIFICATION: ' ',
          SIIGO_PAYMENT_CASH_ID: undefined as never,
        }),
      );
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(SiigoError);
    expect((error as SiigoError).kind).toBe('NOT_CONFIGURED');
    expect((error as SiigoError).message).toContain('SIIGO_INCOME_CONCEPT_ID');
    expect((error as SiigoError).message).toContain('SIIGO_PAYMENT_CASH_ID');
    expect((error as SiigoError).message).toContain(
      'SIIGO_CUSTOMER_IDENTIFICATION',
    );
  });
});
