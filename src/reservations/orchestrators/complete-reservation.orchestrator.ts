import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReservationStatus, SiigoSyncStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { ReservationStateMachine } from '../domain/reservation-state-machine';
import {
  collectedMatchesBalance,
  derivePaymentMethod,
} from '../domain/payment-settlement';
import { ReservationSettlementService } from '../service/reservation-settlement.service';
import { buildSiigoIncomePayload } from '../../siigo/domain/siigo-income-payload';
import { EventBusService } from 'src/common/events/event.service';
import { EVENT_TYPES } from 'src/common/events/constants/event.types';
import { AppException } from '../../common/errors/app.exception';

export interface CompleteReservationCommand {
  reservationId: string;
  adminUserId: string;
  cashAmount: number;
  transferAmount: number;
  advanceAmount?: number;
}

@Injectable()
export class CompleteReservationOrchestrator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: ReservationsRepository,
    private readonly settlement: ReservationSettlementService,
    private readonly eventBus: EventBusService,
  ) {}

  async execute(command: CompleteReservationCommand) {
    const { reservationId } = command;
    const reservation = await this.repository.findById(reservationId);
    if (!reservation) throw new NotFoundException('Reserva no encontrada');
    if (reservation.status === ReservationStatus.COMPLETADA) {
      return reservation;
    }

    ReservationStateMachine.assertTransition(
      reservation.status,
      ReservationStatus.COMPLETADA,
    );

    const completedAt = new Date();
    await this.prisma.client.$transaction(async (tx) => {
      const settlement = await this.settlement.compute(reservationId, tx);
      const advance = this.resolveAdvance(settlement, command.advanceAmount);
      const breakdown = {
        price: settlement.price,
        advance,
        cash: command.cashAmount,
        transfer: command.transferAmount,
      };
      if (!collectedMatchesBalance(breakdown)) {
        throw new AppException('PAYMENT_AMOUNT_MISMATCH', {
          details: {
            price: settlement.price,
            advance,
            expectedCollected: Math.max(settlement.price - advance, 0),
            receivedCollected: command.cashAmount + command.transferAmount,
          },
        });
      }

      const applied = await this.repository.updateStatusIfCurrent(
        reservationId,
        reservation.status,
        { status: ReservationStatus.COMPLETADA, completedAt },
        tx,
      );
      if (!applied) throw new AppException('RESERVATION_CONCURRENT_CHANGE');

      const method = derivePaymentMethod(breakdown);
      await tx.reservationPayment.create({
        data: {
          reservationId,
          totalAmount: settlement.price,
          advanceAmount: advance,
          cashAmount: command.cashAmount,
          transferAmount: command.transferAmount,
          method,
          recordedByUserId: command.adminUserId,
        },
      });

      const treatment = await tx.treatment.findUniqueOrThrow({
        where: { id: reservation.treatmentId },
        select: { id: true, name: true },
      });
      const payload = buildSiigoIncomePayload({
        reservationId,
        completedAt,
        treatment,
        price: settlement.price,
        paymentMethod: method,
        cash: command.cashAmount,
        transfer: command.transferAmount,
        advance,
      });
      await tx.siigoSync.create({
        data: {
          reservationId,
          status: SiigoSyncStatus.PENDIENTE,
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      });
    });

    const updated = await this.repository.findById(reservationId);
    if (!updated) throw new NotFoundException('Reserva no encontrada');

    this.eventBus.publish(EVENT_TYPES.RESERVATION_COMPLETED, {
      reservationId: updated.id,
      clientId: updated.clientId,
      treatmentId: updated.treatmentId,
      categoryId: updated.categoryId,
    });
    return updated;
  }

  private resolveAdvance(
    settlement: { advance: number | null; advanceShared: boolean },
    provided: number | undefined,
  ): number {
    if (settlement.advanceShared) {
      if (provided === undefined) {
        throw new AppException('PAYMENT_ADVANCE_REQUIRED');
      }
      return provided;
    }
    if (provided !== undefined && provided !== settlement.advance) {
      throw new AppException('PAYMENT_ADVANCE_NOT_EDITABLE', {
        details: { registeredAdvance: settlement.advance },
      });
    }
    return settlement.advance ?? 0;
  }
}
