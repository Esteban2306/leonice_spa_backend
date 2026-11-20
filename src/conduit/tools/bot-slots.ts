import type {
  AvailabilityDay,
  AvailabilitySlot,
} from '../../reservations/reservations.service';

const BOGOTA_HOUR = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

export function onePerHour(
  slots: readonly AvailabilitySlot[],
): AvailabilitySlot[] {
  const seen = new Set<string>();
  return [...slots]
    .sort((a, b) => a.iso.localeCompare(b.iso))
    .filter((slot) => {
      const hour = BOGOTA_HOUR.format(new Date(slot.iso));
      if (seen.has(hour)) return false;
      seen.add(hour);
      return true;
    });
}

export function onePerHourByDay<T extends Pick<AvailabilityDay, 'slots'>>(
  days: readonly T[],
): T[] {
  return days.map((day) => ({ ...day, slots: onePerHour(day.slots) }));
}
