import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { AppException } from '../../common/errors/app.exception';
import { EventBusService } from '../../common/events/event.service';
import { EVENT_TYPES } from '../../common/events/constants/event.types';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { getDayBoundaries } from '../domain/day-boundaries';
import { getCalendarDayKey } from '../domain/calendar-day-key';
import {
  CancellationLinkClaims,
  signCancellationLink,
  verifyCancellationLink,
} from '../domain/cancellation-link-token';
import {
  CLIENT_CANCELLABLE_STATUSES,
  ClientCancellationScope,
} from '../domain/client-cancellation';
import {
  CancelReservationOrchestrator,
  ClientCancellationResult,
} from '../orchestrators/cancel-reservation.orchestrator';

export interface IssuedCancellationLink {
  reservationId: string;
  url: string;
  expiresAt: Date;
  sent: boolean;
}

@Injectable()
export class CancellationLinkService {
  constructor(
    private readonly config: ConfigService,
    private readonly repository: ReservationsRepository,
    private readonly cancelOrchestrator: CancelReservationOrchestrator,
    private readonly eventBus: EventBusService,
  ) {}

  async issue(
    reservationId: string,
    options: { send: boolean },
    now: Date = new Date(),
  ): Promise<IssuedCancellationLink> {
    const reservation = await this.repository.findById(reservationId);
    if (!reservation) throw new NotFoundException('Reserva no encontrada');
    if (!CLIENT_CANCELLABLE_STATUSES.includes(reservation.status)) {
      throw new AppException('RESERVATION_NOT_CANCELLABLE', {
        details: { reservationId },
      });
    }
    if (reservation.scheduledStart.getTime() <= now.getTime()) {
      throw new AppException('RESERVATION_CANCEL_TOO_LATE', {
        details: { reservationId },
      });
    }

    const expiresAt = getDayBoundaries(reservation.scheduledStart).dayEnd;
    const token = signCancellationLink(this.secret(), {
      clientId: reservation.clientId,
      reservationId,
      expiresAt,
    });
    const url = `${this.baseUrl()}/${token}`;

    if (options.send) {
      this.eventBus.publish(EVENT_TYPES.CANCELLATION_LINK_REQUESTED, {
        reservationId,
        url,
        expiresAt,
      });
    }
    return { reservationId, url, expiresAt, sent: options.send };
  }

  async describe(token: string, now: Date = new Date()) {
    const claims = this.verify(token, now);
    const anchor = await this.requireAnchor(claims);
    const { dayStart, dayEnd } = getDayBoundaries(anchor.scheduledStart);
    const reservations = await this.repository.findClientReservationsOnDay({
      clientId: claims.clientId,
      dayStart,
      dayEnd,
    });
    const client = await this.repository.findByIdWithClientPhone(anchor.id);

    return {
      clientFirstName: client?.client.name.split(/\s+/)[0] ?? null,
      date: getCalendarDayKey(anchor.scheduledStart),
      expiresAt: claims.expiresAt,
      linkReservationId: claims.reservationId,
      reservations: reservations.map((r) => ({
        reservationId: r.id,
        treatment: r.treatment.name,
        scheduledStart: r.scheduledStart,
        scheduledEnd: r.scheduledEnd,
        status: r.status,
        cancellable:
          CLIENT_CANCELLABLE_STATUSES.includes(r.status) &&
          r.scheduledStart.getTime() > now.getTime(),
      })),
    };
  }

  async cancel(
    token: string,
    input: {
      scope: ClientCancellationScope;
      reservationId?: string;
      reason?: string;
    },
    now: Date = new Date(),
  ): Promise<ClientCancellationResult> {
    const claims = this.verify(token, now);
    const anchor = await this.requireAnchor(claims);
    const targetId = input.reservationId ?? claims.reservationId;

    if (targetId !== anchor.id) {
      const target = await this.repository.findById(targetId);
      const sameDay =
        target &&
        target.clientId === claims.clientId &&
        getCalendarDayKey(target.scheduledStart) ===
          getCalendarDayKey(anchor.scheduledStart);
      if (!sameDay) {
        throw new AppException('RESERVATION_NOT_OWNED', {
          details: { reservationId: targetId },
        });
      }
    }

    return this.cancelOrchestrator.execute(
      {
        clientId: claims.clientId,
        reservationId: targetId,
        scope: input.scope,
        channel: 'LINK',
        reason: input.reason,
      },
      now,
    );
  }

  private verify(token: string, now: Date): CancellationLinkClaims {
    const result = verifyCancellationLink(this.secret(), token, now);
    if (result.ok) return result.claims;
    throw new AppException(
      result.reason === 'EXPIRED'
        ? 'CANCELLATION_LINK_EXPIRED'
        : 'CANCELLATION_LINK_INVALID',
    );
  }

  private async requireAnchor(claims: CancellationLinkClaims) {
    const anchor = await this.repository.findById(claims.reservationId);
    if (!anchor || anchor.clientId !== claims.clientId) {
      throw new AppException('CANCELLATION_LINK_INVALID');
    }
    return anchor;
  }

  private secret(): string {
    const configured = this.config.get<string>('CANCELLATION_LINK_SECRET');
    if (configured) return configured;
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET'))
      .update('cancellation-link-v1')
      .digest('hex');
  }

  private baseUrl(): string {
    const configured = this.config.get<string>('CLIENT_CANCELLATION_URL');
    if (configured) return configured.replace(/\/+$/, '');
    const origin = (
      this.config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000'
    )
      .split(',')[0]
      .trim()
      .replace(/\/+$/, '');
    return `${origin}/cancelar`;
  }
}
