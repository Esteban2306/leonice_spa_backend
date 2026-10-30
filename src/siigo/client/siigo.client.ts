export const SIIGO_CLIENT = Symbol('SIIGO_CLIENT');

export type SiigoVoucherBody = Record<string, unknown>;

export interface SiigoVoucherResult {
  id: string;
  name: string | null;
  raw: Record<string, unknown>;
}

export interface SiigoCatalogItem {
  id: number | string;
  name: string;
  code: string | null;
  active: boolean;
  raw: Record<string, unknown>;
}

export interface SiigoClient {
  createVoucher(
    body: SiigoVoucherBody,
    idempotencyKey: string,
  ): Promise<SiigoVoucherResult>;
  listDocumentTypes(type: string): Promise<SiigoCatalogItem[]>;
  listPaymentTypes(documentType: string): Promise<SiigoCatalogItem[]>;
  listMiscIncomeConcepts(): Promise<SiigoCatalogItem[]>;
  findProductByCode(code: string): Promise<SiigoCatalogItem | null>;
}
