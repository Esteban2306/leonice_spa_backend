import { BadRequestException } from '@nestjs/common';

export function assertNoDuplicateTreatmentsInRequest(
  treatmentIds: string[],
): void {
  const uniqueIds = new Set(treatmentIds);
  if (uniqueIds.size !== treatmentIds.length) {
    throw new BadRequestException(
      'No puedes reservar el mismo tratamiento más de una vez en la misma petición',
    );
  }
}
