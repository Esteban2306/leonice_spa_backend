import {
  DepositRecord,
  DepositStatus,
  DepositVerificationMethod,
  ReservationChannel,
  ReservationStatus,
} from '@prisma/client';
import {
  groupReservationsForDisplay,
  ReservationWithRelations,
} from './group-reservations-for-display';
import { Decimal } from '@prisma/client/runtime/library';

interface FakeReservationOverrides {
  id: string;
  clientId?: string;
  comboGroupId?: string | null;
  status?: ReservationStatus;
  scheduledStart: Date;
  scheduledEnd: Date;
  deposit?: DepositRecord[];
}

function fakeDeposit(
  overrides: Partial<DepositRecord> & Pick<DepositRecord, 'status'>,
): DepositRecord {
  return {
    id: 'd1',
    reservationId: '1',
    method: DepositVerificationMethod.MANUAL,
    verifiedByUserId: null,
    verifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    amount: null,
    coverage: null,
    appliedToReservationId: null,
    imageCloudinaryId: null,
    imageUrl: null,
    rejectionReason: null,
    ...overrides,
  };
}

function fakeReservation(
  overrides: FakeReservationOverrides,
): ReservationWithRelations {
  const clientId = overrides.clientId ?? 'client-1';

  return {
    id: overrides.id,
    clientId,
    categoryId: 'c1',
    treatmentId: 't1',
    status: overrides.status ?? ReservationStatus.CONFIRMADA,
    channel: ReservationChannel.WEB,
    comboGroupId: overrides.comboGroupId ?? null,
    coveredByDepositId: null,
    scheduledStart: overrides.scheduledStart,
    scheduledEnd: overrides.scheduledEnd,
    finalPrice: new Decimal(100),
    finalDurationMinutes: 60,
    valoracionPhotoReference: null,
    valoracionRespondedAt: null,
    checkedInAt: null,
    completedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    cancellationSource: null,
    rescheduledFromId: null,
    depositExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    client: { id: clientId, name: 'Test', phone: '123' },
    treatment: { id: 't1', name: 'Tratamiento' },
    category: { id: 'c1', name: 'Categoría' },
    deposit: overrides.deposit ?? [],
  };
}

describe('groupReservationsForDisplay', () => {
  it('agrupa por comboGroupId explícito', () => {
    const result = groupReservationsForDisplay([
      fakeReservation({
        id: '1',
        comboGroupId: 'g1',
        scheduledStart: new Date('2026-01-01T08:00'),
        scheduledEnd: new Date('2026-01-01T10:00'),
      }),
      fakeReservation({
        id: '2',
        comboGroupId: 'g1',
        scheduledStart: new Date('2026-01-01T10:00'),
        scheduledEnd: new Date('2026-01-01T11:00'),
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].isCombo).toBe(true);
  });

  it('agrupa reservas separadas por el almuerzo, sin comboGroupId (el bug de hoy)', () => {
    const result = groupReservationsForDisplay([
      fakeReservation({
        id: '1',
        scheduledStart: new Date('2026-09-16T08:00:00'),
        scheduledEnd: new Date('2026-09-16T12:00:00'),
      }),
      fakeReservation({
        id: '2',
        scheduledStart: new Date('2026-09-16T14:00:00'),
        scheduledEnd: new Date('2026-09-16T15:00:00'),
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].isCombo).toBe(true);
  });

  it('agrupa mismo cliente y mismo día aunque haya horario abierto entre las dos', () => {
    const result = groupReservationsForDisplay([
      fakeReservation({
        id: '1',
        scheduledStart: new Date('2026-09-16T08:00:00'),
        scheduledEnd: new Date('2026-09-16T09:00:00'),
      }),
      fakeReservation({
        id: '2',
        scheduledStart: new Date('2026-09-16T11:00:00'),
        scheduledEnd: new Date('2026-09-16T12:00:00'),
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.isCombo).toBe(true);
  });

  it('NO agrupa al mismo cliente en días calendario distintos', () => {
    const result = groupReservationsForDisplay([
      fakeReservation({
        id: '1',
        scheduledStart: new Date('2026-09-16T14:00:00'),
        scheduledEnd: new Date('2026-09-16T15:00:00'),
      }),
      fakeReservation({
        id: '2',
        scheduledStart: new Date('2026-09-17T08:00:00'),
        scheduledEnd: new Date('2026-09-17T09:00:00'),
      }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.every((g) => !g.isCombo)).toBe(true);
  });

  it('NO agrupa clientes distintos aunque el horario encaje', () => {
    const result = groupReservationsForDisplay([
      fakeReservation({
        id: '1',
        clientId: 'client-1',
        scheduledStart: new Date('2026-01-01T08:00'),
        scheduledEnd: new Date('2026-01-01T09:00'),
      }),
      fakeReservation({
        id: '2',
        clientId: 'client-2',
        scheduledStart: new Date('2026-01-01T09:00'),
        scheduledEnd: new Date('2026-01-01T10:00'),
      }),
    ]);
    expect(result).toHaveLength(2);
  });

  it('marca isProofUnderReview solo con comprobante pendiente con imagen en PENDIENTE_DEPOSITO', () => {
    const start = new Date('2026-09-16T08:00:00');
    const end = new Date('2026-09-16T09:00:00');

    const [underReview, rejected, withoutProof] = [
      fakeReservation({
        id: '1',
        clientId: 'c-a',
        status: ReservationStatus.PENDIENTE_DEPOSITO,
        scheduledStart: start,
        scheduledEnd: end,
        deposit: [
          fakeDeposit({
            status: DepositStatus.PENDIENTE,
            imageUrl: 'https://img/p.jpg',
          }),
        ],
      }),
      fakeReservation({
        id: '2',
        clientId: 'c-b',
        status: ReservationStatus.PENDIENTE_DEPOSITO,
        scheduledStart: start,
        scheduledEnd: end,
        deposit: [
          fakeDeposit({
            status: DepositStatus.RECHAZADO,
            imageUrl: 'https://img/p.jpg',
          }),
        ],
      }),
      fakeReservation({
        id: '3',
        clientId: 'c-c',
        status: ReservationStatus.PENDIENTE_DEPOSITO,
        scheduledStart: start,
        scheduledEnd: end,
      }),
    ].map((r) => groupReservationsForDisplay([r])[0]?.items[0]);

    expect(underReview?.isProofUnderReview).toBe(true);
    expect(rejected?.isProofUnderReview).toBe(false);
    expect(withoutProof?.isProofUnderReview).toBe(false);
  });
});
