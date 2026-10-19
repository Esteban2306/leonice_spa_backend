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
});
