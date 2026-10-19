import { ReservationStatus } from '@prisma/client';
import request from 'supertest';
import { ReservationTimeoutsProcessor } from 'src/automation/processors/reservation-timeouts.processor';
import { ReservationsRepository } from 'src/reservations/repositories/reservations.repository';
import { JOB_NAMES } from 'src/infrastructure/queue/queue.constants';
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
  reservations: { id: string; status: ReservationStatus }[];
}

describe('E2E: casos límite (doble clic, reintentos, vencimiento y fallos externos)', () => {
  let ctx: E2eContext;
  let timeouts: ReservationTimeoutsProcessor;

  beforeAll(async () => {
    ctx = await createE2eApp();
    timeouts = ctx.app.get(ReservationTimeoutsProcessor);
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await ctx.resetThrottle();
    ctx.sink.clear();
    ctx.cloudinary.uploads.length = 0;
    ctx.cloudinary.destroyed.length = 0;
    ctx.cloudinary.failUploads = 0;
    ctx.cloudinary.afterUpload = null;
  });

  const bookingBody = (
    client: ReturnType<typeof newClientDto>,
    start: Date,
  ) => ({
    client: {
      ...client,
      consent: { policyVersion: 'v1', healthDataConsent: true },
    },
    treatments: [ctx.world.secondary.treatmentId],
    scheduledStart: start.toISOString(),
  });

  const book = async (label: string, start: Date) => {
    const client = newClientDto(label);
    const res = await request(ctx.server)
      .post(`${API}/reservations`)
      .send(bookingBody(client, start));
    expectStatus(res, 201);
    return { client, id: (res.body as ReservationBody).reservations[0].id };
  };

  const proofRequest = (id: string, phone: string, key?: string) => {
    const req = request(ctx.server)
      .post(`${API}/reservations/${id}/deposits`)
      .field('phone', phone)
      .attach('image', PNG, { filename: 'c.png', contentType: 'image/png' });
    return key ? req.set('Idempotency-Key', key) : req;
  };

  const approve = (id: string, key?: string) => {
    const req = asAdmin(ctx, 'patch', `/reservations/${id}/deposits/approve`);
    return (key ? req.set('Idempotency-Key', key) : req).send({
      coverage: 'ANTICIPO',
      amount: 20,
    });
  };

  const statusOf = async (id: string) =>
    (
      await ctx.prisma.client.reservation.findUniqueOrThrow({
        where: { id },
        select: { status: true },
      })
    ).status;

  const expireDeadline = (id: string) =>
    ctx.prisma.client.reservation.update({
      where: { id },
      data: { depositExpiresAt: new Date(Date.now() - 60_000) },
    });

  const runTimeout = (id: string) =>
    timeouts.process({
      name: JOB_NAMES.DEPOSITO_TIMEOUT,
      data: { reservationId: id },
    } as never);

  describe('doble clic', () => {
    it('cinco envíos simultáneos con la misma clave crean una sola reserva y el resto repite o espera', async () => {
      const client = newClientDto('doble');
      const start = futureSlot(15, 9);
      const key = `doble-clic-${Date.now()}-0001`;

      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(ctx.server)
            .post(`${API}/reservations`)
            .set('Idempotency-Key', key)
            .send(bookingBody(client, start)),
        ),
      );

      for (const res of responses) {
        expect([201, 409]).toContain(res.status);
        if (res.status === 409) {
          expect((res.body as { code: string }).code).toBe(
            'IDEMPOTENCY_IN_PROGRESS',
          );
        }
      }
      expect(responses.some((r) => r.status === 201)).toBe(true);
      expect(
        await ctx.prisma.client.reservation.count({
          where: { client: { phone: client.phone } },
        }),
      ).toBe(1);

      const retry = await request(ctx.server)
        .post(`${API}/reservations`)
        .set('Idempotency-Key', key)
        .send(bookingBody(client, start));
      expect(retry.status).toBe(201);
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(
        await ctx.prisma.client.reservation.count({
          where: { client: { phone: client.phone } },
        }),
      ).toBe(1);
    });

    it('sin clave de idempotencia, cinco envíos simultáneos igualmente dejan una sola reserva', async () => {
      const client = newClientDto('sinclave');
      const start = futureSlot(16, 9);

      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(ctx.server)
            .post(`${API}/reservations`)
            .send(bookingBody(client, start)),
        ),
      );

      expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
      expect(
        await ctx.prisma.client.reservation.count({
          where: { client: { phone: client.phone } },
        }),
      ).toBe(1);
    });

    it('aprobar dos veces a la vez confirma una sola vez y registra un solo pago', async () => {
      const { client, id } = await book('aprobadoble', futureSlot(17, 9));
      expectStatus(await proofRequest(id, client.phone), 201);

      const [a, b] = await Promise.all([approve(id), approve(id)]);
      const statuses = [a.status, b.status].sort();
      expect(statuses[0]).toBe(200);
      expect(statuses[1]).toBeGreaterThanOrEqual(400);

      expect(await statusOf(id)).toBe(ReservationStatus.CONFIRMADA);
      expect(
        await ctx.prisma.client.depositRecord.count({
          where: { reservationId: id, status: 'CONFIRMADO' },
        }),
      ).toBe(1);
    });
  });

  describe('reintentos', () => {
    it('reintentar el comprobante con la misma clave no vuelve a subir la imagen ni duplica el depósito', async () => {
      const { client, id } = await book('reintento', futureSlot(18, 9));
      const key = `reintento-comprobante-${Date.now()}`;

      const first = await proofRequest(id, client.phone, key);
      expectStatus(first, 201);
      const retry = await proofRequest(id, client.phone, key);
      expectStatus(retry, 201);
      expect(retry.headers['idempotent-replayed']).toBe('true');

      expect(ctx.cloudinary.uploads).toHaveLength(1);
      expect(
        await ctx.prisma.client.depositRecord.count({
          where: { reservationId: id },
        }),
      ).toBe(1);
    });

    it('reusar una clave con otro contenido se rechaza en vez de devolver una respuesta ajena', async () => {
      const key = `clave-reusada-${Date.now()}`;
      const one = newClientDto('reuso1');
      const two = newClientDto('reuso2');
      expectStatus(
        await request(ctx.server)
          .post(`${API}/reservations`)
          .set('Idempotency-Key', key)
          .send(bookingBody(one, futureSlot(19, 9))),
        201,
      );
      const clash = await request(ctx.server)
        .post(`${API}/reservations`)
        .set('Idempotency-Key', key)
        .send(bookingBody(two, futureSlot(19, 10)));
      expect(clash.status).toBe(422);
      expect((clash.body as { code: string }).code).toBe(
        'IDEMPOTENCY_KEY_REUSED',
      );
      expect(
        await ctx.prisma.client.reservation.count({
          where: { client: { phone: two.phone } },
        }),
      ).toBe(0);
    });
  });

  describe('vencimiento durante una operación', () => {
    it('si vence el plazo mientras la administradora aprueba un comprobante pendiente, nunca se cancela una reserva con comprobante en revisión (10 rondas)', async () => {
      for (let round = 0; round < 10; round++) {
        await ctx.resetThrottle();
        const { client, id } = await book(
          `venceaprueba${round}`,
          futureSlot(21 + round, 9),
        );
        expectStatus(await proofRequest(id, client.phone), 201);
        await expireDeadline(id);

        const [approval] = await Promise.all([approve(id), runTimeout(id)]);

        expect(approval.status).toBe(200);
        expect(await statusOf(id)).toBe(ReservationStatus.CONFIRMADA);
      }
    });

    it('si el comprobante llega justo al vencer, el resultado es coherente: o queda cancelada sin pago, o sigue viva con el comprobante pendiente (12 rondas)', async () => {
      for (let round = 0; round < 12; round++) {
        await ctx.resetThrottle();
        const { client, id } = await book(
          `llegajusto${round}`,
          futureSlot(40 + round, 9),
        );
        await expireDeadline(id);

        const [proof] = await Promise.all([
          proofRequest(id, client.phone),
          runTimeout(id).catch(() => undefined),
        ]);

        const status = await statusOf(id);
        const pending = await ctx.prisma.client.depositRecord.count({
          where: { reservationId: id, status: 'PENDIENTE' },
        });
        if (status === ReservationStatus.CANCELADA) {
          expect(proof.status).toBeGreaterThanOrEqual(400);
          expect(pending).toBe(0);
          expect(
            ctx.cloudinary.destroyed.filter((d) => d.includes(id)),
          ).toHaveLength(ctx.cloudinary.uploads.filter((u) => u === id).length);
        } else {
          expect(status).toBe(ReservationStatus.PENDIENTE_DEPOSITO);
          expect(proof.status).toBe(201);
          expect(pending).toBe(1);
        }
      }
    });

    it('la cancelación por vencimiento y el comprobante pendiente se serializan: con comprobante no se cancela, sin comprobante sí', async () => {
      const repository = ctx.app.get(ReservationsRepository);
      const cancellation = {
        status: ReservationStatus.CANCELADA,
        cancelledAt: new Date(),
        cancellationReason: 'Prueba',
      };

      const withProof = await book('atomicacon', futureSlot(58, 9));
      expectStatus(
        await proofRequest(withProof.id, withProof.client.phone),
        201,
      );
      expect(
        await repository.updateStatusIfCurrentUnlessProofPending(
          withProof.id,
          ReservationStatus.PENDIENTE_DEPOSITO,
          cancellation,
        ),
      ).toBe('PROOF_PENDING');
      expect(await statusOf(withProof.id)).toBe(
        ReservationStatus.PENDIENTE_DEPOSITO,
      );

      const withoutProof = await book('atomicasin', futureSlot(59, 9));
      expect(
        await repository.updateStatusIfCurrentUnlessProofPending(
          withoutProof.id,
          ReservationStatus.PENDIENTE_DEPOSITO,
          cancellation,
        ),
      ).toBe('APPLIED');
      expect(
        await repository.updateStatusIfCurrentUnlessProofPending(
          withoutProof.id,
          ReservationStatus.PENDIENTE_DEPOSITO,
          cancellation,
        ),
      ).toBe('STALE');
    });

    it('un comprobante nuevo sobre una reserva ya cancelada por vencimiento se rechaza y no deja imágenes huérfanas', async () => {
      const { client, id } = await book('tarde', futureSlot(60, 9));
      await expireDeadline(id);
      await runTimeout(id);
      expect(await statusOf(id)).toBe(ReservationStatus.CANCELADA);

      const late = await proofRequest(id, client.phone);
      expect(late.status).toBeGreaterThanOrEqual(400);
      expect(late.status).toBeLessThan(500);
      expect(
        await ctx.prisma.client.depositRecord.count({
          where: { reservationId: id },
        }),
      ).toBe(0);
      expect(ctx.cloudinary.uploads).toHaveLength(0);
    });
  });

  describe('fallos de servicios externos', () => {
    it('si Cloudinary cae, el comprobante responde 502 sin dejar estado a medias, y al reintentar funciona', async () => {
      const { client, id } = await book('cloudinarycae', futureSlot(61, 9));
      ctx.cloudinary.failUploads = 1;

      const failed = await proofRequest(id, client.phone);
      expect(failed.status).toBe(502);
      expect((failed.body as { code: string }).code).toBe(
        'DEPOSIT_PROOF_UPLOAD_FAILED',
      );
      expect(
        await ctx.prisma.client.depositRecord.count({
          where: { reservationId: id },
        }),
      ).toBe(0);
      expect(await statusOf(id)).toBe(ReservationStatus.PENDIENTE_DEPOSITO);

      expectStatus(await proofRequest(id, client.phone), 201);
      expect(ctx.cloudinary.uploads).toHaveLength(1);
    });

    it('si la reserva cambia mientras se sube la imagen, la imagen subida se borra para no dejar datos personales huérfanos', async () => {
      const { client, id } = await book('huerfana', futureSlot(62, 9));
      ctx.cloudinary.afterUpload = async () => {
        await ctx.prisma.client.reservation.update({
          where: { id },
          data: { status: ReservationStatus.CANCELADA },
        });
      };

      const res = await proofRequest(id, client.phone);

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(ctx.cloudinary.uploads).toHaveLength(1);
      expect(ctx.cloudinary.destroyed).toHaveLength(1);
      expect(
        await ctx.prisma.client.depositRecord.count({
          where: { reservationId: id },
        }),
      ).toBe(0);
    });

    it('si Conduit cae, la acción de la administradora sigue funcionando y el evento se entrega al recuperarse', async () => {
      const { id } = await book('conduitcae', futureSlot(63, 9));
      await ctx.sink.waitFor((requests) =>
        requests.some((r) => r.url.endsWith('/webhook/reservation.created')),
      );
      ctx.sink.clear();
      ctx.sink.failNext(4, 503);

      const cancelled = await asAdmin(
        ctx,
        'patch',
        `/reservations/${id}/admin-cancel`,
      ).send({ reason: 'Prueba de caída', notifyClient: true });
      expectStatus(cancelled, 200);
      expect(await statusOf(id)).toBe(ReservationStatus.CANCELADA);

      const delivered = await ctx.sink.waitFor(
        (requests) =>
          requests.some(
            (r) =>
              r.status === 200 &&
              r.url.endsWith('/webhook/reservation.cancelled') &&
              JSON.stringify(r.body).includes(id),
          ),
        60_000,
      );
      expect(delivered).toBe(true);
      expect(ctx.sink.requests.filter((r) => r.status === 503)).toHaveLength(4);
      const outbox = await ctx.prisma.client.conduitOutboxEvent.findMany({
        where: { eventType: 'reservation.cancelled' },
      });
      expect(outbox.every((event) => event.status === 'SENT')).toBe(true);
    }, 90_000);
  });
});
