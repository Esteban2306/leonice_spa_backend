import { Injectable, NotFoundException } from '@nestjs/common';
import { CancellationSource, ReservationStatus } from '@prisma/client';
import { ClientsRepository } from '../../clients/repositories/clients.repository';
import { normalizePhone } from '../../clients/utils/normalize-phone.util';
import { DomainException } from '../../common/exceptions/domain.exception';
import { PrismaService } from '../../infrastructure/database/prisma.service';

export interface PendingDepositCandidate {
  reservationId: string;
  treatmentName: string;
  scheduledStart: Date;
  appointment: string;
  depositDueBy: string | null;
  finalPrice: string;
  forThisDeposit: boolean;
}

export interface ReleasedReservation {
  reservationId: string;
  treatmentName: string;
  appointment: string;
  releasedAt: string | null;
}

export const RELEASED_LOOKBACK_DAYS = 14;

const LABEL = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: 'numeric',
  minute: '2-digit',
});

const label = (date: Date | null) => (date ? LABEL.format(date) : null);

@Injectable()
export class PendingDepositLookupService {
  constructor(
    private readonly clientsRepository: ClientsRepository,
    private readonly prisma: PrismaService,
  ) {}

  async findCandidates(
    phone: string,
    now: Date = new Date(),
  ): Promise<{
    clientName: string;
    candidates: PendingDepositCandidate[];
    releasedForMissingDeposit: ReleasedReservation | null;
  }> {
    const client = await this.clientsRepository.findByPhone(
      normalizePhone(phone),
    );
    if (!client) {
      throw new NotFoundException(
        'No existe ningún cliente registrado con este número',
      );
    }

    const [pending, released] = await Promise.all([
      this.prisma.client.reservation.findMany({
        where: {
          clientId: client.id,
          status: ReservationStatus.PENDIENTE_DEPOSITO,
        },
        select: {
          id: true,
          scheduledStart: true,
          depositExpiresAt: true,
          finalPrice: true,
          treatment: { select: { name: true } },
        },
        orderBy: [
          { createdAt: 'desc' },
          { scheduledStart: 'asc' },
          { id: 'asc' },
        ],
      }),
      this.prisma.client.reservation.findFirst({
        where: {
          clientId: client.id,
          status: ReservationStatus.CANCELADA,
          cancellationSource: CancellationSource.TIMEOUT,
          scheduledStart: { gt: now },
          cancelledAt: {
            gte: new Date(now.getTime() - RELEASED_LOOKBACK_DAYS * 86_400_000),
          },
        },
        select: {
          id: true,
          scheduledStart: true,
          cancelledAt: true,
          treatment: { select: { name: true } },
        },
        orderBy: [{ cancelledAt: 'desc' }, { id: 'asc' }],
      }),
    ]);

    return {
      clientName: client.name,
      candidates: pending.map((r, index) => ({
        reservationId: r.id,
        treatmentName: r.treatment.name,
        scheduledStart: r.scheduledStart,
        appointment: label(r.scheduledStart) as string,
        depositDueBy: label(r.depositExpiresAt),
        finalPrice: r.finalPrice.toString(),
        forThisDeposit: index === 0,
      })),
      releasedForMissingDeposit:
        pending.length === 0 && released
          ? {
              reservationId: released.id,
              treatmentName: released.treatment.name,
              appointment: label(released.scheduledStart) as string,
              releasedAt: label(released.cancelledAt),
            }
          : null,
    };
  }

  async resolveSingle(phone: string): Promise<string> {
    const { candidates } = await this.findCandidates(phone);
    if (candidates.length === 0) {
      throw new DomainException(
        'Este cliente no tiene ninguna reserva esperando depósito en este momento',
      );
    }
    return candidates[0].reservationId;
  }
}
