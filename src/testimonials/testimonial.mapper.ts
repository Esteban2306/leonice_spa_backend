import type { Testimonial } from '@prisma/client';

export function toPublicTestimonial(row: Testimonial) {
  return {
    id: row.id,
    authorName: row.authorName,
    quote: row.quote,
    treatmentName: row.treatmentName,
    beforeImageUrl: row.beforeImageUrl,
    afterImageUrl: row.afterImageUrl,
  };
}

export function toAdminTestimonial(row: Testimonial) {
  return {
    ...toPublicTestimonial(row),
    isPublished: row.isPublished,
    displayOrder: row.displayOrder,
    consentConfirmedAt: row.consentConfirmedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
