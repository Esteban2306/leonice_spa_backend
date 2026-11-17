import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { ConduitWebhooksController } from './conduit.controller';
import { ConduitWebhookSignatureGuard } from './guards/conduit-webhook-signature.guard';
import { ConduitMessageEventsService } from './service/conduit-message-events.service';
import { ConduitMessageDeliveryLogRepository } from './repositories/conduit-message-delivery-log.repository';

const URL = '/integrations/conduit/message-events';
const TIMESTAMP = '2026-11-17T12:00:00.000Z';

describe('webhook de eventos de Conduit', () => {
  let app: INestApplication;
  let server: Server;
  const service = { handle: jest.fn(), opsAlert: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ConduitWebhooksController],
      providers: [
        { provide: ConduitMessageEventsService, useValue: service },
        { provide: ConduitMessageDeliveryLogRepository, useValue: {} },
      ],
    })
      .overrideGuard(ConduitWebhookSignatureGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('registra el estado de un mensaje', async () => {
    await request(server)
      .post(URL)
      .send({
        event: 'message.sent',
        timestamp: TIMESTAMP,
        data: {
          messageId: 'm1',
          channel: 'WHATSAPP',
          recipient: '573001112233',
          status: 'SENT',
          meta: { companyEventId: 'e1', extra: 1 },
        },
      })
      .expect(200, { received: true });
    const [handled] = service.handle.mock.calls[0] as [
      { data: { messageId: string; status: string } },
    ];
    expect(handled.data).toMatchObject({ messageId: 'm1', status: 'SENT' });
  });

  it('acepta un aviso de operación de Conduit en vez de rechazarlo', async () => {
    await request(server)
      .post(URL)
      .send({
        event: 'ops.alert',
        timestamp: TIMESTAMP,
        data: {
          kind: 'connection',
          subject: 'WhatsApp: problema con la conexión',
          lines: ['Línea principal desconectada'],
        },
      })
      .expect(200, { received: true });
    const [alert] = service.opsAlert.mock.calls[0] as [
      { data: { kind: string; lines: string[] } },
    ];
    expect(alert.data).toMatchObject({
      kind: 'connection',
      lines: ['Línea principal desconectada'],
    });
    expect(service.handle).not.toHaveBeenCalled();
  });

  it('ignora con 200 los eventos que este endpoint no maneja', async () => {
    await request(server)
      .post(URL)
      .send({
        event: 'verification.valid',
        timestamp: TIMESTAMP,
        data: { verificationId: 'v1', verdict: 'VALID' },
      })
      .expect(200, { received: true, ignored: true });
    expect(service.handle).not.toHaveBeenCalled();
    expect(service.opsAlert).not.toHaveBeenCalled();
  });

  it('sigue rechazando un evento de mensaje mal formado', async () => {
    await request(server)
      .post(URL)
      .send({
        event: 'message.sent',
        timestamp: TIMESTAMP,
        data: { messageId: 'm1', status: 'SENT', kind: 'x' },
      })
      .expect(400);
    expect(service.handle).not.toHaveBeenCalled();
  });

  it('rechaza un cuerpo sin tipo de evento o un aviso mal formado', async () => {
    await request(server).post(URL).send({ data: {} }).expect(400);
    await request(server)
      .post(URL)
      .send({ event: 'ops.alert', timestamp: TIMESTAMP, data: { kind: 1 } })
      .expect(400);
    expect(service.opsAlert).not.toHaveBeenCalled();
  });
});
