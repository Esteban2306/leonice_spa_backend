import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductsRepository } from './repository/products.repository';
import { ClientsModule } from 'src/clients/clients.module';
import { ProductCatalogController } from './catalog/product-catalog.controller';
import { ProductCatalogService } from './catalog/product-catalog.service';
import { ProductCatalogRepository } from './catalog/product-catalog.repository';

@Module({
  imports: [ClientsModule],
  controllers: [ProductsController, ProductCatalogController],
  providers: [
    ProductsService,
    ProductsRepository,
    ProductCatalogService,
    ProductCatalogRepository,
  ],
  exports: [ProductsService],
})
export class ProductsModule {}
