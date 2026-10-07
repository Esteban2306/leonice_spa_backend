import { DepositStatus, ReservationStatus } from '@prisma/client';
import { isProofUnderReview } from './group-reservations-for-display';

const withProof = {
  status: DepositStatus.PENDIENTE,
  imageUrl: 'https://img/p.jpg',
};

describe('isProofUnderReview', () => {
  it('true: PENDIENTE_DEPOSITO con último comprobante pendiente y con imagen', () => {
    expect(
      isProofUnderReview(ReservationStatus.PENDIENTE_DEPOSITO, [withProof]),
    ).toBe(true);
  });

  it('false: sin comprobantes', () => {
    expect(isProofUnderReview(ReservationStatus.PENDIENTE_DEPOSITO, [])).toBe(
      false,
    );
  });

  it('false: último comprobante rechazado (el cliente debe resubir)', () => {
    expect(
      isProofUnderReview(ReservationStatus.PENDIENTE_DEPOSITO, [
        { status: DepositStatus.RECHAZADO, imageUrl: 'https://img/p.jpg' },
      ]),
    ).toBe(false);
  });

  it('false: comprobante pendiente sin imagen', () => {
    expect(
      isProofUnderReview(ReservationStatus.PENDIENTE_DEPOSITO, [
        { status: DepositStatus.PENDIENTE, imageUrl: null },
      ]),
    ).toBe(false);
  });

  it('false: la reserva ya no está esperando depósito', () => {
    expect(isProofUnderReview(ReservationStatus.CANCELADA, [withProof])).toBe(
      false,
    );
  });

  it('solo cuenta el más reciente: nuevo pendiente tras uno rechazado', () => {
    expect(
      isProofUnderReview(ReservationStatus.PENDIENTE_DEPOSITO, [
        withProof,
        { status: DepositStatus.RECHAZADO, imageUrl: 'https://img/old.jpg' },
      ]),
    ).toBe(true);
  });
});
