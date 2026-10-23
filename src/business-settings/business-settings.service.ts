import { Injectable } from '@nestjs/common';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { UpdateBusinessSettingsDto } from './dto/update-business-settings.dto';
import { EventBusService } from '../common/events/event.service';
import { EVENT_TYPES } from '../common/events/constants/event.types';
import { BUSINESS_DAY_NAMES, buildBotBusinessInfo } from './business-info';

const SETTINGS_ID = 'default';
const DAY_NAMES = BUSINESS_DAY_NAMES;

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

@Injectable()
export class BusinessSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

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

  async update(dto: UpdateBusinessSettingsDto, userId?: string) {
    const data = { ...dto, updatedByUserId: userId ?? null };
    const saved = await this.prisma.client.businessSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data },
      update: data,
    });
    this.eventBus.publish(EVENT_TYPES.BUSINESS_INFO_CHANGED, {
      source: 'settings',
    });
    return saved;
  }

  async publicHours() {
    const windows = await this.prisma.client.operatingWindow.findMany({
      orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
      select: { dayOfWeek: true, startMinute: true, endMinute: true },
    });
    return {
      timeZone: 'America/Bogota',
      days: DAY_NAMES.map((_, dayOfWeek) => ({
        dayOfWeek,
        windows: windows
          .filter((w) => w.dayOfWeek === dayOfWeek)
          .map((w) => ({
            opens: minutesToTime(w.startMinute),
            closes: minutesToTime(w.endMinute),
          })),
      })),
    };
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
    return buildBotBusinessInfo(settings, windows);
  }
}
