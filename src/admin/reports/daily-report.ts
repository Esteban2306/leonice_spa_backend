import {
  CancellationSource,
  DepositStatus,
  ReservationChannel,
  ReservationStatus,
} from '@prisma/client';
import type { ReservationAssessment } from '../../reservations/domain/reservation-assessment';

export const TOP_TREATMENTS_LIMIT = 5;

export interface ScheduledReservationRow {
  status: ReservationStatus;
  cancellationSource: CancellationSource | null;
  finalPrice: { toString(): string };
  treatment: { id: string; name: string };
  category: { id: string; name: string };
}

export interface CreatedReservationRow {
  channel: ReservationChannel;
}

export interface ReviewedDepositRow {
  status: DepositStatus;
  amount: { toString(): string } | null;
}

export interface TodayReservationRow {
  status: ReservationStatus;
  scheduledStart: Date;
  assessment: ReservationAssessment;
}

export interface DailyReportInput {
  dayKey: string;
  todayKey: string;
  scheduled: readonly ScheduledReservationRow[];
  created: readonly CreatedReservationRow[];
  reviewedDeposits: readonly ReviewedDepositRow[];
  newClients: number;
  today: readonly TodayReservationRow[];
  pendingDeposits: number;
  hairProfilesToRenew: number;
}

const LIVE_TODAY: readonly ReservationStatus[] = [
  ReservationStatus.PENDIENTE_VALORACION,
  ReservationStatus.PENDIENTE_DEPOSITO,
  ReservationStatus.CONFIRMADA,
  ReservationStatus.CITA_EN_CURSO,
];

const OPEN_STATUSES: readonly ReservationStatus[] = [
  ...LIVE_TODAY,
  ReservationStatus.SOLICITUD_INICIADA,
];

function sumMoney(
  values: ReadonlyArray<{ toString(): string } | null>,
): string {
  const total = values.reduce<number>(
    (sum, value) => sum + Number(value?.toString() ?? 0),
    0,
  );
  return total.toFixed(2);
}

export function buildDailyReport(input: DailyReportInput) {
  const byStatus = (status: ReservationStatus) =>
    input.scheduled.filter((r) => r.status === status);
  const cancelled = byStatus(ReservationStatus.CANCELADA);
  const completed = byStatus(ReservationStatus.COMPLETADA);
  const attended = input.scheduled.filter(
    (r) =>
      r.status !== ReservationStatus.CANCELADA &&
      r.status !== ReservationStatus.REPROGRAMADA,
  );

  const treatmentCounts = new Map<
    string,
    { treatmentId: string; name: string; category: string; count: number }
  >();
  for (const r of attended) {
    const current = treatmentCounts.get(r.treatment.id);
    if (current) current.count += 1;
    else
      treatmentCounts.set(r.treatment.id, {
        treatmentId: r.treatment.id,
        name: r.treatment.name,
        category: r.category.name,
        count: 1,
      });
  }

  const categoryCounts = new Map<
    string,
    { categoryId: string; name: string; scheduled: number; completed: number }
  >();
  for (const r of attended) {
    const current = categoryCounts.get(r.category.id) ?? {
      categoryId: r.category.id,
      name: r.category.name,
      scheduled: 0,
      completed: 0,
    };
    current.scheduled += 1;
    if (r.status === ReservationStatus.COMPLETADA) current.completed += 1;
    categoryCounts.set(r.category.id, current);
  }

  const approved = input.reviewedDeposits.filter(
    (d) =>
      d.status === DepositStatus.CONFIRMADO ||
      d.status === DepositStatus.CONVERTIDO_A_CREDITO,
  );
  const liveToday = input.today
    .filter((r) => LIVE_TODAY.includes(r.status))
    .sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime());

  return {
    date: input.dayKey,
    appointments: {
      scheduled: input.scheduled.length,
      completed: completed.length,
      noShow: byStatus(ReservationStatus.NO_SHOW).length,
      rescheduled: byStatus(ReservationStatus.REPROGRAMADA).length,
      cancelled: cancelled.length,
      cancelledBy: {
        CLIENT: cancelled.filter((r) => r.cancellationSource === 'CLIENT')
          .length,
        ADMIN: cancelled.filter((r) => r.cancellationSource === 'ADMIN').length,
        TIMEOUT: cancelled.filter((r) => r.cancellationSource === 'TIMEOUT')
          .length,
      },
      leftOpen: input.scheduled.filter((r) => OPEN_STATUSES.includes(r.status))
        .length,
    },
    revenue: {
      completedServices: sumMoney(completed.map((r) => r.finalPrice)),
      depositsApproved: {
        count: approved.length,
        amount: sumMoney(approved.map((d) => d.amount)),
      },
      depositsRejected: input.reviewedDeposits.filter(
        (d) => d.status === DepositStatus.RECHAZADO,
      ).length,
    },
    bookings: {
      created: input.created.length,
      byChannel: {
        WHATSAPP: input.created.filter((r) => r.channel === 'WHATSAPP').length,
        WEB: input.created.filter((r) => r.channel === 'WEB').length,
      },
    },
    newClients: input.newClients,
    topTreatments: [...treatmentCounts.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, TOP_TREATMENTS_LIMIT),
    categories: [...categoryCounts.values()].sort(
      (a, b) => b.scheduled - a.scheduled || a.name.localeCompare(b.name),
    ),
    today: {
      date: input.todayKey,
      appointments: liveToday.length,
      firstAppointmentAt: liveToday[0]?.scheduledStart ?? null,
      pendingDeposits: input.pendingDeposits,
      pendingAssessments: liveToday.filter(
        (r) => r.assessment.state === 'PENDING',
      ).length,
      hairProfilesToRenew: input.hairProfilesToRenew,
    },
  };
}

export type DailyReport = ReturnType<typeof buildDailyReport>;
