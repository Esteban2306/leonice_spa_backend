import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  EVENT_TYPES,
  EventPayloadMap,
} from '../../common/events/constants/event.types';
import type { EventOf } from '../../common/events/interface/event.interface';
import { DepositsRepository } from '../repositories/deposits.repositories';

@Injectable()
export class DepositCleanupListener {
  constructor(private readonly depositsRepository: DepositsRepository) {}

  @OnEvent(EVENT_TYPES.RESERVATION_CANCELLED)
  async handleReservationCancelled(
    event: EventOf<EventPayloadMap, typeof EVENT_TYPES.RESERVATION_CANCELLED>,
  ) {
    await this.depositsRepository.markExpiredBySystem(
      event.payload.reservationId,
    );
  }
}
