import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FindProductOrdersQueryDto } from './dto/find-product-orders-query.dto';
import { RejectProductPaymentDto } from './dto/reject-product-payment.dto';
import { SetProductOrderTotalDto } from './dto/set-product-order-total.dto';
import { toAdminOrder } from './domain/admin-order-view';
import { ProductOrdersService } from './product-orders.service';

@Controller({ path: 'product-orders', version: '1' })
export class ProductOrdersController {
  constructor(private readonly service: ProductOrdersService) {}

  @Get()
  async findMany(@Query() query: FindProductOrdersQueryDto) {
    const page = await this.service.list(query);
    return { ...page, items: page.items.map(toAdminOrder) };
  }

  @Get('summary')
  summary() {
    return this.service.summary();
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return toAdminOrder(await this.service.load(id));
  }

  @Patch(':id/verify-payment')
  async verify(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
  ) {
    return toAdminOrder(await this.service.verifyPayment(id, user.id));
  }

  @Patch(':id/reject-payment')
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectProductPaymentDto,
  ) {
    return toAdminOrder(await this.service.rejectPayment(id, dto.reason));
  }

  @Patch(':id/deliver')
  async deliver(@Param('id', ParseUUIDPipe) id: string) {
    return toAdminOrder(await this.service.markDelivered(id));
  }

  @Patch(':id/cancel')
  async cancel(@Param('id', ParseUUIDPipe) id: string) {
    return toAdminOrder(await this.service.cancel(id));
  }

  @Patch(':id/total')
  async setTotal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetProductOrderTotalDto,
  ) {
    return toAdminOrder(await this.service.setTotal(id, dto.total));
  }
}
