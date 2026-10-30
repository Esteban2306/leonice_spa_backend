import { DepositStatus, ReservationStatus } from '@prisma/client';
import request from 'supertest';
import { futureSlot, newClientDto } from '../../integration/harness';
import {
  ADMIN_EMAIL,
  API,
  asAdmin,
  createE2eApp,
  E2eContext,
  expectStatus,
  loginAdmin,
  PNG,
} from '../support/e2e-app';

interface ReservationBody {
  reservations: { id: string; status: ReservationStatus }[];
}

describe('E2E: recorrido completo de la administradora (HTTP, Postgres y Redis reales)', () => {
  let ctx: E2eContext;

  beforeAll(async () => {
    ctx = await createE2eApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  const book = async (label: string, start: Date) => {
    const client = newClientDto(label);
    const res = await request(ctx.server)
      .post(`${API}/reservations`)
      .send({
        client: {
          ...client,
          consent: { policyVersion: 'v1', healthDataConsent: true },
        },
        treatments: [ctx.world.secondary.treatmentId],
        scheduledStart: start.toISOString(),
      });
    expectStatus(res, 201);
    return { client, id: (res.body as ReservationBody).reservations[0].id };
  };

  const statusOf = async (id: string) =>
    (
      await ctx.prisma.client.reservation.findUniqueOrThrow({
        where: { id },
        select: { status: true },
      })
    ).status;

  const messagesTo = (phone: string) =>
    ctx.sink
      .messages()
      .filter((m) => JSON.stringify(m.body).includes(phone.replace(/\D/g, '')));

  describe('sesión y protecciones', () => {
    it('las credenciales incorrectas no distinguen entre usuario inexistente y contraseña errónea', async () => {
      const wrong = await request(ctx.server)
        .post(`${API}/auth/login`)
        .send({ email: ADMIN_EMAIL, password: 'incorrecta-123456' });
      const unknown = await request(ctx.server)
        .post(`${API}/auth/login`)
        .send({ email: 'nadie@leonice.test', password: 'incorrecta-123456' });
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect((wrong.body as { message: string }).message).toBe(
        (unknown.body as { message: string }).message,
      );
    });

    it('sin sesión no hay acceso, y con sesión pero sin CSRF las mutaciones se rechazan', async () => {
      expect(
        (await request(ctx.server).get(`${API}/admin/dashboard/summary`))
          .status,
      ).toBe(401);
      const noCsrf = await request(ctx.server)
        .post(`${API}/admin/schedule/exceptions`)
        .set('Cookie', ctx.admin.cookie)
        .send({ date: '2030-01-01', type: 'BLOCK' });
      expect(noCsrf.status).toBe(403);
    });

    it('el panel carga: resumen, calendario, reporte diario y listado de reservas', async () => {
      await book('panel', futureSlot(4, 9));
      for (const path of [
        '/admin/dashboard/summary',
        '/admin/calendar?from=2026-10-01&to=2026-10-31',
        '/admin/reports/daily',
        '/reservations',
        '/clients',
      ]) {
        expectStatus(await asAdmin(ctx, 'get', path), 200);
      }
    });
  });

  describe('agenda y bloqueos', () => {
    it('un bloqueo del día completo quita la disponibilidad y borrarlo la devuelve', async () => {
      const day = futureSlot(20, 10);
      const date = day.toISOString().slice(0, 10);
      const slotsFor = async () =>
        (
          (
            await request(ctx.server)
              .get(`${API}/reservations/availability`)
              .query({ treatmentId: ctx.world.secondary.treatmentId, date })
          ).body as { slots: unknown[] }
        ).slots.length;

      expect(await slotsFor()).toBeGreaterThan(0);

      const created = await asAdmin(
        ctx,
        'post',
        '/admin/schedule/exceptions',
      ).send({
        date,
        type: 'BLOCK',
        reason: 'Capacitación e2e',
      });
      expectStatus(created, 201);
      expect(await slotsFor()).toBe(0);

      const blocked = await request(ctx.server)
        .post(`${API}/reservations`)
        .send({
          client: {
            ...newClientDto('bloqueo'),
            consent: { policyVersion: 'v1', healthDataConsent: true },
          },
          treatments: [ctx.world.secondary.treatmentId],
          scheduledStart: day.toISOString(),
        });
      expect(blocked.status).toBeGreaterThanOrEqual(400);
      expect(blocked.status).toBeLessThan(500);

      expectStatus(
        await asAdmin(
          ctx,
          'delete',
          `/admin/schedule/exceptions/${(created.body as { id: string }).id}`,
        ),
        200,
        204,
      );
      expect(await slotsFor()).toBeGreaterThan(0);
    });
  });

  describe('depósitos y reservas', () => {
    it('rechazar un comprobante deja la reserva esperando depósito y avisa a la clienta', async () => {
      const { client, id } = await book('rechazo', futureSlot(5, 9));
      expectStatus(
        await request(ctx.server)
          .post(`${API}/reservations/${id}/deposits`)
          .field('phone', client.phone)
          .attach('image', PNG, {
            filename: 'c.png',
            contentType: 'image/png',
          }),
        201,
      );

      expectStatus(
        await asAdmin(ctx, 'patch', `/reservations/${id}/deposits/reject`).send(
          {
            reason: 'El monto no coincide',
          },
        ),
        200,
      );

      const deposit = await ctx.prisma.client.depositRecord.findFirstOrThrow({
        where: { reservationId: id },
      });
      expect(deposit.status).toBe(DepositStatus.RECHAZADO);
      expect(await statusOf(id)).toBe(ReservationStatus.PENDIENTE_DEPOSITO);
      expect(
        await ctx.sink.waitFor(() => messagesTo(client.phone).length > 0),
      ).toBe(true);
    });

    it('al aceptar el comprobante la clienta recibe el aviso de cita aceptada, sin bot', async () => {
      const { client, id } = await book('aceptaadmin', futureSlot(5, 14));
      expectStatus(
        await request(ctx.server)
          .post(`${API}/reservations/${id}/deposits`)
          .field('phone', client.phone)
          .attach('image', PNG, {
            filename: 'c.png',
            contentType: 'image/png',
          }),
        201,
      );

      expectStatus(
        await asAdmin(
          ctx,
          'patch',
          `/reservations/${id}/deposits/approve`,
        ).send({ coverage: 'ANTICIPO', amount: 25 }),
        200,
      );

      expect(await statusOf(id)).toBe(ReservationStatus.CONFIRMADA);
      expect(
        await ctx.sink.waitFor(() =>
          messagesTo(client.phone).some((m) =>
            JSON.stringify(m.body).includes('"tratamiento"'),
          ),
        ),
      ).toBe(true);
    });

    it('al cancelar con motivo la clienta recibe ese motivo por mensaje automático', async () => {
      const { client, id } = await book('motivoadmin', futureSlot(6, 14));
      expectStatus(
        await asAdmin(ctx, 'patch', `/reservations/${id}/admin-cancel`).send({
          reason: 'No logramos validar tu pago',
          notifyClient: true,
        }),
        200,
      );
      expect(
        await ctx.sink.waitFor(() =>
          messagesTo(client.phone).some((m) =>
            JSON.stringify(m.body).includes('No logramos validar tu pago'),
          ),
        ),
      ).toBe(true);
    });

    it('cancelar avisando a la clienta exige un motivo', async () => {
      const { id } = await book('sinmotivo', futureSlot(6, 16));
      const res = await asAdmin(
        ctx,
        'patch',
        `/reservations/${id}/admin-cancel`,
      ).send({ notifyClient: true });
      expect(res.status).toBe(400);
      expect(await statusOf(id)).toBe(ReservationStatus.PENDIENTE_DEPOSITO);
    });

    it('la administradora cancela una reserva avisando a la clienta, y el horario queda libre', async () => {
      const { id } = await book('cancelaadmin', futureSlot(6, 9));
      expectStatus(
        await asAdmin(ctx, 'patch', `/reservations/${id}/admin-cancel`).send({
          reason: 'Imprevisto del spa',
          notifyClient: true,
        }),
        200,
      );
      expect(await statusOf(id)).toBe(ReservationStatus.CANCELADA);
      expect(
        await ctx.sink.waitFor((requests) =>
          requests.some(
            (r) =>
              r.url.endsWith('/webhook/reservation.cancelled') &&
              JSON.stringify(r.body).includes(id),
          ),
        ),
      ).toBe(true);
    });

    it('la administradora reagenda a otro horario y la clienta recibe el aviso', async () => {
      const { client, id } = await book('reagendaadmin', futureSlot(7, 9));
      const target = futureSlot(7, 15);
      expectStatus(
        await asAdmin(
          ctx,
          'patch',
          `/reservations/${id}/admin-reschedule`,
        ).send({
          newScheduledStart: target.toISOString(),
          notifyClient: true,
          internalNote: 'Ajuste e2e',
        }),
        200,
      );
      const moved = await ctx.prisma.client.reservation.findMany({
        where: { client: { phone: client.phone } },
      });
      expect(
        moved.some((r) => r.scheduledStart.getTime() === target.getTime()),
      ).toBe(true);
      expect(
        await ctx.sink.waitFor(() => messagesTo(client.phone).length > 0),
      ).toBe(true);
    });

    it('el día de la cita se hace check-in y se completa; antes de ese día el check-in se rechaza', async () => {
      const { id } = await book('checkin', futureSlot(8, 9));
      await ctx.prisma.client.reservation.update({
        where: { id },
        data: { status: ReservationStatus.CONFIRMADA },
      });

      const early = await asAdmin(ctx, 'patch', `/reservations/${id}/check-in`);
      expect(early.status).toBeGreaterThanOrEqual(400);
      expect((early.body as { code: string }).code).toBe(
        'RESERVATION_CHECK_IN_NOT_TODAY',
      );

      const now = new Date();
      await ctx.prisma.client.reservation.update({
        where: { id },
        data: {
          scheduledStart: new Date(now.getTime() - 5 * 60_000),
          scheduledEnd: new Date(now.getTime() + 55 * 60_000),
        },
      });
      expectStatus(
        await asAdmin(ctx, 'patch', `/reservations/${id}/check-in`),
        200,
      );
      expect(await statusOf(id)).toBe(ReservationStatus.CITA_EN_CURSO);
      await ctx.prisma.client.reservation.update({
        where: { id },
        data: { finalPrice: 250 },
      });
      const settlement = await asAdmin(
        ctx,
        'get',
        `/reservations/${id}/settlement`,
      );
      expectStatus(settlement, 200);
      const due = (settlement.body as { balanceDue: number }).balanceDue;

      const wrong = await asAdmin(
        ctx,
        'patch',
        `/reservations/${id}/complete`,
      ).send({ cashAmount: due + 1, transferAmount: 0 });
      expect((wrong.body as { code: string }).code).toBe(
        'PAYMENT_AMOUNT_MISMATCH',
      );
      expect(await statusOf(id)).toBe(ReservationStatus.CITA_EN_CURSO);

      expectStatus(
        await asAdmin(ctx, 'patch', `/reservations/${id}/complete`).send({
          cashAmount: due,
          transferAmount: 0,
        }),
        200,
      );
      expect(await statusOf(id)).toBe(ReservationStatus.COMPLETADA);
      expect(
        await ctx.prisma.client.siigoSync.count({
          where: { reservationId: id },
        }),
      ).toBe(1);
    });
  });

  describe('cierre de sesión', () => {
    it('cerrar sesión invalida el acceso con esas mismas cookies', async () => {
      const session = await loginAdmin(ctx.server);
      const alive = await request(ctx.server)
        .get(`${API}/auth/me`)
        .set('Cookie', session.cookie);
      expect(alive.status).toBe(200);
      expect((alive.body as { email: string }).email).toBe(ADMIN_EMAIL);

      const out = await request(ctx.server)
        .post(`${API}/auth/logout`)
        .set('Cookie', session.cookie)
        .set('X-CSRF-Token', session.csrf);
      expect([200, 201, 204]).toContain(out.status);

      const dead = await request(ctx.server)
        .get(`${API}/auth/me`)
        .set('Cookie', session.cookie);
      expect(dead.status).toBe(401);
    });
  });
});
