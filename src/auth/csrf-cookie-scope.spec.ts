import { csrfCookieScope } from './csrf-cookie-scope';

describe('csrfCookieScope', () => {
  it('no fija dominio cuando no está configurado', () => {
    expect(csrfCookieScope({})).toEqual({});
    expect(csrfCookieScope({ COOKIE_DOMAIN: '  ' })).toEqual({});
  });

  it('comparte la cookie con los subdominios del dominio configurado', () => {
    expect(csrfCookieScope({ COOKIE_DOMAIN: '.leonicespa.com' })).toEqual({
      domain: '.leonicespa.com',
    });
  });
});
