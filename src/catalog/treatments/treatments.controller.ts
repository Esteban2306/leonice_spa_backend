import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
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
import { TreatmentsService } from './treatments.service';
import { CreateTreatmentDto } from './dto/create-treatment.dto';
import { UpdateTreatmentDto } from './dto/update-treatment.dto';
import { FindTreatmentsQueryDto } from './dto/find-treatments-query.dto';
import { FindAdminTreatmentsQueryDto } from './dto/find-admin-treatments-query.dto';
import { Public } from '../../auth/decorators/public.decorator';
import { SetHairLengthPricingDto } from './dto/set-hair-length-pricing.dto';
import { SetHairColorSurchargesDto } from './dto/set-hair-color-surcharges.dto';

const TREATMENT_VIDEO_MAX_BYTES = 100 * 1024 * 1024;

const TREATMENT_VIDEO_UPLOAD_OPTIONS = {
  storage: memoryStorage(),
  limits: { fileSize: TREATMENT_VIDEO_MAX_BYTES, files: 1 },
};

function treatmentVideoValidationPipe() {
  return new ParseFilePipe({
    validators: [
      new MaxFileSizeValidator({ maxSize: TREATMENT_VIDEO_MAX_BYTES }),
      new FileTypeValidator({ fileType: /^video\/(mp4|webm|quicktime)$/ }),
    ],
  });
}

@Controller({ path: 'treatments', version: '1' })
export class TreatmentsController {
  constructor(private readonly service: TreatmentsService) {}

  @Public()
  @Get()
  findAll(@Query() query: FindTreatmentsQueryDto) {
    return this.service.findAll(query.categoryId);
  }

  @Get('admin')
  findAllForAdmin(@Query() query: FindAdminTreatmentsQueryDto) {
    return this.service.findAllForAdmin(query);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateTreatmentDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTreatmentDto,
  ) {
    return this.service.update(id, dto);
  }

  @Post(':id/video')
  @UseInterceptors(FileInterceptor('video', TREATMENT_VIDEO_UPLOAD_OPTIONS))
  uploadVideo(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile(treatmentVideoValidationPipe()) file: Express.Multer.File,
  ) {
    return this.service.uploadVideo(id, file.buffer);
  }

  @Delete(':id/video')
  removeVideo(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeVideo(id);
  }

  @Get(':id/hair-length-pricing')
  getHairLengthPricing(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getHairLengthPricing(id);
  }

  @Patch(':id/hair-length-pricing')
  setHairLengthPricing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetHairLengthPricingDto,
  ) {
    return this.service.setHairLengthPricing(id, dto.entries);
  }

  @Get(':id/hair-color-surcharges')
  getHairColorSurcharges(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getHairColorSurcharges(id);
  }

  @Get(':id/hair-pricing-matrix')
  getHairPricingMatrix(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getHairPricingMatrix(id);
  }

  @Patch(':id/hair-color-surcharges')
  setHairColorSurcharges(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetHairColorSurchargesDto,
  ) {
    return this.service.setHairColorSurcharges(id, dto.entries);
  }
}
