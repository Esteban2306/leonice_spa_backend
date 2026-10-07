import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma, Reservation, ReservationStatus } from '@prisma/client';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { ReservationStateMachine } from '../domain/reservation-state-machine';
import {
  QUEUE_NAMES,
  JOB_NAMES,
} from '../../infrastructure/queue/queue.constants';
import { NO_SHOW_GRACE_MS } from '../domain/reservation-timing.constants';
import { EVENT_TYPES } from 'src/common/events/constants/event.types';
import { EventBusService } from 'src/common/events/event.service';
import { AppException } from '../../common/errors/app.exception';

@Injectable()
export class ConfirmDepositOrchestrator {
  private readonly logger = new Logger(ConfirmDepositOrchestrator.name);

  constructor(
    private readonly repository: ReservationsRepository,
    private readonly eventBus: EventBusService,
    @InjectQueue(QUEUE_NAMES.RESERVATION_TIMEOUTS)
    private readonly timeoutsQueue: Queue,
  ) {}

  async execute(reservationId: string): Promise<Reservation> {
    const updated = await this.confirmStatus(reservationId);
    await this.afterConfirmed(updated);
    return updated;
  }

  async confirmStatus(
    reservationId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Reservation> {
    const reservation = await this.repository.findById(reservationId, tx);
    if (!reservation) throw new NotFoundException('Reserva no encontrada');

    ReservationStateMachine.assertTransition(
      reservation.status,
      ReservationStatus.CONFIRMADA,
    );

    const applied = await this.repository.updateStatusIfCurrent(
      reservationId,
      reservation.status,
      { status: ReservationStatus.CONFIRMADA },
      tx,
    );
    if (!applied) {
      throw new AppException('RESERVATION_CONCURRENT_CHANGE');
    }

    const updated = await this.repository.findById(reservationId, tx);
    if (!updated) throw new NotFoundException('Reserva no encontrada');
    return updated;
  }

  async afterConfirmed(updated: Reservation): Promise<void> {
    await this.scheduleNoShowCheck(updated.id, updated.scheduledStart);

    this.eventBus.publish(EVENT_TYPES.RESERVATION_CONFIRMED, {
      reservationId: updated.id,
      clientId: updated.clientId,
      scheduledStart: updated.scheduledStart,
    });
  }

  private async scheduleNoShowCheck(
    reservationId: string,
    scheduledStart: Date,
  ): Promise<void> {
    try {
      const delay = Math.max(
        scheduledStart.getTime() + NO_SHOW_GRACE_MS - Date.now(),
        0,
      );
      await this.timeoutsQueue.add(
        JOB_NAMES.NO_SHOW_CHECK,
        { reservationId },
        { delay },
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `No se pudo encolar no-show-check de ${reservationId}; NO hay barrido que lo cubra: ${message}`,
      );
    }
  }
}
