import { Injectable, Logger } from '@nestjs/common';
import { TreatmentsService } from '../../catalog/treatments/treatments.service';
import { ProductCatalogService } from '../../products/catalog/product-catalog.service';
import { PromotionsService } from '../../promotions/promotions.service';
import { promotedProducts } from '../tools/bot-product-view';
import {
  BotPricingClient,
  prioritizePromoted,
  toBotTreatmentListItem,
} from '../tools/bot-treatment-view';
import {
  BotPromotionOffer,
  CLOSING_OFFER_HINT,
  collectOffers,
  pickAfterBooking,
  pickAfterPurchase,
} from './bot-promotion-offers';

export interface ClosingOffer {
  offer: BotPromotionOffer;
  hint: string;
}

@Injectable()
export class ConduitPromotionOffersService {
  private readonly logger = new Logger(ConduitPromotionOffersService.name);

  constructor(
    private readonly treatments: TreatmentsService,
    private readonly productCatalog: ProductCatalogService,
    private readonly promotions: PromotionsService,
  ) {}

  async current(client?: BotPricingClient | null) {
    return (await this.load(client)).offers;
  }

  async afterBooking(
    bookedTreatmentIds: readonly string[],
  ): Promise<ClosingOffer | null> {
    return this.safely(async () => {
      const { offers, treatmentNames } = await this.load();
      return pickAfterBooking(
        offers,
        bookedTreatmentIds.flatMap((id) => treatmentNames.get(id) ?? []),
      );
    });
  }

  async afterPurchase(request: string): Promise<ClosingOffer | null> {
    return this.safely(async () =>
      pickAfterPurchase((await this.load()).offers, request),
    );
  }

  private async load(client?: BotPricingClient | null) {
    const [treatments, catalog, promotions] = await Promise.all([
      this.treatments.findAll(),
      this.productCatalog.listRecords(),
      this.promotions.findAllCurrentlyValid(),
    ]);
    const offers = collectOffers(
      prioritizePromoted(
        treatments.map((treatment) =>
          toBotTreatmentListItem(treatment, client),
        ),
      ),
      promotedProducts(catalog, promotions),
    );
    return {
      offers,
      treatmentNames: new Map(treatments.map((t) => [t.id, t.name])),
    };
  }

  private async safely(
    pick: () => Promise<BotPromotionOffer | null>,
  ): Promise<ClosingOffer | null> {
    try {
      const offer = await pick();
      return offer ? { offer, hint: CLOSING_OFFER_HINT } : null;
    } catch (error) {
      this.logger.warn(
        `No se pudo elegir la promoción de cierre: ${(error as Error).message}`,
      );
      return null;
    }
  }
}
