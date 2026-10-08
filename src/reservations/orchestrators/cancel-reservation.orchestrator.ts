import { Injectable } from '@nestjs/common';
import { CancellationSource, ReservationStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { EventBusService } from '../../common/events/event.service';
import { EVENT_TYPES } from '../../common/events/constants/event.types';
import { AppException } from '../../common/errors/app.exception';
import { normalizePhone } from '../../clients/utils/normalize-phone.util';
import { getDayBoundaries } from '../domain/day-boundaries';
import {
  ClientCancellationChannel,
  ClientCancellationScope,
  planClientCancellation,
} from '../domain/client-cancellation';

export interface ClientCancellationCommand {
  clientId: string;
  reservationId: string;
  scope: ClientCancellationScope;
  channel: ClientCancellationChannel;
  reason?: string;
}

export interface CancelledReservationView {
  reservationId: string;
  treatment: string;
  scheduledStart: Date;
  scheduledEnd: Date;
}

export interface ClientCancellationResult {
  scope: ClientCancellationScope;
  cancelled: CancelledReservationView[];
  alreadyCancelled: CancelledReservationView[];
}

@Injectable()
export class CancelReservationOrchestrator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: ReservationsRepository,
    private readonly eventBus: EventBusService,
  ) {}

  async executeVerifiedByPhone(
    params: Omit<ClientCancellationCommand, 'clientId'> & { phone: string },
  ): Promise<ClientCancellationResult> {
    const reservation = await this.repository.findByIdWithClientPhone(
      params.reservationId,
    );
    if (
      !reservation ||
      reservation.client.phone !== normalizePhone(params.phone)
    ) {
      throw new AppException('RESERVATION_NOT_OWNED', {
        details: { reservationId: params.reservationId },
      });
    }
    return this.execute({
      clientId: reservation.clientId,
      reservationId: params.reservationId,
      scope: params.scope,
      channel: params.channel,
      reason: params.reason,
    });
  }

  async execute(
    command: ClientCancellationCommand,
    now: Date = new Date(),
  ): Promise<ClientCancellationResult> {
    const target = await this.repository.findById(command.reservationId);
    if (!target || target.clientId !== command.clientId) {
      throw new AppException('RESERVATION_NOT_OWNED', {
        details: { reservationId: command.reservationId },
      });
    }

    const { dayStart, dayEnd } = getDayBoundaries(target.scheduledStart);
    const sameDay = await this.repository.findClientReservationsOnDay({
      clientId: command.clientId,
      dayStart,
      dayEnd,
    });

    const plan = planClientCancellation({
      target,
      sameDay,
      scope: command.scope,
      now,
    });
    if (!plan.ok) {
      throw new AppException(plan.code, {
        details: { reservationId: plan.reservationId },
      });
    }

    const reason = command.reason?.trim() || undefined;
    await this.prisma.client.$transaction(async (tx) => {
      for (const reservation of plan.toCancel) {
        const applied = await this.repository.updateStatusIfCurrent(
          reservation.id,
          reservation.status,
          {
            status: ReservationStatus.CANCELADA,
            cancelledAt: now,
            cancellationReason: reason ?? null,
            cancellationSource: CancellationSource.CLIENT,
          },
          tx,
        );
        if (!applied) {
          throw new AppException('RESERVATION_CONCURRENT_CHANGE', {
            details: { reservationId: reservation.id },
          });
        }
      }
    });

    for (const reservation of plan.toCancel) {
      this.eventBus.publish(EVENT_TYPES.RESERVATION_CANCELLED, {
        reservationId: reservation.id,
        clientId: command.clientId,
        reason,
      });
    }
    if (plan.toCancel.length > 0) {
      this.eventBus.publish(EVENT_TYPES.CLIENT_CANCELLATION_COMPLETED, {
        clientId: command.clientId,
        reservationIds: plan.toCancel.map((r) => r.id),
        channel: command.channel,
      });
    }

    const view = (ids: readonly { id: string }[]) =>
      sameDay
        .filter((r) => ids.some((x) => x.id === r.id))
        .map((r) => ({
          reservationId: r.id,
          treatment: r.treatment.name,
          scheduledStart: r.scheduledStart,
          scheduledEnd: r.scheduledEnd,
        }));

    return {
      scope: command.scope,
      cancelled: view(plan.toCancel),
      alreadyCancelled: view(plan.alreadyCancelled),
    };
  }
}
