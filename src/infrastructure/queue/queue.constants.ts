export const QUEUE_NAMES = {
  RESERVATION_TIMEOUTS: 'reservation-timeouts',
  AUTOMATION_COMMUNICATIONS: 'automation-communications',
} as const;

export const JOB_NAMES = {
  // Ciclo de vida de la reserva — corre en RESERVATION_TIMEOUTS
  VALORACION_TIMEOUT: 'valoracion-timeout',
  DEPOSITO_TIMEOUT: 'deposito-timeout',
  NO_SHOW_CHECK: 'no-show-check',

  // Comunicación saliente — corre en AUTOMATION_COMMUNICATIONS
  RESERVATION_REMINDER_CHECK: 'reservation-reminder-check',
  REACTIVATION_CHECK: 'reactivation-check',
} as const;
