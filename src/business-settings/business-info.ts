export const BUSINESS_DAY_NAMES = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
] as const;

export const DEPOSIT_DEADLINE_TEXT =
  'El anticipo debe pagarse y enviarse el comprobante dentro de 2 horas de atención; si no, la reserva se cancela.';

export interface BusinessSettingsRow {
  depositAmount: number | null;
  depositInstructions: string | null;
  depositPolicy: string | null;
  cancellationPolicy: string | null;
  address: string | null;
  additionalInfo: string | null;
}

export interface OperatingWindowRow {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

export function minutesToClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h < 12 ? 'a. m.' : 'p. m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function buildBotBusinessInfo(
  settings: BusinessSettingsRow,
  windows: readonly OperatingWindowRow[],
) {
  const weeklySchedule = BUSINESS_DAY_NAMES.map((day, dayOfWeek) => {
    const ranges = windows
      .filter((w) => w.dayOfWeek === dayOfWeek)
      .map(
        (w) =>
          `${minutesToClock(w.startMinute)} a ${minutesToClock(w.endMinute)}`,
      );
    return { day, hours: ranges.length ? ranges.join(' y ') : 'cerrado' };
  });

  return {
    depositAmount: settings.depositAmount,
    depositAmountCop:
      settings.depositAmount != null ? settings.depositAmount * 1000 : null,
    depositInstructions: settings.depositInstructions,
    depositPolicy: settings.depositPolicy,
    depositDeadline: DEPOSIT_DEADLINE_TEXT,
    cancellationPolicy: settings.cancellationPolicy,
    address: settings.address,
    additionalInfo: settings.additionalInfo,
    timeZone: 'America/Bogota',
    weeklySchedule,
  };
}

export type BotBusinessInfo = ReturnType<typeof buildBotBusinessInfo>;

export const BUSINESS_INFO_EVENT = 'business.info.updated';

export function businessInfoEventPayload(info: BotBusinessInfo) {
  const peso = (cop: number | null) =>
    cop == null ? '' : `$${cop.toLocaleString('es-CO')}`;
  return {
    deposit_amount: peso(info.depositAmountCop),
    deposit_instructions: info.depositInstructions ?? '',
    deposit_policy: info.depositPolicy ?? '',
    deposit_deadline: info.depositDeadline,
    cancellation_policy: info.cancellationPolicy ?? '',
    address: info.address ?? '',
    additional_info: info.additionalInfo ?? '',
    schedule: info.weeklySchedule.map((d) => `${d.day} ${d.hours}`).join('; '),
  };
}

export const BUSINESS_INFO_MAPPING_RULES: Record<string, string> = {
  deposit_amount: 'negocio.anticipo',
  deposit_instructions: 'negocio.como_pagar_anticipo',
  deposit_policy: 'negocio.politica_anticipo',
  deposit_deadline: 'negocio.plazo_anticipo',
  cancellation_policy: 'negocio.politica_cancelacion',
  address: 'negocio.direccion',
  additional_info: 'negocio.informacion_adicional',
  schedule: 'negocio.horario',
};
