import { ConduitApiClient } from '../client/conduit-api.client';
import { ConduitSystemPauseService } from './conduit-system-pause.service';

function build(admin: jest.Mock) {
  return new ConduitSystemPauseService({
    admin,
  } as unknown as ConduitApiClient);
}

describe('ConduitSystemPauseService', () => {
  it('lee el estado de Conduit y lo reutiliza dentro de la ventana de caché', async () => {
    const admin = jest.fn().mockResolvedValue({
      paused: true,
      pausedAt: '2026-11-08T10:00:00.000Z',
    });
    const service = build(admin);

    expect(await service.isPaused()).toBe(true);
    expect(await service.isPaused()).toBe(true);
    expect(admin).toHaveBeenCalledTimes(1);
    expect(admin).toHaveBeenCalledWith('GET', 'system/pause');
  });

  it('pausar y reanudar escriben en Conduit y actualizan la caché al instante', async () => {
    const admin = jest
      .fn()
      .mockResolvedValueOnce({
        paused: true,
        pausedAt: '2026-11-08T10:00:00.000Z',
      })
      .mockResolvedValueOnce({ paused: false, pausedAt: null });
    const service = build(admin);

    expect((await service.set(true)).paused).toBe(true);
    expect(await service.isPaused()).toBe(true);
    expect(admin).toHaveBeenNthCalledWith(1, 'PUT', 'system/pause', {
      body: { paused: true },
    });

    expect(await service.set(false)).toEqual({ paused: false, pausedAt: null });
    expect(await service.isPaused()).toBe(false);
  });

  it('si Conduit no responde, conserva el último estado conocido', async () => {
    const admin = jest
      .fn()
      .mockResolvedValueOnce({
        paused: true,
        pausedAt: '2026-11-08T10:00:00.000Z',
      })
      .mockRejectedValue(new Error('caído'));
    const service = build(admin);
    await service.set(true);

    jest.useFakeTimers();
    jest.setSystemTime(Date.now() + 60_000);
    try {
      expect(await service.isPaused()).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('si nunca pudo leer el estado, no bloquea los envíos', async () => {
    const service = build(jest.fn().mockRejectedValue(new Error('404')));
    expect(await service.isPaused()).toBe(false);
  });
});
