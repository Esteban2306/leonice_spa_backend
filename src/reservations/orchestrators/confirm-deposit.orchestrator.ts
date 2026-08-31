import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ReservationStatus } from '@prisma/client';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { ReservationStateMachine } from '../domain/reservation-state-machine';
import {
  QUEUE_NAMES,
  JOB_NAMES,
} from '../../infrastructure/queue/queue.constants';
import { NO_SHOW_GRACE_MS } from '../domain/reservation-timing.constants';
import { EVENT_TYPES } from 'src/common/events/constants/event.types';
import { EventBusService } from 'src/common/events/event.service';

@Injectable()
export class ConfirmDepositOrchestrator {
  constructor(
    private readonly repository: ReservationsRepository,
    private readonly eventBus: EventBusService,
    @InjectQueue(QUEUE_NAMES.RESERVATION_TIMEOUTS)
    private readonly timeoutsQueue: Queue,
  ) {}

  async execute(reservationId: string) {
    const reservation = await this.repository.findById(reservationId);
    if (!reservation) throw new NotFoundException('Reserva no encontrada');

    ReservationStateMachine.assertTransition(
      reservation.status,
      ReservationStatus.CONFIRMADA,
    );

    const updated = await this.repository.updateStatus(reservationId, {
      status: ReservationStatus.CONFIRMADA,
    });

    const delay = Math.max(
      updated.scheduledStart.getTime() + NO_SHOW_GRACE_MS - Date.now(),
      0,
    );
    await this.timeoutsQueue.add(
      JOB_NAMES.NO_SHOW_CHECK,
      { reservationId },
      { delay },
    );

    this.eventBus.publish(EVENT_TYPES.RESERVATION_CONFIRMED, {
      reservationId: updated.id,
      clientId: updated.clientId,
      scheduledStart: updated.scheduledStart,
    });
    return updated;
  }
}
