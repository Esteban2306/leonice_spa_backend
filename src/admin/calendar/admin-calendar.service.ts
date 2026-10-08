import { Injectable } from '@nestjs/common';
import { ReservationsRepository } from '../../reservations/repositories/reservations.repository';
import { resolveCalendarRange } from '../../reservations/domain/calendar-range';
import {
  isProofUnderReview,
  toLatestDepositSummary,
} from '../../reservations/domain/group-reservations-for-display';
import { FindCalendarQueryDto } from './dto/find-calendar-query.dto';

export const CALENDAR_MAX_RANGE_DAYS = 62;

@Injectable()
export class AdminCalendarService {
  constructor(
    private readonly reservationsRepository: ReservationsRepository,
  ) {}

  async findByDate(query: FindCalendarQueryDto) {
    const { dayStart, dayEnd } = resolveCalendarRange(
      query.date ? { date: query.date } : { from: query.from, to: query.to },
      CALENDAR_MAX_RANGE_DAYS,
    );

    const reservations = await this.reservationsRepository.findManyForCalendar(
      dayStart!,
      dayEnd!,
    );

    return {
      date: query.date ?? null,
      from: query.date ?? query.from,
      to: query.date ?? query.to,

      reservations: reservations.map((reservation) => ({
        id: reservation.id,
        status: reservation.status,
        channel: reservation.channel,
        comboGroupId: reservation.comboGroupId,
        scheduledStart: reservation.scheduledStart,
        scheduledEnd: reservation.scheduledEnd,
        finalPrice: reservation.finalPrice.toString(),
        finalDurationMinutes: reservation.finalDurationMinutes,
        depositExpiresAt: reservation.depositExpiresAt,
        checkedInAt: reservation.checkedInAt,
        cancellationSource: reservation.cancellationSource,
        cancellationReason: reservation.cancellationReason,
        cancelledAt: reservation.cancelledAt,
        isProofUnderReview: isProofUnderReview(
          reservation.status,
          reservation.deposit,
        ),
        client: reservation.client,
        treatment: reservation.treatment,
        category: reservation.category,
        deposit: reservation.deposit[0]
          ? {
              id: reservation.deposit[0].id,
              status: reservation.deposit[0].status,
              coverage: reservation.deposit[0].coverage,
              imageUrl: reservation.deposit[0].imageUrl,
              amount:
                toLatestDepositSummary(reservation.deposit)?.amount ?? null,
            }
          : null,
      })),
    };
  }
}
