import { Injectable, Logger } from '@nestjs/common';
import { AppException } from 'src/common/errors/app.exception';
import { CloudinaryService } from 'src/infrastructure/cloudinary/cloudinary.service';
import { CreateTestimonialDto } from './dto/create-testimonial.dto';
import { UpdateTestimonialDto } from './dto/update-testimonial.dto';
import { TestimonialsRepository } from './repository/testimonials.repository';
import { TestimonialImageSlot } from './testimonial-image-slot';
import { toAdminTestimonial, toPublicTestimonial } from './testimonial.mapper';

@Injectable()
export class TestimonialsService {
  private readonly logger = new Logger(TestimonialsService.name);

  constructor(
    private readonly repository: TestimonialsRepository,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async findPublished() {
    const rows = await this.repository.findPublished();
    return rows.map(toPublicTestimonial);
  }

  async findAll() {
    const rows = await this.repository.findAll();
    return rows.map(toAdminTestimonial);
  }

  async create(dto: CreateTestimonialDto) {
    const row = await this.repository.create({
      authorName: dto.authorName,
      quote: dto.quote,
      treatmentName: dto.treatmentName,
      isPublished: dto.isPublished,
    });
    return toAdminTestimonial(row);
  }

  async update(id: string, dto: UpdateTestimonialDto) {
    await this.assertExists(id);
    const row = await this.repository.update(id, dto);
    return toAdminTestimonial(row);
  }

  async remove(id: string) {
    const existing = await this.assertExists(id);
    await this.repository.delete(id);
    await this.destroyQuietly(existing.beforeImagePublicId);
    await this.destroyQuietly(existing.afterImagePublicId);
  }

  async reorder(ids: string[]) {
    const ok = await this.repository.reorder(ids);
    if (!ok) throw new AppException('TESTIMONIAL_REORDER_MISMATCH');
    return this.findAll();
  }

  async uploadImage(id: string, slot: TestimonialImageSlot, buffer: Buffer) {
    const existing = await this.assertExists(id);
    const previousPublicId = this.publicIdOf(existing, slot);

    const publicId = this.cloudinary.testimonialImagePublicId(id, slot);
    let uploaded: { url: string; publicId: string };
    try {
      uploaded = await this.cloudinary.uploadTestimonialImage(buffer, publicId);
    } catch (error) {
      await this.destroyQuietly(publicId);
      this.logger.error(
        `Fallo subiendo la foto ${slot} del testimonio ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new AppException('TESTIMONIAL_IMAGE_UPLOAD_FAILED', {
        cause: error,
      });
    }

    try {
      const row = await this.repository.setImage(id, slot, uploaded);
      await this.destroyQuietly(previousPublicId);
      return toAdminTestimonial(row);
    } catch (error) {
      await this.destroyQuietly(uploaded.publicId);
      throw error;
    }
  }

  async removeImage(id: string, slot: TestimonialImageSlot) {
    const existing = await this.assertExists(id);
    const previousPublicId = this.publicIdOf(existing, slot);
    if (!previousPublicId)
      throw new AppException('TESTIMONIAL_IMAGE_NOT_FOUND');
    const row = await this.repository.setImage(id, slot, null);
    await this.destroyQuietly(previousPublicId);
    return toAdminTestimonial(row);
  }

  private publicIdOf(
    row: {
      beforeImagePublicId: string | null;
      afterImagePublicId: string | null;
    },
    slot: TestimonialImageSlot,
  ) {
    return slot === TestimonialImageSlot.BEFORE
      ? row.beforeImagePublicId
      : row.afterImagePublicId;
  }

  private async assertExists(id: string) {
    const row = await this.repository.findById(id);
    if (!row) throw new AppException('TESTIMONIAL_NOT_FOUND');
    return row;
  }

  private async destroyQuietly(publicId: string | null) {
    if (!publicId) return;
    try {
      await this.cloudinary.destroyImage(publicId);
    } catch (error) {
      this.logger.warn(
        `No se pudo borrar la imagen ${publicId} de Cloudinary: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
