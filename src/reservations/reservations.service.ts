import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { AvailabilityRepository } from './repositories/availability.repository';
import { getOperatingWindowsForDate } from './domain/operating-hours';
import { generateAvailableSlots } from './domain/availability-calculator';
import { SafeCacheService } from 'src/infrastructure/redis/safe-cache.service';

const AVAILABILITY_CACHE_TTL_SECONDS = 10;

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityRepository: AvailabilityRepository,
    private readonly cache: SafeCacheService,
  ) {}

  async getAvailability(
    treatmentId: string,
    dateStr: string,
  ): Promise<string[]> {
    const cacheKey = `availability:${treatmentId}:${dateStr}`;

    const cached = await this.cache.get<string[]>(cacheKey);
    if (cached) return cached;

    const slots = await this.computeAvailability(treatmentId, dateStr);
    const isoSlots = slots.map((s) => s.toISOString());

    void this.cache.set(cacheKey, isoSlots, AVAILABILITY_CACHE_TTL_SECONDS);

    return isoSlots;
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
