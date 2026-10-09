import { Injectable } from '@nestjs/common';
import { ClientsRepository } from '../../clients/repositories/clients.repository';
import { hairProfileExpiryCutoff } from '../../clients/domain/hair-profile.util';
import { AppException } from '../../common/errors/app.exception';
import { getCalendarDayKey } from '../../reservations/domain/calendar-day-key';
import { getDayBoundaries } from '../../reservations/domain/day-boundaries';
import { resolveReservationAssessment } from '../../reservations/domain/reservation-assessment';
import { AdminReportsRepository } from './admin-reports.repository';
import { buildDailyReport } from './daily-report';

@Injectable()
export class AdminReportsService {
  constructor(
    private readonly repository: AdminReportsRepository,
    private readonly clientsRepository: ClientsRepository,
  ) {}

  async getDailyReport(dayKey?: string) {
    const now = new Date();
    const today = getDayBoundaries(now);
    const date = dayKey
      ? new Date(`${dayKey}T00:00:00`)
      : new Date(today.dayStart.getTime() - 1);
    const range = getDayBoundaries(date);
    const reportKey = getCalendarDayKey(range.dayStart);

    if (dayKey && reportKey !== dayKey) {
      throw new AppException('BAD_REQUEST', {
        message: `La fecha ${dayKey} no es válida.`,
      });
    }
    if (range.dayStart >= today.dayStart) {
      throw new AppException('BAD_REQUEST', {
        message: 'El reporte diario solo está disponible para días cerrados.',
      });
    }

    const [
      scheduled,
      created,
      reviewedDeposits,
      newClients,
      todayRows,
      pendingDeposits,
      pendingProfiles,
    ] = await Promise.all([
      this.repository.findScheduledOn(range),
      this.repository.findCreatedOn(range),
      this.repository.findDepositsReviewedOn(range),
      this.repository.countClientsCreatedOn(range),
      this.repository.findScheduledWithAssessmentData(today),
      this.repository.countPendingDeposits(),
      this.clientsRepository.findPendingHairProfiles({
        upcomingFrom: today.dayStart,
        expiredBefore: hairProfileExpiryCutoff(now),
        page: 1,
        pageSize: 1,
      }),
    ]);

    return buildDailyReport({
      dayKey: reportKey,
      todayKey: getCalendarDayKey(today.dayStart),
      scheduled,
      created,
      reviewedDeposits,
      newClients,
      today: todayRows.map((row) => ({
        status: row.status,
        scheduledStart: row.scheduledStart,
        assessment: resolveReservationAssessment(row, now),
      })),
      pendingDeposits,
      hairProfilesToRenew: pendingProfiles.total,
    });
  }
}
