import { ReservationStatus } from '@prisma/client';
import request from 'supertest';
import { IdempotencyService } from 'src/common/idempotency/idempotency.service';
import { SafeCacheService } from 'src/infrastructure/redis/safe-cache.service';
import { DepositDeadlineService } from 'src/reservations/service/deposit-deadline.service';
import { futureSlot, newClientDto } from '../../integration/harness';
import {
  API,
  createE2eApp,
  E2eContext,
  expectStatus,
} from '../support/e2e-app';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('E2E: Redis real (caché, idempotencia, límites de uso y colas BullMQ)', () => {
  let ctx: E2eContext;
  let cache: SafeCacheService;
  let idempotency: IdempotencyService;

  beforeAll(async () => {
    ctx = await createE2eApp();
    cache = ctx.app.get(SafeCacheService);
    idempotency = ctx.app.get(IdempotencyService);
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await ctx.resetThrottle();
  });

  describe('SafeCacheService', () => {
    it('guarda, lee, expira e invalida valores', async () => {
      const key = `catalog:test:${Date.now()}`;
      expect(await cache.get(key)).toBeNull();

      await cache.set(key, { a: 1 }, 1);
      expect(await cache.get(key)).toEqual({ a: 1 });

      await sleep(1_300);
      expect(await cache.get(key)).toBeNull();

      await cache.set(key, 'x', 30);
      await cache.delete(key);
      expect(await cache.get(key)).toBeNull();
    });

    it('setIfAbsent: de 40 intentos simultáneos exactamente uno gana la reserva', async () => {
      const key = `idempotency:test:${Date.now()}`;
      const results = await Promise.all(
        Array.from({ length: 40 }, () => cache.setIfAbsent(key, 'yo', 30)),
      );
      expect(results.filter((r) => r === true)).toHaveLength(1);
      expect(results.filter((r) => r === false)).toHaveLength(39);
      await cache.delete(key);
    });
  });

  describe('IdempotencyService', () => {
    it('reserva, completa y reproduce la misma respuesta, y detecta contenido distinto', async () => {
      const key = `idempotency:svc:${Date.now()}`;

      const first = await idempotency.begin(key, 'huella-A');
      expect(first.kind).toBe('EXECUTE');

      const inProgress = await idempotency.begin(key, 'huella-A');
      expect(inProgress).toMatchObject({ kind: 'REJECT' });

      await idempotency.complete(key, 'huella-A', 201, { id: 'r1' });
      const replay = await idempotency.begin(key, 'huella-A');
      expect(replay).toMatchObject({
        kind: 'REPLAY',
        statusCode: 201,
        body: { id: 'r1' },
      });

      const reused = await idempotency.begin(key, 'huella-B');
      expect(reused).toMatchObject({
        kind: 'REJECT',
        code: 'IDEMPOTENCY_KEY_REUSED',
      });

      await idempotency.abandon(key);
      expect((await idempotency.begin(key, 'huella-B')).kind).toBe('EXECUTE');
      await idempotency.abandon(key);
    });
  });

  describe('límites de uso', () => {
    it('el endpoint público de cancelación responde 429 con aviso claro al pasar 10 intentos por minuto', async () => {
      const id = '3f2a8f0e-1b7e-4c58-9a55-2d6f0c1e7a11';
      const statuses: number[] = [];
      let last: request.Response | undefined;
      for (let i = 0; i < 14; i++) {
        last = await request(ctx.server)
          .patch(`${API}/reservations/${id}/cancel`)
          .send({ phone: '+573001112233', scope: 'SINGLE' });
        statuses.push(last.status);
      }
      expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(
        3,
      );
      expect(statuses.slice(0, 10).every((s) => s !== 429)).toBe(true);
      expect((last!.body as { code: string }).code).toBe('RATE_LIMITED');
    });

    it('el límite de reservas por teléfono frena el abuso de un mismo número y no afecta a otro', async () => {
      const spammer = newClientDto('spam');
      const body = (client: ReturnType<typeof newClientDto>, day: number) => ({
        client: {
          ...client,
          consent: { policyVersion: 'v1', healthDataConsent: true },
        },
        treatments: [ctx.world.secondary.treatmentId],
        scheduledStart: futureSlot(day, 9).toISOString(),
      });
      const statuses: number[] = [];
      for (let i = 0; i < 17; i++) {
        statuses.push(
          (
            await request(ctx.server)
              .post(`${API}/reservations`)
              .send(body(spammer, 20 + i))
          ).status,
        );
      }
      expect(statuses.slice(0, 15).every((s) => s === 201)).toBe(true);
      expect(statuses.slice(15)).toEqual([429, 429]);

      const other = await request(ctx.server)
        .post(`${API}/reservations`)
        .send(body(newClientDto('legitima'), 60));
      expectStatus(other, 201);
    });
  });

  describe('colas BullMQ', () => {
    it('un job de vencimiento programado en Redis se ejecuta solo y cancela la reserva sin comprobante', async () => {
      const client = newClientDto('colavence');
      const created = await request(ctx.server)
        .post(`${API}/reservations`)
        .send({
          client: {
            ...client,
            consent: { policyVersion: 'v1', healthDataConsent: true },
          },
          treatments: [ctx.world.secondary.treatmentId],
          scheduledStart: futureSlot(80, 9).toISOString(),
        });
      expectStatus(created, 201);
      const id = (created.body as { reservations: { id: string }[] })
        .reservations[0].id;

      await ctx.prisma.client.reservation.update({
        where: { id },
        data: { depositExpiresAt: new Date(Date.now() - 1_000) },
      });
      await ctx.app
        .get(DepositDeadlineService)
        .scheduleTimeout(id, new Date(Date.now() + 800));

      const deadline = Date.now() + 15_000;
      let status: ReservationStatus | undefined;
      while (Date.now() < deadline) {
        status = (
          await ctx.prisma.client.reservation.findUniqueOrThrow({
            where: { id },
            select: { status: true },
          })
        ).status;
        if (status === ReservationStatus.CANCELADA) break;
        await sleep(250);
      }
      expect(status).toBe(ReservationStatus.CANCELADA);
      const execution = await ctx.prisma.client.automationExecution.findFirst({
        where: { reservationId: id, type: 'DEPOSITO_TIMEOUT' },
      });
      expect(execution?.result).toBe('EXECUTED');
    });

    it('el mismo evento de negocio encolado dos veces con el mismo jobId se publica una sola vez', async () => {
      const client = newClientDto('dedupe');
      const created = await request(ctx.server)
        .post(`${API}/reservations`)
        .send({
          client: {
            ...client,
            consent: { policyVersion: 'v1', healthDataConsent: true },
          },
          treatments: [ctx.world.secondary.treatmentId],
          scheduledStart: futureSlot(81, 9).toISOString(),
        });
      expectStatus(created, 201);
      await ctx.sink.waitFor((requests) =>
        requests.some((r) => r.url.endsWith('/webhook/reservation.created')),
      );
      await sleep(500);
      const published = ctx.sink.requests.filter(
        (r) =>
          r.url.endsWith('/webhook/reservation.created') &&
          JSON.stringify(r.body).includes(client.phone),
      );
      expect(published).toHaveLength(1);
    });
  });
});
