import {
  signCancellationLink,
  verifyCancellationLink,
} from './cancellation-link-token';

const SECRET = 'secreto-de-prueba';
const claims = {
  clientId: 'client-1',
  reservationId: 'reservation-1',
  expiresAt: new Date('2026-12-10T05:00:00.000Z'),
};
const BEFORE = new Date('2026-12-09T20:00:00.000Z');

describe('cancellation link token', () => {
  it('firma y verifica los datos del enlace', () => {
    const token = signCancellationLink(SECRET, claims);
    expect(verifyCancellationLink(SECRET, token, BEFORE)).toEqual({
      ok: true,
      claims,
    });
  });

  it('es seguro para URL', () => {
    expect(signCancellationLink(SECRET, claims)).toMatch(
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    );
  });

  it('rechaza un enlace vencido', () => {
    const token = signCancellationLink(SECRET, claims);
    expect(verifyCancellationLink(SECRET, token, claims.expiresAt)).toEqual({
      ok: false,
      reason: 'EXPIRED',
    });
  });

  it('rechaza un enlace alterado para apuntar a otra reserva', () => {
    const token = signCancellationLink(SECRET, claims);
    const [, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ v: 1, c: 'client-1', r: 'otra', e: 1797000000 }),
    ).toString('base64url');
    expect(
      verifyCancellationLink(SECRET, `${forged}.${signature}`, BEFORE),
    ).toEqual({ ok: false, reason: 'INVALID' });
  });

  it('rechaza un enlace firmado con otro secreto', () => {
    const token = signCancellationLink('otro-secreto', claims);
    expect(verifyCancellationLink(SECRET, token, BEFORE).ok).toBe(false);
  });

  it.each(['', 'sin-punto', 'a.b.c', '.firma', 'payload.'])(
    'rechaza tokens mal formados: %p',
    (token) => {
      expect(verifyCancellationLink(SECRET, token, BEFORE)).toEqual({
        ok: false,
        reason: 'INVALID',
      });
    },
  );
});
