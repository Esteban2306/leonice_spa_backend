const SHORT_DATE = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});
const MAX_NAME = 30;

const clip = (text: string) =>
  text.length > MAX_NAME ? `${text.slice(0, MAX_NAME - 1).trimEnd()}…` : text;

export function inProgressLine(item: {
  clientName: string;
  treatmentName: string;
  scheduledStart: Date;
}): string {
  return `• ${SHORT_DATE.format(item.scheduledStart)}: ${clip(item.clientName)} (${clip(item.treatmentName)})`;
}
