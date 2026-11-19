import { ConduitSupportToolsController } from './conduit-support-tools.controller';

function build(results: boolean[]) {
  const publishAsync = jest.fn((_type?: unknown, _payload?: unknown) =>
    Promise.resolve(results),
  );
  const controller = new ConduitSupportToolsController(
    {} as never,
    { findByPhone: jest.fn(() => Promise.resolve({ name: 'Diana' })) } as never,
    { publishAsync } as never,
    {} as never,
  );
  return { controller, publishAsync };
}

const req = { conduitContact: { phone: '573001112233', lid: null } } as never;

describe('POST conduit/handoff', () => {
  it('confirma el traspaso solo si el aviso quedó encolado para algún administrador', async () => {
    const { controller, publishAsync } = build([true]);
    const out = await controller.handoff(
      { reason: 'Quiere hablar con alguien' },
      req,
      'idem-1',
    );
    expect(out).toMatchObject({ handedOff: true, teamNotified: true });
    expect(publishAsync).toHaveBeenCalledTimes(1);
    expect(publishAsync.mock.calls[0][1]).toMatchObject({
      phone: '573001112233',
      clientName: 'Diana',
      requestId: 'idem-1',
    });
  });

  it('sin destinatarios activos no promete nada y lo dice', async () => {
    const { controller } = build([false]);
    const out = await controller.handoff({ reason: 'Queja' }, req);
    expect(out).toMatchObject({ handedOff: false, teamNotified: false });
    expect(out.message).toMatch(/no prometas/);
  });
});

describe('POST conduit/handoff/owner', () => {
  it('pide el aviso solo para Leo y le dice al bot que no dé su número', async () => {
    const { controller, publishAsync } = build([true]);
    const out = await controller.ownerHandoff(
      { reason: 'Quiere hablar con Leo', summary: 'Tema personal' },
      req,
      'idem-2',
    );
    expect(publishAsync.mock.calls[0][1]).toMatchObject({
      target: 'OWNER',
      reason: 'Quiere hablar con Leo',
      requestId: 'idem-2',
    });
    expect(out).toMatchObject({ handedOff: true, teamNotified: true });
    expect(out.message).toMatch(/No des su número/);
  });

  it('el traspaso normal sigue yendo a todo el equipo', async () => {
    const { controller, publishAsync } = build([true]);
    await controller.handoff({ reason: 'Queja' }, req);
    expect(publishAsync.mock.calls[0][1]).toMatchObject({ target: 'TEAM' });
  });

  it('si no se pudo avisar, no promete que Leo escribirá', async () => {
    const { controller } = build([false]);
    const out = await controller.ownerHandoff({ reason: 'Leo' }, req);
    expect(out).toMatchObject({ handedOff: false, teamNotified: false });
    expect(out.message).toMatch(/no prometas/);
  });
});
