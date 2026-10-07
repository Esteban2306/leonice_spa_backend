import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';
import { ReservationsRepository } from '../repositories/reservations.repository';
import { ReservationStateMachine } from '../domain/reservation-state-machine';
import { DepositCreditService } from '../service/deposit-credit.service';
import { DomainException } from '../../common/exceptions/domain.exception';

export const CHECK_IN_ERROR_CODES = {
  CREDIT_COMMITTED_ELSEWHERE: 'RESERVATION_CREDIT_COMMITTED_ELSEWHERE',
} as const;

@Injectable()
export class CheckInReservationOrchestrator {
  private readonly logger = new Logger(CheckInReservationOrchestrator.name);

  constructor(
    private readonly repository: ReservationsRepository,
    private readonly depositCredit: DepositCreditService,
  ) {}

  async execute(reservationId: string) {
    const reservation = await this.repository.findById(reservationId);
    if (!reservation) throw new NotFoundException('Reserva no encontrada');

    ReservationStateMachine.assertTransition(
      reservation.status,
      ReservationStatus.CITA_EN_CURSO,
    );

    if (reservation.status === ReservationStatus.NO_SHOW) {
      const committed =
        await this.depositCredit.isDepositCommittedElsewhere(reservationId);
      if (committed) {
        throw new DomainException({
          code: CHECK_IN_ERROR_CODES.CREDIT_COMMITTED_ELSEWHERE,
          message:
            'El adelanto de esta reserva ya respalda otra reserva. No se puede atender sin descontarlo allí.',
          reservationId,
        });
      }
      this.logger.warn(
        `Reserva ${reservationId} revivida desde NO_SHOW — el cliente llegó tarde y el admin decidió atenderlo igual`,
      );
    }

    const applied = await this.repository.updateStatusIfCurrent(
      reservationId,
      reservation.status,
      { status: ReservationStatus.CITA_EN_CURSO, checkedInAt: new Date() },
    );
    if (!applied) {
      throw new ConflictException(
        'La reserva cambió de estado mientras se registraba la llegada. Revisa su estado actual.',
      );
    }

    const updated = await this.repository.findById(reservationId);
    if (!updated) throw new NotFoundException('Reserva no encontrada');
    return updated;
  }
}
