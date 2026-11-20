export const SPECIAL_HOURS_HORIZON_DAYS = 60;
export const SPECIAL_HOURS_MAX_CHARS = 480;

export interface SpecialHoursRow {
  dayKey: string;
  windows: ReadonlyArray<readonly [number, number]>;
  startMinutes: readonly number[];
  reason: string | null;
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function clock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h < 12 ? 'a. m.' : 'p. m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

function dayParts(dayKey: string): {
  day: number;
  month: string;
  year: string;
} {
  const [year, month, day] = dayKey.split('-');
  return { day: Number(day), month: MONTHS[Number(month) - 1], year };
}

function nextDayKey(dayKey: string): string {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function describeRange(from: string, to: string): string {
  const a = dayParts(from);
  const b = dayParts(to);
  if (from === to) return `${a.day} de ${a.month}`;
  if (a.month === b.month && a.year === b.year) {
    return `${a.day} al ${b.day} de ${b.month}`;
  }
  return `${a.day} de ${a.month} al ${b.day} de ${b.month}`;
}

function describeHours(row: SpecialHoursRow): string {
  if (row.windows.length === 0) return 'cerrado';
  if (row.startMinutes.length > 0) {
    return `citas a las ${joinList(row.startMinutes.map(clock))}`;
  }
  return `abierto ${joinList(
    row.windows.map(([start, end]) => `de ${clock(start)} a ${clock(end)}`),
  )}`;
}

function signature(row: SpecialHoursRow): string {
  return JSON.stringify([row.windows, row.startMinutes, row.reason ?? '']);
}

export function describeSpecialHours(rows: readonly SpecialHoursRow[]): string {
  const sorted = [...rows].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  const groups: Array<{ from: string; to: string; row: SpecialHoursRow }> = [];
  for (const row of sorted) {
    const last = groups[groups.length - 1];
    if (
      last &&
      nextDayKey(last.to) === row.dayKey &&
      signature(last.row) === signature(row)
    ) {
      last.to = row.dayKey;
    } else {
      groups.push({ from: row.dayKey, to: row.dayKey, row });
    }
  }

  const parts: string[] = [];
  let length = 0;
  for (const group of groups) {
    const reason = group.row.reason?.trim();
    const text = `${describeRange(group.from, group.to)}: ${describeHours(group.row)}${reason ? ` (${reason})` : ''}`;
    const added = (parts.length > 0 ? 3 : 0) + text.length;
    if (length + added > SPECIAL_HOURS_MAX_CHARS) break;
    parts.push(text);
    length += added;
  }
  return parts.join(' | ');
}
