import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from 'src/auth/decorators/public.decorator';
import { ProductCatalogService } from './product-catalog.service';
import { FindCatalogQueryDto } from './find-catalog-query.dto';

@Public()
@Controller({ path: 'catalog/products', version: '1' })
export class ProductCatalogController {
  constructor(private readonly service: ProductCatalogService) {}

  @Get()
  list(@Query() query: FindCatalogQueryDto) {
    return this.service.list(query);
  }

  @Get(':slug')
  detail(@Param('slug') slug: string) {
    return this.service.detail(slug);
  }
}
