import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  JOB_NAMES,
  QUEUE_NAMES,
} from '../../infrastructure/queue/queue.constants';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { ReservationStateMachine } from '../domain/reservation-state-machine';
import { DEPOSITO_TIMEOUT_MS } from '../domain/reservation-timing.constants';
import { assertTreatmentRequiresAssessment } from '../validators/assert-requires-assessment';

@Injectable()
export class ConfirmValoracionOrchestrator {
  private readonly logger = new Logger(ConfirmValoracionOrchestrator.name);

  constructor(
    private readonly repository: ReservationsRepository,
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.RESERVATION_TIMEOUTS)
    private readonly timeoutsQueue: Queue,
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
    const depositExpiresAt = new Date(Date.now() + DEPOSITO_TIMEOUT_MS);

    const updated = await this.repository.updateValoracion(reservationId, {
      finalPrice,
      finalDurationMinutes,
      scheduledEnd,
      status: ReservationStatus.PENDIENTE_DEPOSITO,
      depositExpiresAt,
    });

    await this.scheduleDepositTimeout(reservationId, depositExpiresAt);

    return updated;
  }

  private async scheduleDepositTimeout(
    reservationId: string,
    expiresAt: Date,
  ): Promise<void> {
    try {
      await this.timeoutsQueue.add(
        JOB_NAMES.DEPOSITO_TIMEOUT,
        { reservationId },
        { delay: Math.max(expiresAt.getTime() - Date.now(), 0) },
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `No se pudo encolar deposito-timeout de ${reservationId}; lo cubrirá el barrido: ${message}`,
      );
    }
  }
}
