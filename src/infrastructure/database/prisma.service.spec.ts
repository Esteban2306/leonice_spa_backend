import { PrismaService } from './prisma.service';

describe('PrismaService (ciclo de vida)', () => {
  it('cierra la conexión en la fase final del apagado, para que las peticiones y los jobs en curso terminen antes de perder la base', () => {
    const service = new PrismaService();
    expect(typeof service.onApplicationShutdown).toBe('function');
    expect(
      (service as unknown as { onModuleDestroy?: unknown }).onModuleDestroy,
    ).toBeUndefined();
  });

  it('desconecta el cliente al apagar', async () => {
    const service = new PrismaService();
    const disconnect = jest
      .spyOn(service.client, '$disconnect')
      .mockResolvedValue();
    await service.onApplicationShutdown();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
