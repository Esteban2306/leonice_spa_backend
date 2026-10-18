import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { TestimonialImageSlot } from '../testimonial-image-slot';

export interface TestimonialWriteData {
  authorName?: string;
  quote?: string;
  treatmentName?: string;
  isPublished?: boolean;
}

export interface TestimonialCreateData {
  authorName: string;
  quote: string;
  treatmentName: string;
  isPublished?: boolean;
}

const ORDER = [
  { displayOrder: 'asc' },
  { createdAt: 'asc' },
  { id: 'asc' },
] as const;

@Injectable()
export class TestimonialsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findPublished() {
    return this.prisma.client.testimonial.findMany({
      where: { isPublished: true },
      orderBy: [...ORDER],
    });
  }

  findAll() {
    return this.prisma.client.testimonial.findMany({ orderBy: [...ORDER] });
  }

  findById(id: string) {
    return this.prisma.client.testimonial.findUnique({ where: { id } });
  }

  create(data: TestimonialCreateData) {
    return this.prisma.client.$transaction(async (tx) => {
      const last = await tx.testimonial.aggregate({
        _max: { displayOrder: true },
      });
      return tx.testimonial.create({
        data: { ...data, displayOrder: (last._max.displayOrder ?? -1) + 1 },
      });
    });
  }

  update(id: string, data: TestimonialWriteData) {
    return this.prisma.client.testimonial.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.client.testimonial.delete({ where: { id } });
  }

  setImage(
    id: string,
    slot: TestimonialImageSlot,
    image: { url: string; publicId: string } | null,
  ) {
    const data =
      slot === TestimonialImageSlot.BEFORE
        ? {
            beforeImageUrl: image?.url ?? null,
            beforeImagePublicId: image?.publicId ?? null,
          }
        : {
            afterImageUrl: image?.url ?? null,
            afterImagePublicId: image?.publicId ?? null,
          };
    return this.prisma.client.testimonial.update({ where: { id }, data });
  }

  reorder(ids: string[]) {
    return this.prisma.client.$transaction(async (tx) => {
      const existing = await tx.testimonial.findMany({ select: { id: true } });
      const known = new Set(existing.map((row) => row.id));
      if (known.size !== ids.length || !ids.every((id) => known.has(id))) {
        return false;
      }
      await Promise.all(
        ids.map((id, index) =>
          tx.testimonial.update({
            where: { id },
            data: { displayOrder: index },
          }),
        ),
      );
      return true;
    });
  }
}
