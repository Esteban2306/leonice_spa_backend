import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ConduitTool } from './decorators/conduit-tool.decorator';
import type { RequestWithConduitContact } from './interceptors/conduit-contact.interceptor';
import { ConduitProductPaymentDto } from './dto/conduit-product-payment.dto';
import { assertValidImageDataUri } from '../deposits/validators/assert-valid-image-data-uri';
import { normalizePhone } from '../clients/utils/normalize-phone.util';
import { ProductOrdersService } from '../product-orders/product-orders.service';
import { orderCode } from '../product-orders/domain/order-pricing';
import { formatPesos } from '../product-orders/domain/order-text';
import {
  NO_OPEN_ORDER_HINT,
  PAYMENT_RECEIVED_HINT,
  PAYMENT_SHORT_HINT,
  PROMOTION_ENDED_HINT,
} from './tools/bot-order-view';

@Controller({ path: 'conduit/product-orders', version: '1' })
@ConduitTool()
export class ConduitProductOrdersController {
  constructor(private readonly orders: ProductOrdersService) {}

  @HttpCode(HttpStatus.OK)
  @Post('payment')
  async registerPayment(
    @Body() dto: ConduitProductPaymentDto,
    @Req() req: RequestWithConduitContact,
  ) {
    assertValidImageDataUri(dto.imageBase64);
    const phone =
      req.conduitContact?.phone ??
      (dto.phone ? normalizePhone(dto.phone) : null);
    const lid = req.conduitContact?.lid ?? null;
    const result = await this.orders.registerPayment({
      contact: { phone, lid },
      orderCode: dto.pedido ?? null,
      imageBase64: dto.imageBase64,
      amountSeen: dto.montoComprobante ?? null,
    });
    if (!result.order) {
      return {
        expected: true,
        code: 'NO_OPEN_ORDER',
        message: 'No hay un pedido de productos abierto para esta clienta.',
        hint: NO_OPEN_ORDER_HINT,
      };
    }
    return {
      received: true,
      orderCode: orderCode(result.order.number),
      total: result.total === null ? null : formatPesos(result.total),
      amountSeen:
        result.amountSeen === null ? null : formatPesos(result.amountSeen),
      amountMatches: result.amountMatches,
      ...(result.previousTotal !== null && {
        previousTotal: formatPesos(result.previousTotal),
      }),
      hint: [
        result.previousTotal !== null ? PROMOTION_ENDED_HINT : null,
        result.amountMatches === false ? PAYMENT_SHORT_HINT : null,
        PAYMENT_RECEIVED_HINT,
      ]
        .filter(Boolean)
        .join(' '),
    };
  }
}
