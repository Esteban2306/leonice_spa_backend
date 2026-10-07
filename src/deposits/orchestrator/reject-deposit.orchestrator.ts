import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DepositStatus, ReservationStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { DepositsRepository } from '../repositories/deposits.repositories';
import { ReservationsRepository } from '../../reservations/repositories/reservations.repository';
import { DomainException } from '../../common/exceptions/domain.exception';
import {
  JOB_NAMES,
  QUEUE_NAMES,
} from '../../infrastructure/queue/queue.constants';
import { DEPOSITO_TIMEOUT_MS } from '../../reservations/domain/reservation-timing.constants';
import { EventBusService } from '../../common/events/event.service';
import { EVENT_TYPES } from '../../common/events/constants/event.types';

@Injectable()
export class RejectDepositOrchestrator {
  private readonly logger = new Logger(RejectDepositOrchestrator.name);

  constructor(
    private readonly repository: DepositsRepository,
    private readonly reservationsRepository: ReservationsRepository,
    @InjectQueue(QUEUE_NAMES.RESERVATION_TIMEOUTS)
    private readonly timeoutsQueue: Queue,
    private readonly eventBus: EventBusService,
  ) {}

  async execute(reservationId: string, adminUserId: string, reason: string) {
    const deposit =
      await this.repository.findLatestByReservationId(reservationId);
    if (!deposit)
      throw new NotFoundException(
        'No hay ningún comprobante registrado para esta reserva',
      );
    if (deposit.status !== DepositStatus.PENDIENTE) {
      throw new DomainException(
        `Este comprobante ya fue procesado (estado: ${deposit.status})`,
      );
    }

    const reservation =
      await this.reservationsRepository.findByIdWithClientPhone(reservationId);
    const isAwaitingDeposit =
      reservation?.status === ReservationStatus.PENDIENTE_DEPOSITO;
    const newExpiry = isAwaitingDeposit
      ? new Date(Date.now() + DEPOSITO_TIMEOUT_MS)
      : null;

    if (newExpiry) {
      await this.reservationsRepository.extendDepositDeadline(
        reservationId,
        newExpiry,
      );
    }

    const rejected = await this.repository.markRejected(
      deposit.id,
      adminUserId,
      reason,
    );

    if (newExpiry) {
      await this.scheduleTimeout(reservationId, newExpiry);
    }

    if (reservation) {
      this.eventBus.publish(EVENT_TYPES.DEPOSIT_REJECTED, {
        depositId: deposit.id,
        reservationId,
        clientId: reservation.clientId,
        clientPhone: reservation.client.phone,
        reason,
        newDeadline: newExpiry,
      });
    }

    return rejected;
  }

  private async scheduleTimeout(
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
