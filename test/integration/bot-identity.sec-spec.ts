import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { CloudinaryService } from 'src/infrastructure/cloudinary/cloudinary.service';
import { CreateReservationOrchestrator } from 'src/reservations/orchestrators/create-reservation.orchestrator';
import { CancelReservationOrchestrator } from 'src/reservations/orchestrators/cancel-reservation.orchestrator';
import { EVENT_TYPES } from 'src/common/events/constants/event.types';
import {
  createSecurityApp,
  HttpServer,
  resetDatabase,
  resetThrottle,
} from './app-harness';
import { futureSlot, newClientDto, seedWorld, World } from './harness';

const API = '/api/v1';
const IMAGE = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD';

interface Person {
  phone: string;
  name: string;
  clientId: string;
  reservationId: string;
}

describe('Aislamiento de identidad del bot: nunca datos de otra persona', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: HttpServer;
  let world: World;
  let alice: Person;
  let bruno: Person;
  const apiKey = process.env.CONDUIT_TOOL_API_KEY as string;

  const book = async (label: string, day: number): Promise<Person> => {
    const dto = newClientDto(label);
    const { reservations } = await app
      .get(CreateReservationOrchestrator)
      .execute({
        client: dto,
        treatments: [world.secondary.treatmentId],
        scheduledStart: futureSlot(day, 10).toISOString(),
      });
    return {
      phone: dto.phone,
      name: dto.name,
      clientId: reservations[0].clientId,
      reservationId: reservations[0].id,
    };
  };

  beforeAll(async () => {
    expect(apiKey).toBeDefined();
    ({ app, prisma } = await createSecurityApp());
    server = app.getHttpServer() as HttpServer;
    await resetDatabase(prisma.client);
    world = await seedWorld(prisma.client);
    alice = await book('alicia', 14);
    bruno = await book('bruno', 15);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetThrottle(app);
  });

  const call = (
    method: 'get' | 'post' | 'patch',
    path: string,
    contact: { phone?: string; lid?: string } = {},
  ) => {
    let req = request(server)
      [method](`${API}${path}`)
      .set('X-API-Key', apiKey)
      .set('X-Conduit-Conversation-Id', 'conversacion-identidad')
      .set(
        'X-Conduit-Idempotency-Key',
        `identidad-${Math.random().toString(36).slice(2)}`,
      );
    if (contact.phone) req = req.set('X-Conduit-Contact-Phone', contact.phone);
    if (contact.lid) req = req.set('X-Conduit-Contact-Lid', contact.lid);
    return req;
  };

  const leaks = (body: unknown, person: Person) => {
    const text = JSON.stringify(body);
    return (
      text.includes(person.phone) ||
      text.includes(person.name) ||
      text.includes(person.clientId)
    );
  };

  const leaksAnything = (body: unknown, person: Person) =>
    leaks(body, person) || JSON.stringify(body).includes(person.reservationId);

  const reservationOf = (person: Person) =>
    prisma.client.reservation.findUniqueOrThrow({
      where: { id: person.reservationId },
    });

  describe('sin identidad del chat no se toca ningún dato de clientes', () => {
    const identityTools = (): [string, () => request.Test][] => [
      [
        'registrar cliente',
        () => call('post', '/conduit/clients').send({ phone: bruno.phone }),
      ],
      [
        'actualizar perfil',
        () =>
          call('patch', '/conduit/clients').send({
            phone: bruno.phone,
            allergies: 'x',
          }),
      ],
      [
        'crear reserva',
        () =>
          call('post', '/conduit/booking/reservations').send({
            client: { phone: bruno.phone },
            treatments: [world.secondary.treatmentId],
            scheduledStart: futureSlot(20, 10).toISOString(),
          }),
      ],
      [
        'reservas próximas',
        () =>
          call(
            'get',
            `/conduit/booking/reservations/upcoming?phone=${encodeURIComponent(bruno.phone)}`,
          ),
      ],
      [
        'cancelar',
        () =>
          call('post', '/conduit/booking/reservations/cancel').send({
            phone: bruno.phone,
            reservationId: bruno.reservationId,
            scope: 'SINGLE',
          }),
      ],
      [
        'reagendar',
        () =>
          call('post', '/conduit/booking/reservations/reschedule').send({
            phone: bruno.phone,
            reservationId: bruno.reservationId,
            newScheduledStart: '2030-01-10T10:00:00-05:00',
          }),
      ],
      [
        'depósitos pendientes',
        () =>
          call(
            'get',
            `/deposits/pending?phone=${encodeURIComponent(bruno.phone)}`,
          ),
      ],
      [
        'comprobante automático',
        () =>
          call('post', '/deposits/automatic').send({
            phone: bruno.phone,
            reservationId: bruno.reservationId,
            coverage: 'ANTICIPO',
            imageBase64: IMAGE,
          }),
      ],
      [
        'comprobante por reserva',
        () =>
          call(
            'post',
            `/reservations/${bruno.reservationId}/deposits/automatic`,
          ).send({
            phone: bruno.phone,
            coverage: 'ANTICIPO',
            imageBase64: IMAGE,
          }),
      ],
      [
        'pasar a persona',
        () =>
          call('post', '/conduit/handoff').send({
            phone: bruno.phone,
            reason: 'x',
          }),
      ],
    ];

    it.each(identityTools().map(([label], i) => [label, i]))(
      '%s se rechaza con CONTACT_REQUIRED y no devuelve nada de nadie',
      async (_label, index) => {
        const res = await identityTools()[index][1]();
        expect(res.status).toBe(403);
        expect((res.body as { code: string }).code).toBe('CONTACT_REQUIRED');
        expect(leaks(res.body, bruno)).toBe(false);
      },
    );

    it('las herramientas de datos públicos del negocio siguen respondiendo', async () => {
      expect((await call('get', '/conduit/booking/treatments')).status).toBe(
        200,
      );
      expect((await call('get', '/conduit/business-info')).status).toBe(200);
      const day = futureSlot(16, 10).toISOString().slice(0, 10);
      expect(
        (
          await call(
            'get',
            `/conduit/booking/availability?date=${day}&treatmentId=${world.secondary.treatmentId}`,
          )
        ).status,
      ).toBe(200);
    });
  });

  describe('el chat de Alicia no alcanza ningún dato de Bruno', () => {
    const asAlice = () => ({ phone: alice.phone });

    it('consultar las reservas de Bruno se rechaza', async () => {
      const res = await call(
        'get',
        `/conduit/booking/reservations/upcoming?phone=${encodeURIComponent(bruno.phone)}`,
        { phone: alice.phone },
      );
      expect(res.status).toBe(403);
      expect(leaksAnything(res.body, bruno)).toBe(false);
    });

    it('consultar los depósitos de Bruno se rechaza', async () => {
      const res = await call(
        'get',
        `/deposits/pending?phone=${encodeURIComponent(bruno.phone)}`,
        { phone: alice.phone },
      );
      expect(res.status).toBe(403);
      expect(leaksAnything(res.body, bruno)).toBe(false);
    });

    it('sus propias consultas solo devuelven lo suyo', async () => {
      const res = await call(
        'get',
        `/conduit/booking/reservations/upcoming?phone=${encodeURIComponent(alice.phone)}`,
        asAlice(),
      );
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).toContain(alice.reservationId);
      expect(leaksAnything(res.body, bruno)).toBe(false);
    });

    it('cancelar la reserva de Bruno falla y la reserva queda intacta', async () => {
      const res = await call(
        'post',
        '/conduit/booking/reservations/cancel',
        asAlice(),
      ).send({
        phone: bruno.phone,
        reservationId: bruno.reservationId,
        scope: 'SINGLE',
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(leaks(res.body, bruno)).toBe(false);
      expect((await reservationOf(bruno)).status).toBe('PENDIENTE_DEPOSITO');
    });

    it('reagendar la reserva de Bruno falla y la reserva queda intacta', async () => {
      const before = await reservationOf(bruno);
      const res = await call(
        'post',
        '/conduit/booking/reservations/reschedule',
        asAlice(),
      ).send({
        phone: bruno.phone,
        reservationId: bruno.reservationId,
        newScheduledStart: futureSlot(17, 11).toISOString(),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(leaks(res.body, bruno)).toBe(false);
      expect((await reservationOf(bruno)).scheduledStart).toEqual(
        before.scheduledStart,
      );
    });

    it.each([
      [
        '/deposits/automatic',
        (p: Person) => ({ reservationId: p.reservationId }),
      ],
      ['/reservations/:id/deposits/automatic', () => ({})],
    ])(
      'subir un comprobante a la reserva de Bruno por %s se rechaza antes de tocar Cloudinary',
      async (path, extra) => {
        const upload = jest.spyOn(
          app.get(CloudinaryService),
          'uploadDepositProofFromBase64',
        );
        const res = await call(
          'post',
          path.replace(':id', bruno.reservationId),
          asAlice(),
        ).send({
          phone: bruno.phone,
          coverage: 'ANTICIPO',
          imageBase64: IMAGE,
          ...extra(bruno),
        });
        expect(res.status).toBe(403);
        expect(upload).not.toHaveBeenCalled();
        expect(leaks(res.body, bruno)).toBe(false);
        expect((await reservationOf(bruno)).status).toBe('PENDIENTE_DEPOSITO');
        upload.mockRestore();
      },
    );

    it('actualizar el perfil con el teléfono de Bruno modifica solo a Alicia', async () => {
      const brunoBefore = await prisma.client.client.findUniqueOrThrow({
        where: { id: bruno.clientId },
      });
      const res = await call('patch', '/conduit/clients', asAlice()).send({
        phone: bruno.phone,
        isPregnant: false,
      });
      expect(leaksAnything(res.body, bruno)).toBe(false);
      const brunoAfter = await prisma.client.client.findUniqueOrThrow({
        where: { id: bruno.clientId },
      });
      expect(brunoAfter.updatedAt).toEqual(brunoBefore.updatedAt);
    });

    it('registrarse con el teléfono de Bruno devuelve a Alicia, nunca el perfil de Bruno', async () => {
      const res = await call('post', '/conduit/clients', asAlice()).send({
        phone: bruno.phone,
        name: 'Suplantación',
        birthDate: '1990-01-01',
      });
      expect(res.status).toBeLessThan(300);
      expect((res.body as { phone: string }).phone).toBe(alice.phone);
      expect(leaksAnything(res.body, bruno)).toBe(false);
    });

    it('reservar con el teléfono de Bruno reserva para Alicia', async () => {
      const brunoCount = await prisma.client.reservation.count({
        where: { clientId: bruno.clientId },
      });
      const res = await call(
        'post',
        '/conduit/booking/reservations',
        asAlice(),
      ).send({
        client: { phone: bruno.phone },
        treatments: [world.tertiary.treatmentId],
        scheduledStart: futureSlot(18, 9).toISOString(),
      });
      expect(res.status).toBe(201);
      const created = (res.body as { reservations: { clientId: string }[] })
        .reservations;
      expect(created.every((r) => r.clientId === alice.clientId)).toBe(true);
      expect(
        await prisma.client.reservation.count({
          where: { clientId: bruno.clientId },
        }),
      ).toBe(brunoCount);
    });

    it('pedir una persona con el teléfono de Bruno avisa con el número verificado de Alicia', async () => {
      const seen: { phone: string | null }[] = [];
      const capture = (event: { payload: { phone: string | null } }) =>
        seen.push(event.payload);
      const events = app.get(EventEmitter2);
      events.on(EVENT_TYPES.CONDUIT_HANDOFF_REQUESTED, capture);
      const res = await call('post', '/conduit/handoff', asAlice()).send({
        phone: bruno.phone,
        reason: 'Quiero hablar con alguien',
      });
      events.off(EVENT_TYPES.CONDUIT_HANDOFF_REQUESTED, capture);
      expect(res.status).toBe(200);
      expect(seen.map((p) => p.phone)).toEqual([alice.phone]);
    });
  });

  describe('chat identificado solo por LID', () => {
    it.each([
      [
        'reservas próximas',
        'get',
        `/conduit/booking/reservations/upcoming?phone=x`,
      ],
      ['depósitos pendientes', 'get', '/deposits/pending?phone=x'],
    ] as const)(
      '%s se rechaza sin teléfono verificado',
      async (_l, method, path) => {
        const res = await call(method, path, { lid: '123456789' });
        expect(res.status).toBe(403);
        expect((res.body as { code: string }).code).toBe(
          'CONTACT_NOT_VERIFIED',
        );
      },
    );

    it('registrarse escribiendo el número de una clienta existente no devuelve su perfil', async () => {
      const res = await call('post', '/conduit/clients', {
        lid: '123456789',
      }).send({ phone: bruno.phone, name: 'Otra', birthDate: '1990-01-01' });
      expect(res.status).toBe(403);
      expect(leaks(res.body, bruno)).toBe(false);
    });
  });

  describe('guardián de respuestas (defensa en profundidad)', () => {
    it('si un fallo interno devolviera datos de Bruno al chat de Alicia, la respuesta se bloquea', async () => {
      const cancel = app.get(CancelReservationOrchestrator);
      const brunoView = await cancel.listUpcomingByPhone(bruno.phone);
      const bug = jest
        .spyOn(cancel, 'listUpcomingByPhone')
        .mockResolvedValueOnce(brunoView);

      const res = await call(
        'get',
        `/conduit/booking/reservations/upcoming?phone=${encodeURIComponent(alice.phone)}`,
        { phone: alice.phone },
      );
      bug.mockRestore();

      expect(JSON.stringify(brunoView)).toContain(bruno.reservationId);
      expect(res.status).toBe(403);
      expect((res.body as { code: string }).code).toBe('CONTACT_DATA_BLOCKED');
      expect(leaksAnything(res.body, bruno)).toBe(false);
    });
  });
});
