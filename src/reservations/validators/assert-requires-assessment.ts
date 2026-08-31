import { BadRequestException } from '@nestjs/common';

export function assertTreatmentRequiresAssessment(
  treatmentName: string,
  requiresPriorAssessment: boolean,
): void {
  if (!requiresPriorAssessment) {
    throw new BadRequestException(
      `"${treatmentName}" no requiere valoración previa — esta reserva ya está lista para confirmar el depósito directamente.`,
    );
  }
}
