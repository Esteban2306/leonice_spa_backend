import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { CreateRecommendationDto } from './dto/create-recommendation.dto';
import { FindProductsQueryDto } from './dto/find-products-query.dto';
import { Public } from '../auth/decorators/public.decorator';
import { AssignProductTagsDto } from './dto/assign-product-tags.dto';
import { LogProductViewDto } from './dto/log-product-view.dto';
import { SkipCsrf } from 'src/auth/decorators/skip-csrf.decorator';
import { CreateProductTagDto } from './dto/create-product-tag.dto';

@Controller({ path: 'products', version: '1' })
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  // ---- Categorías de producto  ----

  @Public()
  @Get('categories')
  findAllCategories() {
    return this.service.findAllCategories();
  }

  @Post('categories')
  createCategory(@Body() dto: CreateProductCategoryDto) {
    return this.service.createCategory(dto);
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductCategoryDto,
  ) {
    return this.service.updateCategory(id, dto);
  }

  // ---- Recomendaciones ----

  @Public()
  @Get('recommendations/:treatmentId')
  getRecommendations(@Param('treatmentId', ParseUUIDPipe) treatmentId: string) {
    return this.service.getRecommendationsForTreatment(treatmentId);
  }

  @Post('recommendations')
  addRecommendation(@Body() dto: CreateRecommendationDto) {
    return this.service.addRecommendation(dto.treatmentId, dto.productId);
  }

  @Delete('recommendations/:id')
  removeRecommendation(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeRecommendation(id);
  }

  // ---- Productos  ----

  @Public()
  @Get()
  findAll(@Query() query: FindProductsQueryDto) {
    return this.service.findAll(query);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.service.update(id, dto);
  }

  // ---- Variantes ----

  @Post(':id/variants')
  addVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateProductVariantDto,
  ) {
    return this.service.addVariant(id, dto);
  }

  @Patch('variants/:variantId')
  updateVariant(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateProductVariantDto,
  ) {
    return this.service.updateVariant(variantId, dto);
  }

  @Public()
  @Get('tags')
  findAllTags() {
    return this.service.findAllTags();
  }

  @Post('tags')
  createTag(@Body() dto: CreateProductTagDto) {
    return this.service.createTag(dto);
  }

  @Public()
  @Get('recommended-for-client')
  findRecommendedForClient(@Query('phone') phone: string) {
    return this.service.findRecommendedForClient(phone);
  }

  @Patch(':id/toggle')
  toggleActive(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.toggleActive(id);
  }

  @Patch(':id/tags')
  assignTags(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignProductTagsDto,
  ) {
    return this.service.assignTags(id, dto.tagIds);
  }

  @Public()
  @Get(':id/related')
  findRelated(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findRelated(id);
  }

  @Public()
  @SkipCsrf()
  @Post(':id/view')
  logView(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LogProductViewDto,
  ) {
    return this.service.logView(id, dto.phone);
  }
}
