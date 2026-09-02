import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  AutomationExecutionResult,
  AutomationExecutionType,
  ReservationStatus,
} from '@prisma/client';
import {
  QUEUE_NAMES,
  JOB_NAMES,
} from '../../infrastructure/queue/queue.constants';
import { ReservationsRepository } from '../../reservations/repositories/reservations.repository';
import { CancelReservationOrchestrator } from '../../reservations/orchestrators/cancel-reservation.orchestrator';
import { MarkNoShowOrchestrator } from '../../reservations/orchestrators/mark-no-show.orchestrator';
import { AutomationExecutionRepository } from '../repositories/automation-execution.repository';

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
    private readonly executions: AutomationExecutionRepository,
  ) {
    super();
  }

  async process(job: Job<TimeoutJobData>): Promise<void> {
    const { reservationId } = job.data;

    switch (job.name) {
      case JOB_NAMES.VALORACION_TIMEOUT:
        return this.cancelIfStillIn(
          AutomationExecutionType.VALORACION_TIMEOUT,
          reservationId,
          ReservationStatus.PENDIENTE_VALORACION,
          'Valoración no respondida a tiempo',
        );
      case JOB_NAMES.DEPOSITO_TIMEOUT:
        return this.cancelIfStillIn(
          AutomationExecutionType.DEPOSITO_TIMEOUT,
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

  @OnWorkerEvent('failed')
  async onFailed(job: Job<TimeoutJobData> | undefined, error: Error) {
    if (!job) return;

    const maxAttempts = job.opts.attempts ?? 1;
    const isFinal = job.attemptsMade >= maxAttempts;

    if (!isFinal) {
      this.logger.warn(
        `Intento ${job.attemptsMade}/${maxAttempts} fallido para "${job.name}" (${job.id}) — reintentará: ${error.message}`,
      );
      return;
    }

    this.logger.error(
      `"${job.name}" (${job.id}) agotó sus ${maxAttempts} intentos — falla permanente: ${error.message}`,
      error.stack,
    );

    const type = this.jobNameToExecutionType(job.name);
    if (type) {
      await this.executions.log({
        type,
        result: AutomationExecutionResult.FAILED,
        reservationId: job.data.reservationId,
        errorMessage: error.message,
      });
    }
  }

  private jobNameToExecutionType(
    jobName: string,
  ): AutomationExecutionType | null {
    switch (jobName) {
      case JOB_NAMES.VALORACION_TIMEOUT:
        return AutomationExecutionType.VALORACION_TIMEOUT;
      case JOB_NAMES.DEPOSITO_TIMEOUT:
        return AutomationExecutionType.DEPOSITO_TIMEOUT;
      case JOB_NAMES.NO_SHOW_CHECK:
        return AutomationExecutionType.NO_SHOW_CHECK;
      default:
        return null;
    }
  }

  private async cancelIfStillIn(
    type: AutomationExecutionType,
    reservationId: string,
    expectedStatus: ReservationStatus,
    reason: string,
  ) {
    const reservation = await this.repository.findById(reservationId);
    if (!reservation || reservation.status !== expectedStatus) {
      await this.executions.log({
        type,
        result: AutomationExecutionResult.SKIPPED,
        reservationId,
        reason: reservation
          ? `Ya no está en ${expectedStatus} (está en ${reservation.status})`
          : 'La reserva ya no existe',
      });
      return;
    }
    await this.cancelOrchestrator.execute(reservationId, reason);
    await this.executions.log({
      type,
      result: AutomationExecutionResult.EXECUTED,
      reservationId,
      reason,
    });
  }

  private async markNoShowIfStillConfirmed(reservationId: string) {
    const reservation = await this.repository.findById(reservationId);

    if (
      !reservation ||
      reservation.status !== ReservationStatus.CONFIRMADA ||
      reservation.checkedInAt
    ) {
      await this.executions.log({
        type: AutomationExecutionType.NO_SHOW_CHECK,
        result: AutomationExecutionResult.SKIPPED,
        reservationId,
        reason: !reservation
          ? 'La reserva ya no existe'
          : reservation.checkedInAt
            ? 'Ya hizo check-in'
            : `Ya no está CONFIRMADA (está en ${reservation.status})`,
      });
      return;
    }

    await this.markNoShowOrchestrator.execute(reservationId);
    await this.executions.log({
      type: AutomationExecutionType.NO_SHOW_CHECK,
      result: AutomationExecutionResult.EXECUTED,
      reservationId,
    });
  }
}
