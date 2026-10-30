import { siigoErrorFromResponse } from './siigo.errors';

const body = (code: string, message = 'detalle', params: string[] = []) => ({
  Status: 400,
  Errors: [{ Code: code, Message: message, Params: params }],
});

describe('siigoErrorFromResponse', () => {
  it('lee el código, el mensaje y los parámetros del cuerpo de Siigo', () => {
    const error = siigoErrorFromResponse(
      400,
      body('parameter_required', 'The field code is required', ['code']),
    );

    expect(error.kind).toBe('VALIDATION');
    expect(error.retryable).toBe(false);
    expect(error.codes).toEqual(['parameter_required']);
    expect(error.details[0].params).toEqual(['code']);
    expect(error.message).toContain('The field code is required');
  });

  it.each([
    [401, 'unauthorized', 'AUTH', false],
    [403, 'forbidden', 'AUTH', false],
    [429, 'requests_limit', 'RATE_LIMIT', true],
    [408, 'request_timeout', 'TIMEOUT', true],
    [504, 'unhandled_error', 'TIMEOUT', true],
    [503, 'service_unavailable', 'UNAVAILABLE', true],
    [500, 'unhandled_error', 'UNAVAILABLE', true],
    [400, 'duplicated_document', 'DUPLICATE', false],
    [409, 'already_exists', 'DUPLICATE', false],
    [400, 'invalid_total_payments', 'VALIDATION', false],
    [400, 'blocked_transactions', 'VALIDATION', false],
  ])(
    '%i %s se clasifica como %s (reintentable: %s)',
    (status, code, kind, retryable) => {
      const error = siigoErrorFromResponse(status, body(code));

      expect(error.kind).toBe(kind);
      expect(error.retryable).toBe(retryable);
    },
  );

  it('sin cuerpo usa el estado HTTP', () => {
    const error = siigoErrorFromResponse(503, null);

    expect(error.kind).toBe('UNAVAILABLE');
    expect(error.message).toContain('503');
    expect(error.details).toEqual([]);
  });
});
