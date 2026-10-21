import { Prisma } from '@prisma/client';
import { signAuthenticatedUrls } from './signed-asset-urls.interceptor';

const sign = (url: string) => `${url}?firmada`;
const AUTH =
  'https://res.cloudinary.com/c/image/authenticated/v1/leonice-spa/deposit-proofs/a.png';
const PUBLIC = 'https://res.cloudinary.com/c/image/upload/v1/x.png';

describe('signAuthenticatedUrls', () => {
  it('firma solo las URL autenticadas, en cualquier nivel', () => {
    const body = {
      deposits: [{ imageUrl: AUTH, other: PUBLIC }],
      n: 1,
      d: null,
    };
    expect(signAuthenticatedUrls(body, sign)).toEqual({
      deposits: [{ imageUrl: `${AUTH}?firmada`, other: PUBLIC }],
      n: 1,
      d: null,
    });
  });

  it('conserva fechas y no muta el original', () => {
    const date = new Date();
    const body = { at: date, url: AUTH };
    const out = signAuthenticatedUrls(body, sign) as { at: Date; url: string };
    expect(out.at).toBe(date);
    expect(body.url).toBe(AUTH);
  });

  it('conserva los decimales de Prisma como texto numérico y no como objeto interno', () => {
    const body = {
      basePriceMin: new Prisma.Decimal('250'),
      nested: [{ amount: new Prisma.Decimal('35.5'), url: AUTH }],
    };
    const out = JSON.parse(
      JSON.stringify(signAuthenticatedUrls(body, sign)),
    ) as { basePriceMin: string; nested: { amount: string; url: string }[] };
    expect(out.basePriceMin).toBe('250');
    expect(out.nested[0].amount).toBe('35.5');
    expect(out.nested[0].url).toBe(`${AUTH}?firmada`);
  });
});
