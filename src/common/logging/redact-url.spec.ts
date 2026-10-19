import { redactUrl } from './redact-url';

describe('redactUrl', () => {
  it('oculta el token de cancelación en la ruta', () => {
    expect(redactUrl('/api/v1/cancellation-links/abc.def-123')).toBe(
      '/api/v1/cancellation-links/[redactado]',
    );
    expect(redactUrl('/api/v1/cancellation-links/abc.def/cancel')).toBe(
      '/api/v1/cancellation-links/[redactado]/cancel',
    );
  });

  it('oculta teléfonos, búsquedas y correos del query y conserva el resto', () => {
    expect(
      redactUrl(
        '/api/v1/products/recommended-for-client?phone=%2B573001112233&limit=5&q=Ana%20P%C3%A9rez',
      ),
    ).toBe(
      '/api/v1/products/recommended-for-client?phone=[redactado]&limit=5&q=[redactado]',
    );
    expect(redactUrl('/x?EMAIL=a@b.co&page=2')).toBe(
      '/x?EMAIL=[redactado]&page=2',
    );
  });

  it('no altera URLs sin datos sensibles', () => {
    expect(redactUrl('/api/v1/reservations/availability?date=2026-10-20')).toBe(
      '/api/v1/reservations/availability?date=2026-10-20',
    );
    expect(redactUrl('/api/v1/health')).toBe('/api/v1/health');
  });

  it('tolera claves con codificación inválida', () => {
    expect(redactUrl('/x?%E0%A4%A=1&phone=1')).toBe(
      '/x?%E0%A4%A=1&phone=[redactado]',
    );
  });
});
