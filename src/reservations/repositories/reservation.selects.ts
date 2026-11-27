import { Prisma } from '@prisma/client';

export const LATEST_DEPOSIT_ORDER = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.DepositRecordOrderByWithRelationInput[];

export const SCHEDULE_ORDER = [
  { scheduledStart: 'asc' },
  { id: 'asc' },
] satisfies Prisma.ReservationOrderByWithRelationInput[];

const latestDeposit = {
  orderBy: LATEST_DEPOSIT_ORDER,
  take: 1,
  select: {
    id: true,
    status: true,
    coverage: true,
    imageUrl: true,
    amount: true,
  },
} satisfies Prisma.Reservation$depositArgs;

const assessedClient = {
  select: {
    id: true,
    name: true,
    phone: true,
    hairLength: true,
    hairColor: true,
    hairProfileUpdatedAt: true,
  },
} satisfies Prisma.ClientDefaultArgs;

const assessedTreatment = {
  select: {
    id: true,
    name: true,
    requiresPriorAssessment: true,
    hasHairVariablePricing: true,
  },
} satisfies Prisma.TreatmentDefaultArgs;

const namedCategory = {
  select: { id: true, name: true },
} satisfies Prisma.CategoryDefaultArgs;

export const APPOINTMENT_SELECT = {
  id: true,
  clientId: true,
  comboGroupId: true,
  status: true,
  channel: true,
  scheduledStart: true,
  scheduledEnd: true,
  finalPrice: true,
  finalDurationMinutes: true,
  depositExpiresAt: true,
  coveredByDepositId: true,
  checkedInAt: true,
  cancelledAt: true,
  cancellationSource: true,
  cancellationReason: true,
  dependent: { select: { name: true } },
  client: assessedClient,
  treatment: assessedTreatment,
  category: namedCategory,
  deposit: latestDeposit,
} satisfies Prisma.ReservationSelect;

export const GROUPED_APPOINTMENT_SELECT = {
  ...APPOINTMENT_SELECT,
  appliedDeposits: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, amount: true },
  },
} satisfies Prisma.ReservationSelect;

export const RESERVATION_DETAIL_SELECT = {
  id: true,
  status: true,
  comboGroupId: true,
  scheduledStart: true,
  scheduledEnd: true,
  finalPrice: true,
  finalDurationMinutes: true,
  dependent: { select: { name: true } },
  client: { select: { id: true, name: true, phone: true } },
  treatment: { select: { id: true, name: true } },
  category: namedCategory,
  deposit: {
    orderBy: LATEST_DEPOSIT_ORDER,
    select: {
      id: true,
      status: true,
      coverage: true,
      imageUrl: true,
      amount: true,
      rejectionReason: true,
      createdAt: true,
    },
  },
} satisfies Prisma.ReservationSelect;

export const RESERVATION_OWNER_SELECT = {
  id: true,
  clientId: true,
  status: true,
  scheduledStart: true,
  client: { select: { phone: true, name: true } },
  dependent: { select: { name: true } },
} satisfies Prisma.ReservationSelect;
