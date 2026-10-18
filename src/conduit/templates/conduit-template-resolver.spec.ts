import { ConduitTemplateResolver } from './conduit-template-resolver';

function setup(
  env: Record<string, string> = {},
  remote: Array<{ id: string; name: string; channel?: string }> = [],
) {
  const admin = jest
    .fn()
    .mockResolvedValue({ data: remote, meta: { totalPages: 1 } });
  const resolver = new ConduitTemplateResolver(
    { admin } as never,
    { get: (key: string) => env[key] } as never,
  );
  return { resolver, admin };
}

describe('ConduitTemplateResolver', () => {
  it('usa la variable de entorno si está definida', async () => {
    const { resolver, admin } = setup({
      CONDUIT_TEMPLATE_RESERVATION_REMINDER: 'desde-env',
    });

    await expect(
      resolver.resolve('CONDUIT_TEMPLATE_RESERVATION_REMINDER'),
    ).resolves.toBe('desde-env');
    expect(admin).not.toHaveBeenCalled();
  });

  it('sin variable, encuentra la plantilla por su nombre del catálogo', async () => {
    const { resolver } = setup({}, [
      { id: 'tpl-1', name: 'leonice_recordatorio_cita' },
    ]);

    await expect(
      resolver.resolve('CONDUIT_TEMPLATE_RESERVATION_REMINDER'),
    ).resolves.toBe('tpl-1');
    await expect(
      resolver.resolve('CONDUIT_TEMPLATE_ADMIN_HANDOFF'),
    ).resolves.toBeNull();
  });

  it('describe las 16 plantillas e indica de dónde salió cada ID', async () => {
    const { resolver } = setup({ CONDUIT_TEMPLATE_REACTIVATION: 'env-id' }, [
      { id: 'tpl-1', name: 'leonice_recordatorio_cita' },
    ]);

    const usage = await resolver.describe();

    expect(usage).toHaveLength(16);
    expect(usage.find((u) => u.name === 'RESERVATION_REMINDER')).toMatchObject({
      templateId: 'tpl-1',
      configured: true,
      source: 'catalog',
    });
    expect(usage.find((u) => u.name === 'REACTIVATION')).toMatchObject({
      templateId: 'env-id',
      source: 'env',
    });
    expect(usage.find((u) => u.name === 'ADMIN_HANDOFF')).toMatchObject({
      configured: false,
      source: null,
    });
  });

  it('distingue la plantilla de correo de la de WhatsApp aunque compartan nombre', async () => {
    const { resolver } = setup({}, [
      {
        id: 'wa-1',
        name: 'leonice_aviso_atencion_humana',
        channel: 'WHATSAPP',
      },
      {
        id: 'mail-1',
        name: 'leonice_correo_aviso_atencion_humana',
        channel: 'EMAIL',
      },
      {
        id: 'mail-falso',
        name: 'leonice_aviso_atencion_humana',
        channel: 'EMAIL',
      },
    ]);

    await expect(
      resolver.resolve('CONDUIT_TEMPLATE_ADMIN_HANDOFF'),
    ).resolves.toBe('wa-1');
    await expect(
      resolver.resolve('CONDUIT_TEMPLATE_ADMIN_HANDOFF_EMAIL'),
    ).resolves.toBe('mail-1');
  });

  it('cachea la lista y la vuelve a pedir tras invalidar', async () => {
    const { resolver, admin } = setup();

    await resolver.describe();
    await resolver.describe();
    resolver.invalidate();
    await resolver.describe();

    expect(admin).toHaveBeenCalledTimes(2);
  });

  it('si Conduit falla, responde sin configurar en vez de romper', async () => {
    const { resolver, admin } = setup();
    admin.mockRejectedValueOnce(new Error('caído'));

    await expect(
      resolver.resolve('CONDUIT_TEMPLATE_RESERVATION_REMINDER'),
    ).resolves.toBeNull();
  });
});
