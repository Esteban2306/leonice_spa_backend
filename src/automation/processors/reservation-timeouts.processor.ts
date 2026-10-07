import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { ConflictException, HttpException, Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import {
  AutomationExecutionResult,
  AutomationExecutionType,
  CancellationSource,
  ReservationStatus,
} from '@prisma/client';
import {
  QUEUE_NAMES,
  JOB_NAMES,
} from '../../infrastructure/queue/queue.constants';
import { ReservationsRepository } from '../../reservations/repositories/reservations.repository';
import { AdminCancelReservationOrchestrator } from '../../reservations/orchestrators/admin-cancel-reservation.orchestrator';
import { MarkNoShowOrchestrator } from '../../reservations/orchestrators/mark-no-show.orchestrator';
import { AutomationExecutionRepository } from '../repositories/automation-execution.repository';
import {
  DEPOSIT_SWEEP_BATCH_SIZE,
  NO_SHOW_GRACE_MS,
} from '../../reservations/domain/reservation-timing.constants';

interface TimeoutJobData {
  reservationId?: string;
}

const NOTIFY_CLIENT_ON_TIMEOUT = false;

const DEPOSIT_TIMEOUT_REASON = 'Depósito no confirmado a tiempo';

@Processor(QUEUE_NAMES.RESERVATION_TIMEOUTS)
export class ReservationTimeoutsProcessor extends WorkerHost {
  private readonly logger = new Logger(ReservationTimeoutsProcessor.name);

  constructor(
    private readonly repository: ReservationsRepository,
    private readonly adminCancelOrchestrator: AdminCancelReservationOrchestrator,
    private readonly markNoShowOrchestrator: MarkNoShowOrchestrator,
    private readonly executions: AutomationExecutionRepository,
  ) {
    super();
  }

  async process(job: Job<TimeoutJobData>): Promise<void> {
    try {
      await this.handle(job);
    } catch (error: unknown) {
      if (this.isDeterministicError(error)) {
        throw new UnrecoverableError(`${error.name}: ${error.message}`);
      }
      throw error;
    }
  }

  private async handle(job: Job<TimeoutJobData>): Promise<void> {
    if (job.name === JOB_NAMES.DEPOSIT_EXPIRY_SWEEP) {
      return this.sweepExpiredDeposits();
    }

    const reservationId = this.requireReservationId(job);

    switch (job.name) {
      case JOB_NAMES.VALORACION_TIMEOUT:
        await this.executions.log({
          type: AutomationExecutionType.VALORACION_TIMEOUT,
          result: AutomationExecutionResult.SKIPPED,
          reservationId,
          reason: 'Timeout de valoración desactivado por regla de negocio',
        });
        return;
      case JOB_NAMES.DEPOSITO_TIMEOUT:
        return this.cancelIfStillIn(
          AutomationExecutionType.DEPOSITO_TIMEOUT,
          reservationId,
          ReservationStatus.PENDIENTE_DEPOSITO,
          DEPOSIT_TIMEOUT_REASON,
        );
      case JOB_NAMES.NO_SHOW_CHECK:
        return this.markNoShowIfStillConfirmed(reservationId);
      default:
        this.logger.warn(`Job desconocido recibido: ${job.name}`);
    }
  }

  private requireReservationId(job: Job<TimeoutJobData>): string {
    const id = job.data.reservationId;
    if (typeof id !== 'string' || id.length === 0) {
      throw new UnrecoverableError(
        `El job "${job.name}" llegó sin reservationId`,
      );
    }
    return id;
  }

  private async sweepExpiredDeposits(): Promise<void> {
    const ids = await this.repository.findExpiredPendingDepositIds(
      new Date(),
      DEPOSIT_SWEEP_BATCH_SIZE,
    );
    if (ids.length === 0) {
      this.logger.debug('Barrido: sin depósitos vencidos');
      return;
    }

    this.logger.log(`Barrido: ${ids.length} depósito(s) vencido(s)`);
    for (const id of ids) {
      try {
        await this.cancelIfStillIn(
          AutomationExecutionType.DEPOSITO_TIMEOUT,
          id,
          ReservationStatus.PENDIENTE_DEPOSITO,
          DEPOSIT_TIMEOUT_REASON,
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Barrido: no se pudo procesar ${id}: ${message}`);
      }
    }
  }

  private isDeterministicError(error: unknown): error is HttpException {
    return error instanceof HttpException && error.getStatus() < 500;
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<TimeoutJobData> | undefined, error: Error) {
    if (!job) return;

    const maxAttempts = job.opts.attempts ?? 1;
    const isUnrecoverable = error instanceof UnrecoverableError;
    const isFinal = isUnrecoverable || job.attemptsMade >= maxAttempts;

    if (!isFinal) {
      this.logger.warn(
        `Intento ${job.attemptsMade}/${maxAttempts} fallido para "${job.name}" (${job.id}) — reintentará: ${error.message}`,
      );
      return;
    }

    const cause = isUnrecoverable
      ? 'error determinista, sin reintentos'
      : `agotó sus ${maxAttempts} intentos`;

    this.logger.error(
      `"${job.name}" (${job.id}) falla permanente (${cause}): ${error.message}`,
      error.stack,
    );

    const type = this.jobNameToExecutionType(job.name);
    const reservationId = job.data.reservationId;
    if (type && reservationId) {
      await this.executions.log({
        type,
        result: AutomationExecutionResult.FAILED,
        reservationId,
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

  private async skip(
    type: AutomationExecutionType,
    reservationId: string,
    reason: string,
  ): Promise<void> {
    await this.executions.log({
      type,
      result: AutomationExecutionResult.SKIPPED,
      reservationId,
      reason,
    });
  }

  private async cancelIfStillIn(
    type: AutomationExecutionType,
    reservationId: string,
    expectedStatus: ReservationStatus,
    reason: string,
  ) {
    const reservation = await this.repository.findById(reservationId);
    if (!reservation || reservation.status !== expectedStatus) {
      await this.skip(
        type,
        reservationId,
        reservation
          ? `Ya no está en ${expectedStatus} (está en ${reservation.status})`
          : 'La reserva ya no existe',
      );
      return;
    }

    if (expectedStatus === ReservationStatus.PENDIENTE_DEPOSITO) {
      if (
        reservation.depositExpiresAt &&
        reservation.depositExpiresAt.getTime() > Date.now()
      ) {
        await this.skip(
          type,
          reservationId,
          'El plazo de depósito aún no vence (fue extendido)',
        );
        return;
      }

      if (!reservation.depositExpiresAt) {
        await this.skip(
          type,
          reservationId,
          'Sin plazo de depósito (reserva revivida): la gestiona el administrador',
        );
        return;
      }

      if (reservation.depositExpiresAt.getTime() > Date.now()) {
        await this.skip(
          type,
          reservationId,
          'El plazo de depósito aún no vence (fue extendido)',
        );
        return;
      }
    }

    try {
      await this.adminCancelOrchestrator.execute(
        reservationId,
        reason,
        NOTIFY_CLIENT_ON_TIMEOUT,
        CancellationSource.TIMEOUT,
      );
    } catch (error: unknown) {
      if (error instanceof ConflictException) {
        await this.skip(
          type,
          reservationId,
          'La reserva cambió de estado durante la cancelación',
        );
        return;
      }
      throw error;
    }

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
      await this.skip(
        AutomationExecutionType.NO_SHOW_CHECK,
        reservationId,
        !reservation
          ? 'La reserva ya no existe'
          : reservation.checkedInAt
            ? 'Ya hizo check-in'
            : `Ya no está CONFIRMADA (está en ${reservation.status})`,
      );
      return;
    }

    const graceEndsAt = reservation.scheduledStart.getTime() + NO_SHOW_GRACE_MS;
    if (graceEndsAt > Date.now() + 1_000) {
      await this.skip(
        AutomationExecutionType.NO_SHOW_CHECK,
        reservationId,
        'La cita fue reprogramada: su plazo de gracia aún no vence',
      );
      return;
    }

    const marked = await this.markNoShowOrchestrator.execute(reservationId);
    if (!marked) {
      await this.skip(
        AutomationExecutionType.NO_SHOW_CHECK,
        reservationId,
        'La reserva cambió de estado antes de marcar no-show',
      );
      return;
    }
    await this.executions.log({
      type: AutomationExecutionType.NO_SHOW_CHECK,
      result: AutomationExecutionResult.EXECUTED,
      reservationId,
    });
  }
}
