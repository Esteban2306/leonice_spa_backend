import { HairColor, HairLength, ReservationStatus } from '@prisma/client';
import { resolveReservationAssessment } from './reservation-assessment';

const NOW = new Date('2026-10-09T15:00:00Z');
const validProfile = {
  hairLength: HairLength.LARGO,
  hairColor: HairColor.OSCURO,
  hairProfileUpdatedAt: new Date('2026-09-01T15:00:00Z'),
};
const expiredProfile = {
  ...validProfile,
  hairProfileUpdatedAt: new Date('2026-01-01T15:00:00Z'),
};

describe('resolveReservationAssessment', () => {
  it('marca pendiente un servicio con valoración y cliente sin perfil', () => {
    expect(
      resolveReservationAssessment(
        {
          status: ReservationStatus.CONFIRMADA,
          treatment: { requiresPriorAssessment: true },
          client: {},
        },
        NOW,
      ),
    ).toEqual({
      state: 'PENDING',
      reason: 'REQUIRES_ASSESSMENT',
      hairProfileStatus: 'MISSING',
    });
  });

  it('marca pendiente el precio por cabello con perfil vencido', () => {
    const result = resolveReservationAssessment(
      {
        status: ReservationStatus.PENDIENTE_DEPOSITO,
        treatment: { hasHairVariablePricing: true },
        client: expiredProfile,
      },
      NOW,
    );

    expect(result.state).toBe('PENDING');
    expect(result.reason).toBe('HAIR_PRICING');
    expect(result.hairProfileStatus).toBe('EXPIRED');
  });

  it('da por hecha la valoración con perfil vigente', () => {
    expect(
      resolveReservationAssessment(
        {
          status: ReservationStatus.CONFIRMADA,
          treatment: { requiresPriorAssessment: true },
          client: validProfile,
        },
        NOW,
      ).state,
    ).toBe('DONE');
  });

  it('no pide valoración en reservas cerradas ni en servicios que no la usan', () => {
    expect(
      resolveReservationAssessment(
        {
          status: ReservationStatus.COMPLETADA,
          treatment: { requiresPriorAssessment: true },
          client: {},
        },
        NOW,
      ).state,
    ).toBe('NOT_REQUIRED');
    expect(
      resolveReservationAssessment(
        {
          status: ReservationStatus.CONFIRMADA,
          treatment: {},
          client: {},
        },
        NOW,
      ).state,
    ).toBe('NOT_REQUIRED');
  });
});
