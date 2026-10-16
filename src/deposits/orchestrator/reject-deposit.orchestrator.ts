import { Injectable, NotFoundException } from '@nestjs/common';
import { DepositStatus, ReservationStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DepositsRepository } from '../repositories/deposits.repositories';
import { ReservationsRepository } from '../../reservations/repositories/reservations.repository';
import { DomainException } from '../../common/exceptions/domain.exception';
import { AppException } from '../../common/errors/app.exception';
import { DepositDeadlineService } from '../../reservations/service/deposit-deadline.service';
import { EventBusService } from '../../common/events/event.service';
import { EVENT_TYPES } from '../../common/events/constants/event.types';

@Injectable()
export class RejectDepositOrchestrator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: DepositsRepository,
    private readonly reservationsRepository: ReservationsRepository,
    private readonly depositDeadline: DepositDeadlineService,
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
    const depositClockStartedAt = new Date();
    const candidateExpiry = isAwaitingDeposit
      ? await this.depositDeadline.computeExpiry(
          depositClockStartedAt,
          reservation.scheduledStart,
        )
      : null;

    const { rejected, newExpiry } = await this.prisma.client.$transaction(
      async (tx) => {
        const applied = await this.repository.markRejectedIfPending(
          deposit.id,
          adminUserId,
          reason,
          tx,
        );
        const record = applied
          ? await this.repository.findById(deposit.id, tx)
          : null;
        if (!record) {
          throw new AppException('DEPOSIT_CONCURRENT_CHANGE', {
            details: { depositId: deposit.id },
          });
        }

        const restarted = candidateExpiry
          ? await this.reservationsRepository.restartDepositDeadlineIfAwaiting(
              reservationId,
              { depositClockStartedAt, depositExpiresAt: candidateExpiry },
              tx,
            )
          : false;

        return {
          rejected: record,
          newExpiry: restarted ? candidateExpiry : null,
        };
      },
    );

    if (newExpiry) {
      await this.depositDeadline.scheduleTimeout(reservationId, newExpiry);
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
}
