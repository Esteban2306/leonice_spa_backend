const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

export function describeDepositWindow(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new RangeError('La ventana de depósito debe ser un número positivo');
  }

  if (ms % HOUR_MS === 0) {
    const hours = ms / HOUR_MS;
    return hours === 1 ? '1 hora' : `${hours} horas`;
  }

  const minutes = Math.round(ms / MINUTE_MS);
  return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
}
