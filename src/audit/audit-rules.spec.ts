import {
  extractResultIds,
  matchAuditRule,
  normalizeAuditPath,
  redactAuditValue,
} from './audit-rules';

describe('audit-rules', () => {
  it('quita el prefijo global y la versión antes de comparar', () => {
    expect(normalizeAuditPath('/api/v1/clients/abc')).toBe('/clients/abc');
    expect(normalizeAuditPath('/api/clients')).toBe('/clients');
    expect(normalizeAuditPath('/clients')).toBe('/clients');
  });

  it.each([
    ['PATCH', '/api/v1/clients/c1', 'UPDATE_CLIENT', 'c1'],
    ['POST', '/api/v1/clients', 'CREATE_CLIENT', null],
    ['PUT', '/api/v1/clients/c1/hair-profile', 'UPDATE_CLIENT', 'c1'],
    ['POST', '/api/v1/clients/c1/consents', 'RECORD_CLIENT_CONSENT', 'c1'],
    ['POST', '/api/v1/reservations', 'CREATE_RESERVATION', null],
    [
      'PATCH',
      '/api/v1/reservations/r1/admin-cancel',
      'UPDATE_RESERVATION',
      'r1',
    ],
    ['DELETE', '/api/v1/treatments/t1', 'DELETE_TREATMENT', 't1'],
    ['PATCH', '/api/v1/capacity-pools/p1', 'UPDATE_CAPACITY_POOL', 'p1'],
  ])('%s %s → %s', (method, path, action, id) => {
    const matched = matchAuditRule(method, path);
    expect(matched?.rule.action).toBe(action);
    expect(matched?.paramId).toBe(id);
  });

  it('no audita lecturas ni rutas ajenas', () => {
    expect(matchAuditRule('GET', '/api/v1/clients/c1')).toBeNull();
    expect(matchAuditRule('POST', '/api/v1/clients/resolve')).toBeNull();
    expect(matchAuditRule('PATCH', '/api/v1/products/p1')).toBeNull();
  });

  it('oculta campos sensibles en cualquier nivel y conserva los nulos', () => {
    expect(
      redactAuditValue({
        name: 'Ana',
        allergies: 'cifrado',
        nested: [{ passwordHash: 'x', refreshTokenHash: null }],
        when: new Date('2026-10-16T00:00:00Z'),
      }),
    ).toEqual({
      name: 'Ana',
      allergies: '[REDACTADO]',
      nested: [{ passwordHash: '[REDACTADO]', refreshTokenHash: null }],
      when: '2026-10-16T00:00:00.000Z',
    });
  });

  it('extrae los ids del resultado según la regla', () => {
    expect(extractResultIds('result', { id: 'a' })).toEqual(['a']);
    expect(
      extractResultIds('result-reservations', {
        reservations: [{ id: 'r1' }, { id: 'r2' }],
      }),
    ).toEqual(['r1', 'r2']);
    expect(extractResultIds('result', null)).toEqual([]);
    expect(
      extractResultIds('result-reservations', { reservations: 'x' }),
    ).toEqual([]);
  });
});
