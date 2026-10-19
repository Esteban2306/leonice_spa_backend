import { DepositStatus, ReservationStatus } from '@prisma/client';
import request from 'supertest';
import { futureSlot, newClientDto } from '../../integration/harness';
import {
  API,
  asAdmin,
  createE2eApp,
  E2eContext,
  expectStatus,
  PNG,
} from '../support/e2e-app';

interface ReservationBody {
  reservations: {
    id: string;
    status: ReservationStatus;
    scheduledStart: string;
    depositExpiresAt: string | null;
  }[];
}

describe('E2E: recorrido completo de una clienta (HTTP, Postgres y Redis reales)', () => {
  let ctx: E2eContext;

  beforeAll(async () => {
    ctx = await createE2eApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  const book = (
    client: ReturnType<typeof newClientDto>,
    start: Date,
    idempotencyKey?: string,
  ) => {
    const req = request(ctx.server)
      .post(`${API}/reservations`)
      .send({
        client: {
          ...client,
          consent: { policyVersion: 'v1', healthDataConsent: true },
        },
        treatments: [ctx.world.secondary.treatmentId],
        scheduledStart: start.toISOString(),
      });
    return idempotencyKey ? req.set('Idempotency-Key', idempotencyKey) : req;
  };

  const sendProof = (reservationId: string, phone: string) =>
    request(ctx.server)
      .post(`${API}/reservations/${reservationId}/deposits`)
      .field('phone', phone)
      .attach('image', PNG, {
        filename: 'comprobante.png',
        contentType: 'image/png',
      });

  const statusOf = async (id: string) =>
    (
      await ctx.prisma.client.reservation.findUniqueOrThrow({
        where: { id },
        select: { status: true },
      })
    ).status;

  it('consulta el catálogo y la disponibilidad como visitante anónima', async () => {
    const treatments = await request(ctx.server).get(`${API}/treatments`);
    expect(treatments.status).toBe(200);
    expect(JSON.stringify(treatments.body)).toContain(
      ctx.world.secondary.treatmentId,
    );

    const day = futureSlot(9, 10);
    const date = day.toISOString().slice(0, 10);
    const availability = await request(ctx.server)
      .get(`${API}/reservations/availability`)
      .query({ treatmentId: ctx.world.secondary.treatmentId, date });
    expect(availability.status).toBe(200);
    expect(
      (availability.body as { slots: unknown[] }).slots.length,
    ).toBeGreaterThan(0);
  });

  it('reserva, sube el comprobante, el admin aprueba, reagenda, cancela y reutiliza el crédito', async () => {
    const client = newClientDto('recorrido');
    const start = futureSlot(11, 9);

    const created = await book(client, start);
    expect(created.status).toBe(201);
    const first = (created.body as ReservationBody).reservations[0];
    expect(first.status).toBe(ReservationStatus.PENDIENTE_DEPOSITO);
    expect(first.depositExpiresAt).not.toBeNull();

    const proof = await sendProof(first.id, client.phone);
    expectStatus(proof, 201);
    expect(ctx.cloudinary.uploads).toContain(first.id);
    const deposit = await ctx.prisma.client.depositRecord.findFirstOrThrow({
      where: { reservationId: first.id },
    });
    expect(deposit.status).toBe(DepositStatus.PENDIENTE);

    const approved = await asAdmin(
      ctx,
      'patch',
      `/reservations/${first.id}/deposits/approve`,
    ).send({ coverage: 'ANTICIPO', amount: 20 });
    expect(approved.status).toBe(200);
    expect(await statusOf(first.id)).toBe(ReservationStatus.CONFIRMADA);

    const newStart = futureSlot(11, 11);
    const rescheduled = await request(ctx.server)
      .patch(`${API}/reservations/${first.id}/reschedule`)
      .send({ phone: client.phone, newScheduledStart: newStart.toISOString() });
    expect([200, 201]).toContain(rescheduled.status);

    const reservationNow = await ctx.prisma.client.reservation.findMany({
      where: { client: { phone: client.phone } },
      orderBy: { createdAt: 'asc' },
    });
    const live = reservationNow.find(
      (r) => r.status === ReservationStatus.CONFIRMADA,
    );
    expect(live).toBeDefined();

    const cancelled = await request(ctx.server)
      .patch(`${API}/reservations/${live!.id}/cancel`)
      .send({ phone: client.phone, scope: 'SINGLE', reason: 'Prueba e2e' });
    expect(cancelled.status).toBe(200);
    expect(await statusOf(live!.id)).toBe(ReservationStatus.CANCELADA);

    const clientRow = await ctx.prisma.client.client.findUniqueOrThrow({
      where: { phone: client.phone },
    });
    const credits = await asAdmin(ctx, 'get', '/deposits/credits').query({
      clientId: clientRow.id,
    });
    expect(credits.status).toBe(200);
    const creditBody = credits.body as { credits: { amount: number }[] };
    expect(creditBody.credits).toHaveLength(1);
    expect(creditBody.credits[0].amount).toBe(20);

    const second = await book(client, futureSlot(12, 9));
    expect(second.status).toBe(201);
    const secondReservation = (second.body as ReservationBody).reservations[0];
    expect(secondReservation.depositExpiresAt).toBeNull();

    const secondApproval = await asAdmin(
      ctx,
      'patch',
      `/reservations/${secondReservation.id}/deposits/approve`,
    ).send({ coverage: 'ANTICIPO' });
    expect(secondApproval.status).toBe(200);
    expect(await statusOf(secondReservation.id)).toBe(
      ReservationStatus.CONFIRMADA,
    );

    const creditsAfter = await asAdmin(ctx, 'get', '/deposits/credits').query({
      clientId: clientRow.id,
    });
    expect((creditsAfter.body as { credits: unknown[] }).credits).toHaveLength(
      0,
    );
  });

  it('cancela con el enlace de cancelación que genera el equipo', async () => {
    const client = newClientDto('enlace');
    const created = await book(client, futureSlot(13, 9));
    const reservation = (created.body as ReservationBody).reservations[0];

    const link = await asAdmin(
      ctx,
      'post',
      `/reservations/${reservation.id}/cancellation-link`,
    ).send({ send: false });
    expect(link.status).toBe(201);
    const url = (link.body as { url: string }).url;
    const token = url.split('/').pop() as string;

    const preview = await request(ctx.server).get(
      `${API}/cancellation-links/${token}`,
    );
    expect(preview.status).toBe(200);

    const cancel = await request(ctx.server)
      .post(`${API}/cancellation-links/${token}/cancel`)
      .send({ scope: 'SINGLE', reservationId: reservation.id });
    expect([200, 201]).toContain(cancel.status);
    expect(await statusOf(reservation.id)).toBe(ReservationStatus.CANCELADA);

    const [payload, signature] = token.split('.');
    const flipped = `${payload[0] === 'A' ? 'B' : 'A'}${payload.slice(1)}`;
    const tampered = await request(ctx.server).get(
      `${API}/cancellation-links/${flipped}.${signature}`,
    );
    expect([400, 404]).toContain(tampered.status);
  });

  it('los eventos de negocio llegan a Conduit y ninguno queda atascado en la bandeja de salida', async () => {
    const client = newClientDto('eventos');
    const created = await book(client, futureSlot(14, 9));
    expect(created.status).toBe(201);

    const drained = await (async () => {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        const pending = await ctx.prisma.client.conduitOutboxEvent.count({
          where: { status: { not: 'SENT' } },
        });
        if (pending === 0) return true;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      return false;
    })();
    expect(drained).toBe(true);
    expect(ctx.sink.requests.length).toBeGreaterThan(0);
  });
});
