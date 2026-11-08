import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { ConduitAdminController } from './conduit-admin.controller';
import { ConduitIntentKeyParam, SetSystemPauseDto } from './conduit-admin.dto';

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
  .filter(([method]) => method !== 'setSystemPause');

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
