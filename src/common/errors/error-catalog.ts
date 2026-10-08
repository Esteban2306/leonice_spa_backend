import { HttpStatus } from '@nestjs/common';

export interface ErrorDefinition {
  readonly status: HttpStatus;
  readonly message: string;
}

const GENERIC = {
  VALIDATION_FAILED: {
    status: HttpStatus.BAD_REQUEST,
    message: 'La solicitud tiene datos inválidos.',
  },
  BAD_REQUEST: {
    status: HttpStatus.BAD_REQUEST,
    message: 'La solicitud no es válida.',
  },
  UNAUTHORIZED: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'Debes iniciar sesión.',
  },
  FORBIDDEN: {
    status: HttpStatus.FORBIDDEN,
    message: 'No tienes permiso para realizar esta acción.',
  },
  CSRF_INVALID: {
    status: HttpStatus.FORBIDDEN,
    message: 'Token CSRF inválido o ausente. Recarga la sesión.',
  },
  NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'El recurso solicitado no existe.',
  },
  CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'La operación entra en conflicto con el estado actual.',
  },
  UNIQUE_CONSTRAINT_VIOLATION: {
    status: HttpStatus.CONFLICT,
    message: 'Ya existe un registro con esos datos.',
  },
  PAYLOAD_TOO_LARGE: {
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    message: 'El archivo o la solicitud es demasiado grande.',
  },
  UNSUPPORTED_MEDIA_TYPE: {
    status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    message: 'El tipo de archivo no es compatible.',
  },
  RATE_LIMITED: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    message: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.',
  },
  SERVICE_UNAVAILABLE: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: 'El servicio no está disponible en este momento.',
  },
  INTERNAL_ERROR: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: 'Ocurrió un error inesperado. Intenta de nuevo.',
  },
} as const satisfies Record<string, ErrorDefinition>;

const PLACEMENT = {
  PLACEMENT_INVALID_RANGE: {
    status: HttpStatus.BAD_REQUEST,
    message: 'El rango de horas de la reserva no es válido.',
  },
  PLACEMENT_OUTSIDE_OPERATING_HOURS: {
    status: HttpStatus.BAD_REQUEST,
    message:
      'El horario solicitado está fuera del horario de atención del spa.',
  },
  PLACEMENT_IN_THE_PAST: {
    status: HttpStatus.CONFLICT,
    message: 'La fecha ya pasó. Elige un horario futuro.',
  },
  PLACEMENT_CATEGORY_DAY_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'Ya hay otra reserva activa de esta categoría ese día.',
  },
  PLACEMENT_CLIENT_OVERLAP: {
    status: HttpStatus.CONFLICT,
    message: 'Hay otra reserva del cliente que se cruza con este horario.',
  },
  PLACEMENT_NO_CAPACITY: {
    status: HttpStatus.CONFLICT,
    message: 'Ya no hay cupo disponible para ese horario.',
  },
} as const satisfies Record<string, ErrorDefinition>;

const RESERVATION = {
  RESERVATION_INVALID_TRANSITION: {
    status: HttpStatus.CONFLICT,
    message: 'La reserva no puede pasar a ese estado desde su estado actual.',
  },
  RESERVATION_CONCURRENT_CHANGE: {
    status: HttpStatus.CONFLICT,
    message:
      'La reserva cambió de estado mientras se procesaba. Revisa su estado actual.',
  },
  RESERVATION_NOT_RESCHEDULABLE: {
    status: HttpStatus.CONFLICT,
    message:
      'Solo se pueden reagendar reservas pendientes de depósito o confirmadas.',
  },
  RESERVATION_RESCHEDULE_SAME_SLOT: {
    status: HttpStatus.CONFLICT,
    message: 'La reserva ya está en ese horario.',
  },
  RESERVATION_RESCHEDULE_CONCURRENT_CHANGE: {
    status: HttpStatus.CONFLICT,
    message:
      'La reserva cambió mientras se reagendaba. Revisa su estado actual.',
  },
  RESERVATION_NOT_REVIVABLE: {
    status: HttpStatus.CONFLICT,
    message: 'Solo se pueden revivir reservas canceladas por tiempo.',
  },
  RESERVATION_COMBO_NOT_REVIVABLE: {
    status: HttpStatus.CONFLICT,
    message: 'El combo no se puede revivir completo.',
  },
  RESERVATION_REVIVE_SLOT_IN_PAST: {
    status: HttpStatus.CONFLICT,
    message: 'El horario de la reserva ya pasó; reagéndala en su lugar.',
  },
  RESERVATION_REVIVE_OUTSIDE_OPERATING_HOURS: {
    status: HttpStatus.CONFLICT,
    message: 'El horario de la reserva quedó fuera del horario de atención.',
  },
  RESERVATION_REVIVE_NO_CAPACITY: {
    status: HttpStatus.CONFLICT,
    message: 'Ya no hay cupo en el horario original de la reserva.',
  },
  RESERVATION_REVIVE_CATEGORY_DAY_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'El cliente ya tiene otra reserva de esta categoría ese día.',
  },
  RESERVATION_REVIVE_CLIENT_OVERLAP: {
    status: HttpStatus.CONFLICT,
    message: 'El cliente tiene otra reserva que se cruza con ese horario.',
  },
  RESERVATION_REVIVE_CONCURRENT_CHANGE: {
    status: HttpStatus.CONFLICT,
    message: 'La reserva cambió mientras se revivía. Revisa su estado actual.',
  },
  RESERVATION_CREDIT_COMMITTED_ELSEWHERE: {
    status: HttpStatus.CONFLICT,
    message:
      'El adelanto de esta reserva ya respalda otra reserva. No se puede atender sin descontarlo allí.',
  },
  CREDIT_ALREADY_APPLIED: {
    status: HttpStatus.CONFLICT,
    message:
      'El crédito del cliente se usó en otra reserva al mismo tiempo. Intenta de nuevo.',
  },
} as const satisfies Record<string, ErrorDefinition>;

const DEPOSIT = {
  DEPOSIT_AMOUNT_REQUIRED: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Debes indicar el monto que entregó el cliente.',
  },
  DEPOSIT_NOT_PENDING: {
    status: HttpStatus.CONFLICT,
    message: 'No hay un comprobante pendiente por aprobar en esta reserva.',
  },
  DEPOSIT_CONCURRENT_CHANGE: {
    status: HttpStatus.CONFLICT,
    message:
      'El comprobante cambió mientras se aprobaba. Revisa su estado actual.',
  },
} as const satisfies Record<string, ErrorDefinition>;

export const ERROR_CATALOG = {
  ...GENERIC,
  ...PLACEMENT,
  ...RESERVATION,
  ...DEPOSIT,
} as const;

export type ErrorCode = keyof typeof ERROR_CATALOG;

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && value in ERROR_CATALOG;
}
