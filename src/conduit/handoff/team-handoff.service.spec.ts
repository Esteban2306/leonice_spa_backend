import { TeamHandoffService } from './team-handoff.service';
import { memoryCache } from '../../../test/helpers/memory-cache';

function build(results: boolean[] = [true], cacheDown = false) {
  const cache = memoryCache();
  const publishAsync = jest.fn((_type?: unknown, _payload?: unknown) =>
    Promise.resolve(results),
  );
  const service = new TeamHandoffService(
    (cacheDown
      ? {
          setIfAbsent: () => Promise.resolve(null),
          delete: () => Promise.resolve(),
        }
      : cache) as never,
    { findByPhone: jest.fn(() => Promise.resolve({ name: 'Diana' })) } as never,
    { publishAsync } as never,
  );
  return { service, publishAsync, cache };
}

const team = {
  phone: '+573001112233',
  lid: null,
  reason: 'Envió una foto de su cabello',
  target: 'TEAM' as const,
};

describe('TeamHandoffService', () => {
  it('la foto y el traspaso del bot sobre el mismo chat avisan una sola vez', async () => {
    const { service, publishAsync } = build();
    expect(await service.request(team)).toBe(true);
    expect(
      await service.request({ ...team, reason: 'Quiere que la orienten' }),
    ).toBe(true);
    expect(publishAsync).toHaveBeenCalledTimes(1);
    expect(publishAsync.mock.calls[0][1]).toMatchObject({
      clientName: 'Diana',
      reason: 'Envió una foto de su cabello',
      target: 'TEAM',
    });
  });

  it('otro chat sí avisa', async () => {
    const { service, publishAsync } = build();
    await service.request(team);
    await service.request({ ...team, phone: '+573009998877' });
    expect(publishAsync).toHaveBeenCalledTimes(2);
  });

  it('si no se pudo avisar, el siguiente intento vuelve a probar', async () => {
    const { service, publishAsync } = build([false]);
    expect(await service.request(team)).toBe(false);
    expect(await service.request(team)).toBe(false);
    expect(publishAsync).toHaveBeenCalledTimes(2);
  });

  it('el aviso a Leo no se mezcla con el del equipo', async () => {
    const { service, publishAsync } = build();
    await service.request(team);
    await service.request({ ...team, target: 'OWNER' });
    expect(publishAsync).toHaveBeenCalledTimes(2);
  });

  it('sin caché avisa igual', async () => {
    const { service, publishAsync } = build([true], true);
    await service.request(team);
    await service.request(team);
    expect(publishAsync).toHaveBeenCalledTimes(2);
  });
});
