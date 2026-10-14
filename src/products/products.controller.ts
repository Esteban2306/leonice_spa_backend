import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ProductsService } from './products.service';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { CreateRecommendationDto } from './dto/create-recommendation.dto';
import { FindProductsQueryDto } from './dto/find-products-query.dto';
import { FindAdminProductsQueryDto } from './dto/find-admin-products-query.dto';
import { Public } from '../auth/decorators/public.decorator';
import { AssignProductTagsDto } from './dto/assign-product-tags.dto';
import { LogProductViewDto } from './dto/log-product-view.dto';
import { SkipCsrf } from 'src/auth/decorators/skip-csrf.decorator';
import { CreateProductTagDto } from './dto/create-product-tag.dto';
import { UpdateProductTagDto } from './dto/update-product-tag.dto';
import { FindRecommendedForClientQueryDto } from './dto/find-recommended-for-client-query.dto';

const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const PRODUCT_IMAGE_UPLOAD_OPTIONS = {
  storage: memoryStorage(),
  limits: { fileSize: PRODUCT_IMAGE_MAX_BYTES, files: 1 },
};

function productImageValidationPipe() {
  return new ParseFilePipe({
    validators: [
      new MaxFileSizeValidator({ maxSize: PRODUCT_IMAGE_MAX_BYTES }),
      new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ }),
    ],
  });
}

@Controller({ path: 'products', version: '1' })
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Public()
  @Get('categories')
  findAllCategories() {
    return this.service.findAllCategories();
  }

  @Get('categories/admin')
  findAllCategoriesForAdmin() {
    return this.service.findAllCategoriesForAdmin();
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

  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeCategory(id);
  }

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
  @HttpCode(HttpStatus.NO_CONTENT)
  removeRecommendation(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeRecommendation(id);
  }

  @Public()
  @Get()
  findAll(@Query() query: FindProductsQueryDto) {
    return this.service.findAll(query);
  }

  @Get('admin')
  findAllForAdmin(@Query() query: FindAdminProductsQueryDto) {
    return this.service.findAllForAdmin(query);
  }

  @Get('admin/:id')
  findOneForAdmin(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOneForAdmin(id);
  }

  @Public()
  @Get('tags')
  findAllTags() {
    return this.service.findAllTags();
  }

  @Get('tags/admin')
  findAllTagsForAdmin() {
    return this.service.findAllTagsForAdmin();
  }

  @Post('tags')
  createTag(@Body() dto: CreateProductTagDto) {
    return this.service.createTag(dto);
  }

  @Patch('tags/:id')
  updateTag(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductTagDto,
  ) {
    return this.service.updateTag(id, dto);
  }

  @Delete('tags/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTag(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeTag(id);
  }

  @Public()
  @Get('recommended-for-client')
  findRecommendedForClient(@Query() query: FindRecommendedForClientQueryDto) {
    return this.service.findRecommendedForClient(query.phone);
  }

  @Patch('variants/:variantId')
  updateVariant(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateProductVariantDto,
  ) {
    return this.service.updateVariant(variantId, dto);
  }

  @Delete('variants/:variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeVariant(@Param('variantId', ParseUUIDPipe) variantId: string) {
    return this.service.removeVariant(variantId);
  }

  @Post('variants/:variantId/image')
  @UseInterceptors(FileInterceptor('image', PRODUCT_IMAGE_UPLOAD_OPTIONS))
  uploadVariantImage(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @UploadedFile(productImageValidationPipe()) file: Express.Multer.File,
  ) {
    return this.service.uploadVariantImage(variantId, file.buffer);
  }

  @Delete('variants/:variantId/image')
  removeVariantImage(@Param('variantId', ParseUUIDPipe) variantId: string) {
    return this.service.removeVariantImage(variantId);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOnePublic(id);
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

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  @Post(':id/variants')
  addVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateProductVariantDto,
  ) {
    return this.service.addVariant(id, dto);
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
