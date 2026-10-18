import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseEnumPipe,
  ParseFilePipe,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Public } from 'src/auth/decorators/public.decorator';
import { CreateTestimonialDto } from './dto/create-testimonial.dto';
import { ReorderTestimonialsDto } from './dto/reorder-testimonials.dto';
import { UpdateTestimonialDto } from './dto/update-testimonial.dto';
import { TestimonialImageSlot } from './testimonial-image-slot';
import { TestimonialsService } from './testimonials.service';

const TESTIMONIAL_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const TESTIMONIAL_IMAGE_UPLOAD_OPTIONS = {
  storage: memoryStorage(),
  limits: { fileSize: TESTIMONIAL_IMAGE_MAX_BYTES, files: 1 },
};

function testimonialImageValidationPipe() {
  return new ParseFilePipe({
    validators: [
      new MaxFileSizeValidator({ maxSize: TESTIMONIAL_IMAGE_MAX_BYTES }),
      new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ }),
    ],
  });
}

@Controller({ path: 'testimonials', version: '1' })
export class TestimonialsController {
  constructor(private readonly service: TestimonialsService) {}

  @Public()
  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  findPublished() {
    return this.service.findPublished();
  }

  @Get('admin')
  findAll() {
    return this.service.findAll();
  }

  @Post()
  create(@Body() dto: CreateTestimonialDto) {
    return this.service.create(dto);
  }

  @Post('reorder')
  @HttpCode(HttpStatus.OK)
  reorder(@Body() dto: ReorderTestimonialsDto) {
    return this.service.reorder(dto.ids);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTestimonialDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  @Post(':id/images/:slot')
  @UseInterceptors(FileInterceptor('image', TESTIMONIAL_IMAGE_UPLOAD_OPTIONS))
  uploadImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('slot', new ParseEnumPipe(TestimonialImageSlot))
    slot: TestimonialImageSlot,
    @UploadedFile(testimonialImageValidationPipe()) file: Express.Multer.File,
  ) {
    return this.service.uploadImage(id, slot, file.buffer);
  }

  @Delete(':id/images/:slot')
  removeImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('slot', new ParseEnumPipe(TestimonialImageSlot))
    slot: TestimonialImageSlot,
  ) {
    return this.service.removeImage(id, slot);
  }
}
