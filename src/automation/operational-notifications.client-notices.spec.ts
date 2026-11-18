import { ReservationStatus } from '@prisma/client';
import { OperationalNotificationsService } from './operational-notifications.service';

const ctx = { idempotencyKey: 'k1', companyEventId: 'e1' };

interface SentMessage {
  phone: string;
  variables: Record<string, string>;
}

function firstSent(conduit: { sendWhatsappMessage: jest.Mock }): SentMessage {
  const calls = conduit.sendWhatsappMessage.mock.calls as [SentMessage][];
  return calls[0][0];
}

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    comboGroupId: null,
    status: ReservationStatus.CONFIRMADA,
    scheduledStart: new Date('2026-11-20T13:00:00.000Z'),
    client: { name: 'Angélica', phone: '573001112233' },
    treatment: { name: 'Alisado orgánico' },
    ...overrides,
  };
}

function build(rows: ReturnType<typeof reservation>[], ticket: unknown = null) {
  const prisma = {
    client: {
      eventTicket: { findUnique: jest.fn().mockResolvedValue(ticket) },
    },
  };
  const conduit = {
    sendWhatsappMessage: jest
      .fn()
      .mockResolvedValue({ delivered: true, messageId: 'm1' }),
  };
  const reservations = {
    findManyByIdsWithDetails: jest.fn().mockResolvedValue(rows),
    findByComboGroupId: jest.fn().mockResolvedValue(rows),
  };
  const executions = { log: jest.fn().mockResolvedValue(undefined) };
  const templates = { resolve: jest.fn().mockResolvedValue('tpl-1') };
  const service = new OperationalNotificationsService(
    { get: jest.fn() } as never,
    conduit as never,
    reservations as never,
    {} as never,
    executions as never,
    templates as never,
    prisma as never,
  );
  return { service, conduit, executions, templates, reservations, prisma };
}

describe('avisos a la clienta por aceptar o cancelar', () => {
  it('avisa la aceptación con nombre, tratamiento y fecha en hora de Bogotá', async () => {
    const { service, conduit, templates } = build([reservation()]);

    await service.notifyClientReservationConfirmed(
      { reservationId: 'r1' },
      ctx,
    );

    expect(templates.resolve).toHaveBeenCalledWith(
      'CONDUIT_TEMPLATE_CLIENT_RESERVATION_CONFIRMED',
    );
    const sent = firstSent(conduit);
    expect(sent.phone).toBe('573001112233');
    expect(sent.variables.nombre).toBe('Angélica');
    expect(sent.variables.tratamiento).toBe('Alisado orgánico');
    expect(sent.variables.fecha).toContain('20 de noviembre');
    expect(sent.variables.fecha).toContain('8:00');
  });

  it('un combo recibe un solo aviso con todos los tratamientos confirmados', async () => {
    const rows = [
      reservation({ id: 'r1', comboGroupId: 'g1' }),
      reservation({
        id: 'r2',
        comboGroupId: 'g1',
        treatment: { name: 'Hidratación' },
        scheduledStart: new Date('2026-11-20T15:00:00.000Z'),
      }),
    ];
    const { service, conduit } = build(rows);

    await service.notifyClientReservationConfirmed(
      { reservationId: 'r1' },
      ctx,
    );

    expect(conduit.sendWhatsappMessage).toHaveBeenCalledTimes(1);
    expect(firstSent(conduit).variables.tratamiento).toBe(
      'Alisado orgánico, Hidratación',
    );
  });

  it('no avisa la aceptación si la reserva ya no está confirmada', async () => {
    const { service, conduit, executions } = build([
      reservation({ status: ReservationStatus.CANCELADA }),
    ]);

    await service.notifyClientReservationConfirmed(
      { reservationId: 'r1' },
      ctx,
    );

    expect(conduit.sendWhatsappMessage).not.toHaveBeenCalled();
    expect(executions.log).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'SKIPPED' }),
    );
  });

  it('avisa la cancelación con el motivo que escribió la administradora', async () => {
    const { service, conduit, templates } = build([
      reservation({ status: ReservationStatus.CANCELADA }),
    ]);

    await service.notifyClientCancelledByAdmin(
      { reservationId: 'r1', reason: 'No pudimos validar tu pago' },
      ctx,
    );

    expect(templates.resolve).toHaveBeenCalledWith(
      'CONDUIT_TEMPLATE_CLIENT_CANCELLED_BY_ADMIN',
    );
    expect(firstSent(conduit).variables).toMatchObject({
      nombre: 'Angélica',
      tratamiento: 'Alisado orgánico',
      motivo: 'No pudimos validar tu pago',
    });
  });

  it('no avisa la cancelación si la reserva volvió a estar activa', async () => {
    const { service, conduit } = build([reservation()]);

    await service.notifyClientCancelledByAdmin(
      { reservationId: 'r1', reason: 'Motivo' },
      ctx,
    );

    expect(conduit.sendWhatsappMessage).not.toHaveBeenCalled();
  });
});

describe('boletas y ganadoras de eventos', () => {
  const ticket = (overrides: Record<string, unknown> = {}) => ({
    number: 23,
    prize: null,
    wonAt: null,
    reservationId: 'r1',
    clientId: 'c1',
    event: { name: 'Rifa de aniversario' },
    client: { name: 'Luz', phone: '573001112233' },
    ...overrides,
  });

  it('le entrega la boleta numerada a la clienta', async () => {
    const { service, conduit, executions } = build([], ticket());

    await service.notifyClientEventTicket({ ticketId: 't1' }, ctx);

    expect(firstSent(conduit)).toMatchObject({
      phone: '573001112233',
      variables: { nombre: 'Luz', evento: 'Rifa de aniversario', boleta: '23' },
    });
    expect(executions.log).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'EXECUTED', clientId: 'c1' }),
    );
  });

  it('a la ganadora le dice su premio', async () => {
    const { service, conduit } = build(
      [],
      ticket({ wonAt: new Date(), prize: 'Kit de productos' }),
    );

    await service.notifyClientEventWinner({ ticketId: 't1' }, ctx);

    expect(firstSent(conduit).variables).toMatchObject({
      boleta: '23',
      premio: 'Kit de productos',
    });
  });

  it('si WhatsApp rechaza el número lo deja omitido sin reintentar', async () => {
    const { service, conduit, executions } = build([], ticket());
    conduit.sendWhatsappMessage.mockResolvedValue({
      delivered: false,
      permanent: true,
      reason: 'número sin WhatsApp',
    });

    await expect(
      service.notifyClientEventTicket({ ticketId: 't1' }, ctx),
    ).resolves.toBeUndefined();
    expect(executions.log).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'SKIPPED' }),
    );
  });

  it('no escribe a una clienta anonimizada', async () => {
    const { service, conduit } = build(
      [],
      ticket({ client: { name: 'X', phone: 'anonimizado-1' } }),
    );

    await service.notifyClientEventTicket({ ticketId: 't1' }, ctx);

    expect(conduit.sendWhatsappMessage).not.toHaveBeenCalled();
  });
});
