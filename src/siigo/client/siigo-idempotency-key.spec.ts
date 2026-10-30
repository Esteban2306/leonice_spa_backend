import { siigoIdempotencyKey } from './siigo-idempotency-key';

describe('siigoIdempotencyKey', () => {
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e';

  it('es alfanumérica, sin guiones y de máximo 30 caracteres', () => {
    const key = siigoIdempotencyKey(id);

    expect(key).toMatch(/^[A-Za-z0-9]{1,30}$/);
    expect(key).toHaveLength(30);
  });

  it('es estable para la misma reserva y distinta entre reservas', () => {
    expect(siigoIdempotencyKey(id)).toBe(siigoIdempotencyKey(id));
    expect(siigoIdempotencyKey(id)).not.toBe(
      siigoIdempotencyKey('0f8fad5b-d9cb-469f-a165-70867728950f'),
    );
  });

  it('distingue las líneas de pago de una misma reserva sin pasar de 30 caracteres', () => {
    const cash = siigoIdempotencyKey(id, 'CASH');
    const transfer = siigoIdempotencyKey(id, 'TRANSFER');

    expect(cash).not.toBe(transfer);
    expect(cash).toMatch(/^[A-Za-z0-9]{1,30}$/);
    expect(transfer).toHaveLength(30);
  });
});
