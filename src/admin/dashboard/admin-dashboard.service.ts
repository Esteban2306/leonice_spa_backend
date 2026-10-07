import { Injectable } from '@nestjs/common';
import { ReservationsRepository } from '../../reservations/repositories/reservations.repository';
import { getDayBoundaries } from '../../reservations/domain/day-boundaries';

@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly reservationsRepository: ReservationsRepository,
  ) {}

  async getSummary() {
    const now = new Date();

    const { dayStart, dayEnd } = getDayBoundaries(now);

    const summary = await this.reservationsRepository.getDashboardSummary(
      dayStart,
      dayEnd,
    );

    return {
      date: dayStart.toISOString(),

      header: {
        todayAppointments: summary.todayAppointments,
        pendingConfirmations: summary.pendingReservations,
      },

      metrics: {
        completedReservations: {
          value: summary.completedReservations,
        },

        pendingReservations: {
          value: summary.pendingReservations,
        },

        dailyEarnings: {
          value: summary.dailyEarnings.toString(),
          currency: 'COP',
        },
      },
    };
  }
}
