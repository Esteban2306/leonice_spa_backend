import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { ReservationStateMachine } from '../domain/reservation-state-machine';
import { DepositCreditService } from '../service/deposit-credit.service';
import { AppException } from '../../common/errors/app.exception';
import type { ErrorCode } from '../../common/errors/error-catalog';
import { getCalendarDayKey } from '../domain/calendar-day-key';

export const CHECK_IN_ERROR_CODES = {
  CREDIT_COMMITTED_ELSEWHERE: 'RESERVATION_CREDIT_COMMITTED_ELSEWHERE',
} as const satisfies Record<string, ErrorCode>;

@Injectable()
export class CheckInReservationOrchestrator {
  private readonly logger = new Logger(CheckInReservationOrchestrator.name);

  constructor(
    private readonly repository: ReservationsRepository,
    private readonly depositCredit: DepositCreditService,
  ) {}

  async execute(reservationId: string, now: Date = new Date()) {
    const reservation = await this.repository.findById(reservationId);
    if (!reservation) throw new NotFoundException('Reserva no encontrada');
    if (reservation.status === ReservationStatus.CITA_EN_CURSO) {
      return reservation;
    }

    ReservationStateMachine.assertTransition(
      reservation.status,
      ReservationStatus.CITA_EN_CURSO,
    );

    const today = getCalendarDayKey(now);
    const appointmentDay = getCalendarDayKey(reservation.scheduledStart);
    if (today !== appointmentDay) {
      throw new AppException('RESERVATION_CHECK_IN_NOT_TODAY', {
        details: { reservationId, appointmentDay, today },
      });
    }

    if (reservation.status === ReservationStatus.NO_SHOW) {
      const committed =
        await this.depositCredit.isDepositCommittedElsewhere(reservationId);
      if (committed) {
        throw new AppException(
          CHECK_IN_ERROR_CODES.CREDIT_COMMITTED_ELSEWHERE,
          {
            details: { reservationId },
          },
        );
      }
      this.logger.warn(
        `Reserva ${reservationId} revivida desde NO_SHOW — el cliente llegó tarde y el admin decidió atenderlo igual`,
      );
    }

    const applied = await this.repository.updateStatusIfCurrent(
      reservationId,
      reservation.status,
      { status: ReservationStatus.CITA_EN_CURSO, checkedInAt: now },
    );
    if (!applied) {
      throw new AppException('RESERVATION_CONCURRENT_CHANGE');
    }

    const updated = await this.repository.findById(reservationId);
    if (!updated) throw new NotFoundException('Reserva no encontrada');
    return updated;
  }
}
