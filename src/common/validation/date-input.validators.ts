import { ValidationOptions, registerDecorator } from 'class-validator';

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ZONED_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,3})?)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function isRealCalendarDate(year: number, month: number, day: number): boolean {
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = CALENDAR_DATE.exec(value);
  if (!match) return false;
  return isRealCalendarDate(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  );
}

export function isZonedDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = ZONED_DATE_TIME.exec(value);
  if (!match) return false;
  return (
    isRealCalendarDate(Number(match[1]), Number(match[2]), Number(match[3])) &&
    !Number.isNaN(Date.parse(value))
  );
}

export function calendarDateToUtcMidnight(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function utcMidnightToCalendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function IsCalendarDate(options?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      name: 'isCalendarDate',
      target: target.constructor,
      propertyName,
      options: {
        message: `${propertyName} debe ser una fecha de calendario real con formato YYYY-MM-DD`,
        ...options,
      },
      validator: { validate: isCalendarDate },
    });
  };
}

export function IsZonedDateTime(options?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      name: 'isZonedDateTime',
      target: target.constructor,
      propertyName,
      options: {
        message: `${propertyName} debe ser fecha y hora ISO 8601 con zona explícita (por ejemplo 2026-12-09T08:00:00-05:00 o ...Z)`,
        ...options,
      },
      validator: { validate: isZonedDateTime },
    });
  };
}
