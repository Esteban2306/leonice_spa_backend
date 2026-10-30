import {
  SiigoCatalogItem,
  SiigoClient,
  SiigoVoucherResult,
} from './siigo.client';
import { SiigoError } from './siigo.errors';

const disabled = () =>
  Promise.reject(
    new SiigoError(
      'NOT_CONFIGURED',
      'La integración con Siigo está desactivada (SIIGO_ENABLED=false)',
    ),
  );

export class DisabledSiigoClient implements SiigoClient {
  createVoucher(): Promise<SiigoVoucherResult> {
    return disabled();
  }

  listDocumentTypes(): Promise<SiigoCatalogItem[]> {
    return disabled();
  }

  listPaymentTypes(): Promise<SiigoCatalogItem[]> {
    return disabled();
  }

  listMiscIncomeConcepts(): Promise<SiigoCatalogItem[]> {
    return disabled();
  }

  findProductByCode(): Promise<SiigoCatalogItem | null> {
    return disabled();
  }
}
