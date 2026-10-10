import { Injectable } from '@nestjs/common';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { UpdateBusinessSettingsDto } from './dto/update-business-settings.dto';

const SETTINGS_ID = 'default';
const DAY_NAMES = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

function minutesToClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h < 12 ? 'a. m.' : 'p. m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

@Injectable()
export class BusinessSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const settings = await this.prisma.client.businessSettings.findUnique({
      where: { id: SETTINGS_ID },
    });
    return (
      settings ?? {
        id: SETTINGS_ID,
        depositAmount: null,
        depositInstructions: null,
        depositPolicy: null,
        cancellationPolicy: null,
        address: null,
        additionalInfo: null,
        updatedByUserId: null,
        updatedAt: null,
      }
    );
  }

  update(dto: UpdateBusinessSettingsDto, userId?: string) {
    const data = { ...dto, updatedByUserId: userId ?? null };
    return this.prisma.client.businessSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data },
      update: data,
    });
  }

  /**
   * Lo que el bot necesita para informar sin inventar: datos de pago del
   * anticipo, políticas y horario semanal en texto legible (Bogotá).
   * Montos en miles de COP, como el resto de la API.
   */
  async forBot() {
    const [settings, windows] = await Promise.all([
      this.get(),
      this.prisma.client.operatingWindow.findMany({
        orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
      }),
    ]);

    const schedule = DAY_NAMES.map((day, dayOfWeek) => {
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
      depositDeadline:
        'El anticipo debe pagarse y enviarse el comprobante dentro de 2 horas de atención; si no, la reserva se cancela.',
      cancellationPolicy: settings.cancellationPolicy,
      address: settings.address,
      additionalInfo: settings.additionalInfo,
      timeZone: 'America/Bogota',
      weeklySchedule: schedule,
    };
  }
}
