import { Injectable } from '@nestjs/common';
import { ReservationsRepository } from '../../reservations/repositories/reservations.repository';
import { getDayBoundaries } from '../../reservations/domain/day-boundaries';
import { FindCalendarQueryDto } from './dto/find-calendar-query.dto';

@Injectable()
export class AdminCalendarService {
  constructor(
    private readonly reservationsRepository: ReservationsRepository,
  ) {}

  async findByDate(query: FindCalendarQueryDto) {
    const { dayStart, dayEnd } = getDayBoundaries(
      new Date(`${query.date}T00:00:00`),
    );

    const reservations = await this.reservationsRepository.findManyForCalendar(
      dayStart,
      dayEnd,
    );

    return {
      date: query.date,

      reservations: reservations.map((reservation) => ({
        id: reservation.id,

        status: reservation.status,

        channel: reservation.channel,

        scheduledStart: reservation.scheduledStart,

        scheduledEnd: reservation.scheduledEnd,

        finalPrice: reservation.finalPrice.toString(),

        finalDurationMinutes: reservation.finalDurationMinutes,

        client: reservation.client,

        treatment: reservation.treatment,

        category: reservation.category,

        deposit: reservation.deposit[0]
          ? {
              id: reservation.deposit[0].id,
              status: reservation.deposit[0].status,
              coverage: reservation.deposit[0].coverage,
              imageUrl: reservation.deposit[0].imageUrl,
            }
          : null,
      })),
    };
  }
}
