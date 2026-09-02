import { BadRequestException } from '@nestjs/common';

const DATA_URI_PATTERN = /^data:image\/(jpeg|jpg|png|webp);base64,/;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function assertValidImageDataUri(dataUri: string): void {
  if (!DATA_URI_PATTERN.test(dataUri)) {
    throw new BadRequestException(
      'La imagen debe venir como Data URI válido: "data:image/jpeg;base64,..." (jpeg, png o webp)',
    );
  }

  const base64Part = dataUri.slice(dataUri.indexOf(',') + 1);
  const approximateBytes = (base64Part.length * 3) / 4;
  if (approximateBytes > MAX_IMAGE_BYTES) {
    throw new BadRequestException(
      `La imagen no puede superar los ${MAX_IMAGE_BYTES / (1024 * 1024)}MB`,
    );
  }
}
