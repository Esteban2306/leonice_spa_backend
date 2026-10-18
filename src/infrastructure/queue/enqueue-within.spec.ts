import { enqueueWithin } from './enqueue-within';

describe('enqueueWithin', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('devuelve QUEUED cuando Redis confirma a tiempo', async () => {
    const onLate = jest.fn();
    await expect(
      enqueueWithin(Promise.resolve({ id: '1' }), onLate),
    ).resolves.toBe('QUEUED');
    expect(onLate).not.toHaveBeenCalled();
  });

  it('devuelve DEFERRED sin bloquear cuando Redis no responde dentro del plazo', async () => {
    const pending = new Promise(() => undefined);
    const outcome = enqueueWithin(pending, jest.fn(), 2_000);
    await jest.advanceTimersByTimeAsync(2_000);
    await expect(outcome).resolves.toBe('DEFERRED');
  });

  it('propaga el error si el encolado falla antes del plazo', async () => {
    const onLate = jest.fn();
    await expect(
      enqueueWithin(Promise.reject(new Error('redis caído')), onLate),
    ).rejects.toThrow('redis caído');
    expect(onLate).not.toHaveBeenCalled();
  });

  it('avisa del fallo tardío en lugar de dejar un rechazo sin manejar', async () => {
    let fail: (error: Error) => void = () => undefined;
    const late = new Promise((_resolve, reject) => {
      fail = reject;
    });
    const onLate = jest.fn();
    const outcome = enqueueWithin(late, onLate, 2_000);
    await jest.advanceTimersByTimeAsync(2_000);
    await expect(outcome).resolves.toBe('DEFERRED');
    fail(new Error('se perdió la conexión'));
    await Promise.resolve();
    await Promise.resolve();
    expect(onLate).toHaveBeenCalledWith(new Error('se perdió la conexión'));
  });
});
