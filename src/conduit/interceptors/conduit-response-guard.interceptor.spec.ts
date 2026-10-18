import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  collectIdentityMarkers,
  ConduitResponseGuardInterceptor,
} from './conduit-response-guard.interceptor';

const ALICE = '+573001112233';
const ALICE_ID = 'cliente-alicia';

function setup(options: Record<string, unknown> = {}) {
  const prisma = {
    client: {
      client: { findUnique: jest.fn().mockResolvedValue({ id: ALICE_ID }) },
      reservation: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'reserva-alicia', clientId: ALICE_ID },
          { id: 'reserva-bruno', clientId: 'cliente-bruno' },
        ]),
      },
    },
  };
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(options),
  } as unknown as Reflector;
  const guard = new ConduitResponseGuardInterceptor(
    reflector,
    prisma as unknown as PrismaService,
  );
  const run = (body: unknown, phone: string | null = ALICE) => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          path: '/api/v1/conduit/prueba',
          conduitContact: { phone, lid: null },
        }),
      }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of(body) };
    return lastValueFrom(guard.intercept(context, next));
  };
  return { run, prisma };
}

describe('ConduitResponseGuardInterceptor', () => {
  it('deja pasar los datos de la clienta verificada', async () => {
    const { run } = setup();
    const body = {
      phone: '3001112233',
      clientId: ALICE_ID,
      reservations: [{ id: 'reserva-alicia' }],
    };
    await expect(run(body)).resolves.toEqual(body);
  });

  it.each([
    ['un teléfono ajeno', { phone: '+573009998877' }],
    ['un clientId ajeno', { clientId: 'cliente-bruno' }],
    ['un cliente anidado ajeno', { data: { client: { id: 'cliente-bruno' } } }],
    [
      'un reservationId ajeno',
      { days: [{ reservations: [{ reservationId: 'reserva-bruno' }] }] },
    ],
    [
      'una reserva ajena en una lista',
      { reservations: [{ id: 'reserva-bruno' }] },
    ],
  ])('bloquea %s', async (_label, body) => {
    const { run } = setup();
    const error = await run(body).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getResponse()).toMatchObject({
      code: 'CONTACT_DATA_BLOCKED',
    });
  });

  it('no revisa las herramientas de datos públicos del negocio', async () => {
    const { run, prisma } = setup({ publicData: true });
    const body = { phone: '+576011234567' };
    await expect(run(body)).resolves.toEqual(body);
    expect(prisma.client.client.findUnique).not.toHaveBeenCalled();
  });

  it('sin teléfono verificado no consulta la base', async () => {
    const { run, prisma } = setup();
    await expect(run({ ok: true }, null)).resolves.toEqual({ ok: true });
    expect(prisma.client.client.findUnique).not.toHaveBeenCalled();
  });

  it('una respuesta sin marcadores de identidad no consulta la base', async () => {
    const { run, prisma } = setup();
    await expect(run({ handedOff: true })).resolves.toEqual({
      handedOff: true,
    });
    expect(prisma.client.client.findUnique).not.toHaveBeenCalled();
  });
});

describe('collectIdentityMarkers', () => {
  it('recorre objetos y listas anidadas e ignora fechas', () => {
    const markers = collectIdentityMarkers({
      at: new Date(),
      list: [{ clientPhone: '+571', nested: { reservationId: 'r1' } }],
    });
    expect(markers.phones.map((m) => m.path)).toEqual([
      '$.list[0].clientPhone',
    ]);
    expect(markers.reservationIds.map((m) => m.path)).toEqual([
      '$.list[0].nested.reservationId',
    ]);
  });
});
