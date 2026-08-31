import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ReservationStatus } from '@prisma/client';
import {
  QUEUE_NAMES,
  JOB_NAMES,
} from '../../infrastructure/queue/queue.constants';
import { ReservationsRepository } from '../../reservations/repositories/reservations.repository';
import { CancelReservationOrchestrator } from '../../reservations/orchestrators/cancel-reservation.orchestrator';
import { MarkNoShowOrchestrator } from '../../reservations/orchestrators/mark-no-show.orchestrator';

interface TimeoutJobData {
  reservationId: string;
}

@Processor(QUEUE_NAMES.RESERVATION_TIMEOUTS)
export class ReservationTimeoutsProcessor extends WorkerHost {
  private readonly logger = new Logger(ReservationTimeoutsProcessor.name);

  constructor(
    private readonly repository: ReservationsRepository,
    private readonly cancelOrchestrator: CancelReservationOrchestrator,
    private readonly markNoShowOrchestrator: MarkNoShowOrchestrator,
  ) {
    super();
  }

  async process(job: Job<TimeoutJobData>): Promise<void> {
    const { reservationId } = job.data;

    switch (job.name) {
      case JOB_NAMES.VALORACION_TIMEOUT:
        return this.cancelIfStillIn(
          reservationId,
          ReservationStatus.PENDIENTE_VALORACION,
          'Valoración no respondida a tiempo',
        );
      case JOB_NAMES.DEPOSITO_TIMEOUT:
        return this.cancelIfStillIn(
          reservationId,
          ReservationStatus.PENDIENTE_DEPOSITO,
          'Depósito no confirmado a tiempo',
        );
      case JOB_NAMES.NO_SHOW_CHECK:
        return this.markNoShowIfStillConfirmed(reservationId);
      default:
        this.logger.warn(`Job desconocido recibido: ${job.name}`);
    }
  }

  private async cancelIfStillIn(
    reservationId: string,
    expectedStatus: ReservationStatus,
    reason: string,
  ) {
    const reservation = await this.repository.findById(reservationId);
    if (!reservation || reservation.status !== expectedStatus) return;
    await this.cancelOrchestrator.execute(reservationId, reason);
  }

  private async markNoShowIfStillConfirmed(reservationId: string) {
    const reservation = await this.repository.findById(reservationId);
    if (
      !reservation ||
      reservation.status !== ReservationStatus.CONFIRMADA ||
      reservation.checkedInAt
    )
      return;
    await this.markNoShowOrchestrator.execute(reservationId);
  }
}
