import { PaymentMethod } from '@prisma/client';
import {
  balanceDue,
  collectedMatchesBalance,
  derivePaymentMethod,
} from './payment-settlement';

describe('payment-settlement', () => {
  describe('balanceDue', () => {
    it('resta el anticipo del precio', () => {
      expect(balanceDue(250, 100)).toBe(150);
    });

    it('no baja de cero si el anticipo cubre más que el precio', () => {
      expect(balanceDue(100, 250)).toBe(0);
    });

    it('evita errores de coma flotante', () => {
      expect(balanceDue(0.3, 0.1)).toBe(0.2);
    });
  });

  describe('collectedMatchesBalance', () => {
    it('acepta efectivo igual al saldo', () => {
      expect(
        collectedMatchesBalance({
          price: 250,
          advance: 100,
          cash: 150,
          transfer: 0,
        }),
      ).toBe(true);
    });

    it('acepta un cobro mixto que suma el saldo', () => {
      expect(
        collectedMatchesBalance({
          price: 250,
          advance: 100,
          cash: 100,
          transfer: 50,
        }),
      ).toBe(true);
    });

    it('rechaza si falta dinero', () => {
      expect(
        collectedMatchesBalance({
          price: 250,
          advance: 100,
          cash: 100,
          transfer: 0,
        }),
      ).toBe(false);
    });

    it('rechaza si sobra dinero', () => {
      expect(
        collectedMatchesBalance({
          price: 250,
          advance: 100,
          cash: 200,
          transfer: 0,
        }),
      ).toBe(false);
    });

    it('acepta cobrar cero cuando el anticipo cubre todo', () => {
      expect(
        collectedMatchesBalance({
          price: 250,
          advance: 250,
          cash: 0,
          transfer: 0,
        }),
      ).toBe(true);
    });
  });

  describe('derivePaymentMethod', () => {
    it('es MIXTO si hay efectivo y anticipo por transferencia', () => {
      expect(
        derivePaymentMethod({ advance: 100, cash: 150, transfer: 0 }),
      ).toBe(PaymentMethod.MIXTO);
    });

    it('es EFECTIVO si todo fue en efectivo y no hubo anticipo', () => {
      expect(derivePaymentMethod({ advance: 0, cash: 250, transfer: 0 })).toBe(
        PaymentMethod.EFECTIVO,
      );
    });

    it('es TRANSFERENCIA si el saldo se pagó por transferencia', () => {
      expect(
        derivePaymentMethod({ advance: 100, cash: 0, transfer: 150 }),
      ).toBe(PaymentMethod.TRANSFERENCIA);
    });

    it('es TRANSFERENCIA si el anticipo cubrió todo', () => {
      expect(derivePaymentMethod({ advance: 250, cash: 0, transfer: 0 })).toBe(
        PaymentMethod.TRANSFERENCIA,
      );
    });

    it('es MIXTO si hay efectivo y transferencia hoy', () => {
      expect(
        derivePaymentMethod({ advance: 0, cash: 100, transfer: 150 }),
      ).toBe(PaymentMethod.MIXTO);
    });
  });
});
