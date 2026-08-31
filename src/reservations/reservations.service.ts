import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { AvailabilityRepository } from './repositories/availability.repository';
import { getOperatingWindowsForDate } from './domain/operating-hours';
import { generateAvailableSlots } from './domain/availability-calculator';
import { SafeCacheService } from 'src/infrastructure/redis/safe-cache.service';
import { ReservationsRepository } from './repositories/reservations.repository';
import { formatLocalTime } from './domain/format-local-time';
import { FindReservationsQueryDto } from './dto/find-reservations-query.dto';
import { getDayBoundaries } from './domain/day-boundaries';
import { groupReservationsForDisplay } from './domain/group-reservations-for-display';

const AVAILABILITY_CACHE_TTL_SECONDS = 10;

export interface AvailabilitySlot {
  iso: string;
  localTime: string;
}

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityRepository: AvailabilityRepository,
    private readonly cache: SafeCacheService,
    private readonly reservationsRepository: ReservationsRepository,
  ) {}

  async getAvailability(
    treatmentId: string,
    dateStr: string,
  ): Promise<AvailabilitySlot[]> {
    const cacheKey = `availability:${treatmentId}:${dateStr}`;

    const cached = await this.cache.get<AvailabilitySlot[]>(cacheKey);
    if (cached) return cached;

    const slots = await this.computeAvailability(treatmentId, dateStr);
    const shaped: AvailabilitySlot[] = slots.map((s) => ({
      iso: s.toISOString(),
      localTime: formatLocalTime(s),
    }));

    void this.cache.set(cacheKey, shaped, AVAILABILITY_CACHE_TTL_SECONDS);
    return shaped;
  }

  async getById(id: string) {
    const reservation = await this.reservationsRepository.findById(id);
    if (!reservation) throw new NotFoundException('Reserva no encontrada');
    return reservation;
  }

  async findMany(query: FindReservationsQueryDto) {
    const dayBoundaries = query.date
      ? getDayBoundaries(new Date(`${query.date}T00:00:00`))
      : undefined;
    const reservations = await this.reservationsRepository.findMany({
      dayStart: dayBoundaries?.dayStart,
      dayEnd: dayBoundaries?.dayEnd,
      status: query.status,
      categoryId: query.categoryId,
      clientId: query.clientId,
    });
    return groupReservationsForDisplay(reservations);
  }

  private async computeAvailability(
    treatmentId: string,
    dateStr: string,
  ): Promise<Date[]> {
    const treatment = await this.prisma.client.treatment.findFirst({
      where: { id: treatmentId },
    });

    if (!treatment || !treatment.isActive) {
      throw new NotFoundException('Tratamiento no encontrado');
    }

    const durationMinutes =
      treatment?.baseDurationMaxMinutes ??
      treatment?.baseDurationMinMinutes ??
      60;

    const date = new Date(`${dateStr}T00:00:00`);

    const operatingWindows = getOperatingWindowsForDate(date);
    if (operatingWindows.length === 0) return [];

    const dayStart = operatingWindows[0].start;
    const dayEnd = operatingWindows[operatingWindows.length - 1].end;

    const [held, capacity] = await Promise.all([
      this.availabilityRepository.getHoldingReservationsInRange(
        treatment.categoryId,
        dayStart,
        dayEnd,
      ),
      this.availabilityRepository.getCapacityForCategory(treatment.categoryId),
    ]);

    return generateAvailableSlots({
      operatingWindows,
      held,
      durationMinutes,
      capacity,
    });
  }
}
