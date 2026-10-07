const BUSINESS_TIME_ZONE = 'America/Bogota';

const formatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: BUSINESS_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

export function formatNotificationDateTime(date: Date): string {
  return formatter.format(date);
}
