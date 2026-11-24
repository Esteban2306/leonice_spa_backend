import { Injectable } from '@nestjs/common';
import { SafeCacheService } from '../infrastructure/redis/safe-cache.service';
import { getCalendarDayKey } from '../reservations/domain/calendar-day-key';
import { AppException } from '../common/errors/app.exception';

const CONSULTED_TTL_SECONDS = 60 * 60;
const MAX_RANGE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The bot must look at the availability of a day before it books it. The lock is per chat and per day, and it
 * only rejects when the cache is healthy, so a cache outage never stops a booking.
 */
@Injectable()
export class AvailabilityConsultedService {
  constructor(private readonly cache: SafeCacheService) {}

  private key(phone: string, day: string) {
    return `conduit:availability-consulted:${phone}:${day}`;
  }

  async markDay(phone: string | null | undefined, day: string): Promise<void> {
    if (!phone) return;
    await this.cache.set(this.key(phone, day), 1, CONSULTED_TTL_SECONDS);
  }

  async markRange(
    phone: string | null | undefined,
    from: string,
    to: string,
  ): Promise<void> {
    if (!phone) return;
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${to}T00:00:00Z`);
    if (Number.isNaN(start) || Number.isNaN(end)) return;
    const days = Math.min(
      Math.max(Math.round((end - start) / DAY_MS) + 1, 1),
      MAX_RANGE_DAYS,
    );
    await Promise.all(
      Array.from({ length: days }, (_, i) =>
        this.markDay(
          phone,
          new Date(start + i * DAY_MS).toISOString().slice(0, 10),
        ),
      ),
    );
  }

  async assertConsulted(
    phone: string | null | undefined,
    scheduledStart: Date,
  ): Promise<void> {
    if (!phone) return;
    const day = getCalendarDayKey(scheduledStart);
    if (await this.cache.get(this.key(phone, day))) return;
    const probe = `conduit:availability-probe:${phone}`;
    await this.cache.set(probe, 1, 30);
    if (!(await this.cache.get(probe))) return;
    throw new AppException('AVAILABILITY_NOT_CONSULTED', {
      details: { date: day },
    });
  }
}
