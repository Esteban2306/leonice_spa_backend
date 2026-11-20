import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { ConduitAdminController } from './conduit-admin.controller';
import {
  ConduitIntentKeyParam,
  MuteContactDto,
  SetSystemPauseDto,
} from './conduit-admin.dto';
import { AppException } from '../../common/errors/app.exception';
import { DEFAULT_MUTE_REASON, mutedContactAddress } from './muted-contact';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const bodyHandlers = Object.getOwnPropertyNames(
  ConduitAdminController.prototype,
)
  .flatMap((method) => {
    const args = (Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      ConduitAdminController,
      method,
    ) ?? {}) as Record<string, { index: number }>;
    const body = Object.entries(args).find(([key]) =>
      key.startsWith(`${RouteParamtypes.BODY}:`),
    );
    if (!body) return [];
    const types = Reflect.getMetadata(
      'design:paramtypes',
      ConduitAdminController.prototype,
      method,
    ) as unknown[];
    return [[method, types[body[1].index]] as const];
  })
  .filter(
    ([method]) => method !== 'setSystemPause' && method !== 'muteContact',
  );

describe('ConduitAdminController — cuerpos hacia Conduit', () => {
  it('encuentra los endpoints que reenvían un cuerpo', () => {
    expect(bodyHandlers.map(([method]) => method)).toEqual(
      expect.arrayContaining([
        'reply',
        'pause',
        'createTemplate',
        'createTool',
      ]),
    );
  });

  it.each(bodyHandlers)(
    '%s deja pasar el cuerpo intacto a Conduit',
    async (_method, metatype) => {
      const body = { text: 'Hola', minutes: 30, bodyHandlebars: '{{nombre}}' };

      await expect(
        pipe.transform(body, { type: 'body', metatype: metatype as never }),
      ).resolves.toEqual(body);
    },
  );
});

describe('ConduitAdminController — claves de intención', () => {
  const param = (key: string) =>
    pipe.transform(
      { key },
      { type: 'param', metatype: ConduitIntentKeyParam as never },
    );

  it.each(['saludo', 'rule.health', 'precios_v2'])('acepta %s', async (key) => {
    await expect(param(key)).resolves.toEqual({ key });
  });

  it.each(['../bots', 'Saludo', 'a', 'x y', 'a/b'])(
    'rechaza %s',
    async (key) => {
      await expect(param(key)).rejects.toBeDefined();
    },
  );
});

describe('ConduitAdminController — pausa del sistema', () => {
  const transform = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: SetSystemPauseDto });

  it('acepta un booleano', async () => {
    await expect(transform({ paused: true })).resolves.toEqual({
      paused: true,
    });
    await expect(transform({ paused: false })).resolves.toEqual({
      paused: false,
    });
  });

  it.each([{}, { paused: 'true' }, { paused: 1 }, { paused: true, extra: 1 }])(
    'rechaza %j',
    async (body) => {
      await expect(transform(body)).rejects.toBeDefined();
    },
  );
});

describe('ConduitAdminController — números a los que el bot nunca responde', () => {
  const BOT = '11111111-1111-4111-8111-111111111111';
  function build() {
    const admin = jest.fn().mockResolvedValue({ ok: true });
    const benign = new Proxy({}, { get: () => () => Promise.resolve({}) });
    const instance = new ConduitAdminController(
      { admin } as never,
      { get: () => BOT, getOrThrow: () => BOT } as never,
      benign as never,
      benign as never,
      benign as never,
      benign as never,
    );
    return { instance, admin };
  }

  it.each([
    ['3108525522', '573108525522'],
    ['+57 310 852 5522', '573108525522'],
    ['573108525522', '573108525522'],
    ['+1 415 555 0100', '14155550100'],
    ['123456789012345@lid', '123456789012345@lid'],
  ])('%s se guarda como %s', (raw, expected) => {
    expect(mutedContactAddress(raw)).toBe(expected);
  });

  it.each(['', '123', 'abc'])('%j no es un número válido', (raw) => {
    expect(mutedContactAddress(raw)).toBeNull();
  });

  it('silenciar un celular local le agrega el 57 y un motivo por defecto', async () => {
    const { instance, admin } = build();
    await instance.muteContact('3108525522', {});
    expect(admin).toHaveBeenCalledWith(
      'PUT',
      `bots/${BOT}/muted-contacts/573108525522`,
      expect.objectContaining({ body: { reason: DEFAULT_MUTE_REASON } }),
    );
  });

  it('respeta el motivo que escribe el administrador', async () => {
    const { instance, admin } = build();
    await instance.muteContact('3108525522', {
      reason: ' Bot de Bancolombia ',
    });
    expect(admin).toHaveBeenCalledWith(
      'PUT',
      expect.any(String),
      expect.objectContaining({ body: { reason: 'Bot de Bancolombia' } }),
    );
  });

  it('un número inválido no llega a Conduit', () => {
    const { instance, admin } = build();
    expect(() => instance.unmuteContact('abc')).toThrow(AppException);
    expect(admin).not.toHaveBeenCalled();
  });

  it('el motivo admite texto corto y nada más', async () => {
    const transform = (body: unknown) =>
      pipe.transform(body, { type: 'body', metatype: MuteContactDto });
    await expect(transform({ reason: 'Bot' })).resolves.toEqual({
      reason: 'Bot',
    });
    await expect(transform({ reason: 'x'.repeat(201) })).rejects.toBeDefined();
    await expect(transform({ extra: 1 })).rejects.toBeDefined();
  });
});
