import { ReservationStatus } from '@prisma/client';
import { InvalidTransitionException } from '../../common/exceptions/invalid-transition.exception';

const ALLOWED_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  SOLICITUD_INICIADA: [
    ReservationStatus.PENDIENTE_VALORACION,
    ReservationStatus.PENDIENTE_DEPOSITO,
    ReservationStatus.CANCELADA,
  ],
  PENDIENTE_VALORACION: [
    ReservationStatus.PENDIENTE_DEPOSITO,
    ReservationStatus.CANCELADA,
    ReservationStatus.REPROGRAMADA,
  ],
  PENDIENTE_DEPOSITO: [
    ReservationStatus.CONFIRMADA,
    ReservationStatus.CANCELADA,
    ReservationStatus.REPROGRAMADA,
  ],
  CONFIRMADA: [
    ReservationStatus.CITA_EN_CURSO,
    ReservationStatus.CANCELADA,
    ReservationStatus.REPROGRAMADA,
    ReservationStatus.NO_SHOW,
  ],

  CITA_EN_CURSO: [ReservationStatus.COMPLETADA],
  COMPLETADA: [],
  CANCELADA: [],
  NO_SHOW: [ReservationStatus.CITA_EN_CURSO],
  REPROGRAMADA: [],
};

export class ReservationStateMachine {
  static assertTransition(
    from: ReservationStatus,
    to: ReservationStatus,
  ): void {
    const allowed = ALLOWED_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new InvalidTransitionException(
        `No se puede pasar de "${from}" a "${to}"`,
      );
    }
  }

  static isTerminal(status: ReservationStatus): boolean {
    return (ALLOWED_TRANSITIONS[status] ?? []).length === 0;
  }

  static canTransition(
    from: ReservationStatus,
    to: ReservationStatus,
  ): boolean {
    return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
  }
}
