export const QUEUE_NAMES = {
  RESERVATION_TIMEOUTS: 'reservation-timeouts',
  AUTOMATION_COMMUNICATIONS: 'automation-communications',
  CONDUIT_OUTBOX: 'conduit-outbox',
  SIIGO_SYNC: 'siigo-sync',
} as const;

export const JOB_NAMES = {
  // Ciclo de vida de la reserva — corre en RESERVATION_TIMEOUTS
  VALORACION_TIMEOUT: 'valoracion-timeout',
  DEPOSITO_TIMEOUT: 'deposito-timeout',
  NO_SHOW_CHECK: 'no-show-check',
  DEPOSIT_EXPIRY_SWEEP: 'deposit-expiry-sweep',
  IN_PROGRESS_DIGEST: 'in-progress-digest',
  BUSINESS_INFO_RESYNC: 'business-info-resync',
  NO_SHOW_SWEEP: 'no-show-sweep',

  // Comunicación saliente — corre en AUTOMATION_COMMUNICATIONS
  RESERVATION_REMINDER_CHECK: 'reservation-reminder-check',
  REACTIVATION_CHECK: 'reactivation-check',
  CLIENT_RETENTION_SWEEP: 'client-retention-sweep',

  // Conduit - corre en CONDUIT_OUTBOX
  PUBLISH_CONDUIT_EVENT: 'publish-conduit-event',
  CONDUIT_OUTBOX_SWEEP: 'conduit-outbox-sweep',

  SIIGO_SYNC_SWEEP: 'siigo-sync-sweep',

  NOTIFY_ADMIN_DEPOSIT_TIMEOUT: 'notify-admin-deposit-timeout',
  NOTIFY_CLIENT_DEPOSIT_REJECTED: 'notify-client-deposit-rejected',
  NOTIFY_CLIENT_RESCHEDULED: 'notify-client-rescheduled',
  NOTIFY_CLIENT_RESERVATION_CONFIRMED: 'notify-client-reservation-confirmed',
  SEND_CLIENT_DEPOSIT_REMINDER: 'send-client-deposit-reminder',
  LEAD_FOLLOW_UP_SWEEP: 'lead-follow-up-sweep',
  NOTIFY_CLIENT_CANCELLED_BY_ADMIN: 'notify-client-cancelled-by-admin',
  NOTIFY_ADMIN_RESCHEDULED: 'notify-admin-rescheduled',
  NOTIFY_CLIENT_CANCELLATION_CONFIRMED: 'notify-client-cancellation-confirmed',
  NOTIFY_ADMIN_CLIENT_CANCELLED: 'notify-admin-client-cancelled',
  NOTIFY_ADMIN_HANDOFF: 'notify-admin-handoff',
  NOTIFY_ADMIN_PRODUCT_PURCHASE: 'notify-admin-product-purchase',
  NOTIFY_ADMIN_PRODUCT_PAYMENT: 'notify-admin-product-payment',
  NOTIFY_CLIENT_PRODUCT_PAYMENT_REJECTED:
    'notify-client-product-payment-rejected',
  NOTIFY_CLIENT_PRODUCT_ORDER_READY: 'notify-client-product-order-ready',
  NOTIFY_ADMIN_RECEIPT_ISSUE: 'notify-admin-receipt-issue',
  NOTIFY_ADMIN_IN_PROGRESS: 'notify-admin-in-progress',
  NOTIFY_CLIENT_EVENT_TICKET: 'notify-client-event-ticket',
  NOTIFY_CLIENT_EVENT_WINNER: 'notify-client-event-winner',
  SEND_CLIENT_CANCELLATION_LINK: 'send-client-cancellation-link',
} as const;
