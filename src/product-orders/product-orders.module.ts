import { Module } from '@nestjs/common';
import { BusinessSettingsModule } from '../business-settings/business-settings.module';
import { ProductsModule } from '../products/products.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { ProductOrdersController } from './product-orders.controller';
import { ProductOrdersRepository } from './product-orders.repository';
import { ProductOrdersService } from './product-orders.service';

@Module({
  imports: [BusinessSettingsModule, ProductsModule, PromotionsModule],
  controllers: [ProductOrdersController],
  providers: [ProductOrdersService, ProductOrdersRepository],
  exports: [ProductOrdersService],
})
export class ProductOrdersModule {}
