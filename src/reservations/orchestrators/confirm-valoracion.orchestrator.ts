import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { ReservationStateMachine } from '../domain/reservation-state-machine';
import { assertTreatmentRequiresAssessment } from '../validators/assert-requires-assessment';

@Injectable()
export class ConfirmValoracionOrchestrator {
  constructor(
    private readonly repository: ReservationsRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(
    reservationId: string,
    finalPrice: number,
    finalDurationMinutes: number,
  ) {
    const reservation = await this.repository.findById(reservationId);
    if (!reservation) throw new NotFoundException('Reserva no encontrada');

    const treatment = await this.prisma.client.treatment.findUniqueOrThrow({
      where: { id: reservation.treatmentId },
    });

    assertTreatmentRequiresAssessment(
      treatment.name,
      treatment.requiresPriorAssessment,
    );

    ReservationStateMachine.assertTransition(
      reservation.status,
      ReservationStatus.PENDIENTE_DEPOSITO,
    );

    const maxAllowed =
      treatment.baseDurationMaxMinutes ?? reservation.finalDurationMinutes;
    if (finalDurationMinutes > maxAllowed) {
      throw new BadRequestException(
        `La duración confirmada (${finalDurationMinutes} min) no puede superar el máximo del tratamiento (${maxAllowed} min)`,
      );
    }

    const scheduledEnd = new Date(
      reservation.scheduledStart.getTime() + finalDurationMinutes * 60_000,
    );

    return this.repository.updateValoracion(reservationId, {
      finalPrice,
      finalDurationMinutes,
      scheduledEnd,
      status: ReservationStatus.PENDIENTE_DEPOSITO,
    });
  }
}
