import { resolveCorrelationId } from './correlation-id.middleware';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('resolveCorrelationId', () => {
  it('reutiliza un id entrante seguro (trazabilidad entre servicios)', () => {
    expect(resolveCorrelationId('front-7f3a9c21')).toBe('front-7f3a9c21');
  });

  it.each([
    [undefined],
    [['a', 'b']],
    ['corto'],
    ['x'.repeat(65)],
    ['id con espacios'],
    ['inyección\nde-log'],
  ])('genera uno nuevo si el entrante no es seguro: %p', (incoming) => {
    expect(resolveCorrelationId(incoming)).toMatch(UUID);
  });
});
