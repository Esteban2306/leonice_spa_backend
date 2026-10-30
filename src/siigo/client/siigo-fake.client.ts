import {
  SiigoCatalogItem,
  SiigoClient,
  SiigoVoucherBody,
  SiigoVoucherResult,
} from './siigo.client';
import { SiigoError } from './siigo.errors';

export interface FakeVoucherCall {
  body: SiigoVoucherBody;
  idempotencyKey: string;
}

export class FakeSiigoClient implements SiigoClient {
  readonly vouchers: FakeVoucherCall[] = [];
  documentTypes: SiigoCatalogItem[] = [];
  paymentTypes: SiigoCatalogItem[] = [];
  miscIncomeConcepts: SiigoCatalogItem[] = [];
  products: SiigoCatalogItem[] = [];

  private readonly byKey = new Map<string, SiigoVoucherResult>();
  private pendingFailures: SiigoError[] = [];

  failNext(error: SiigoError, times = 1): void {
    this.pendingFailures = Array.from({ length: times }, () => error);
  }

  createVoucher(
    body: SiigoVoucherBody,
    idempotencyKey: string,
  ): Promise<SiigoVoucherResult> {
    const failure = this.pendingFailures.shift();
    if (failure) return Promise.reject(failure);

    const existing = this.byKey.get(idempotencyKey);
    if (existing) return Promise.resolve(existing);

    this.vouchers.push({ body, idempotencyKey });
    const result: SiigoVoucherResult = {
      id: `fake-voucher-${this.vouchers.length}`,
      name: `RC-1-${this.vouchers.length}`,
      raw: { id: `fake-voucher-${this.vouchers.length}` },
    };
    this.byKey.set(idempotencyKey, result);
    return Promise.resolve(result);
  }

  listDocumentTypes(): Promise<SiigoCatalogItem[]> {
    return Promise.resolve(this.documentTypes);
  }

  listPaymentTypes(): Promise<SiigoCatalogItem[]> {
    return Promise.resolve(this.paymentTypes);
  }

  listMiscIncomeConcepts(): Promise<SiigoCatalogItem[]> {
    return Promise.resolve(this.miscIncomeConcepts);
  }

  findProductByCode(code: string): Promise<SiigoCatalogItem | null> {
    return Promise.resolve(
      this.products.find((product) => product.code === code) ?? null,
    );
  }
}
