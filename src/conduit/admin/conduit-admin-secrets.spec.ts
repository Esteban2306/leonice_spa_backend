import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { ConduitAdminController } from './conduit-admin.controller';
import { ConduitAdminError } from '../client/conduit-api.client';
import {
  findSecrets,
  looksLikeSecret,
  maskSecrets,
  scrubSecrets,
  SECRET_MASK,
} from '../../common/conduit-security/redact-secrets';
import { toPublicAiModel, toPublicAiModels } from './ai-model-public';

const ANTHROPIC_KEY =
  'sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef-xyz9';
const GOOGLE_KEY = 'AIzaSyD-1234567890abcdefghijklmnopqrstuv';
const UUID = '8e617ca9-5fd6-41ee-8cc5-6412cbe86235';

const MODEL_ROW = {
  id: UUID,
  provider: 'ANTHROPIC',
  model: 'claude-haiku-5-5',
  baseUrl: null,
  role: 'CONVERSATION',
  tier: 'FREE',
  priority: 1,
  isActive: true,
  dailyTokenLimit: 400000,
  minuteRequestLimit: 20,
  tokensUsedToday: 12,
  requestsThisMinute: 0,
  unavailableUntil: null,
  apiKeyLast4: 'xyz9',
  createdAt: '2026-10-01T00:00:00.000Z',
};

const POISON = {
  ...MODEL_ROW,
  apiKey: ANTHROPIC_KEY,
  authSecret: 'tool-secret-value',
  authSecretEncrypted: `enc:v1:${'ab'.repeat(24)}`,
  clientApiHeaders: {
    'x-api-key': GOOGLE_KEY,
    Authorization: 'Bearer abcdefghijklmnopqrstuvwxyz012345',
  },
  note: `Fallo con ${ANTHROPIC_KEY}`,
  aiModels: [{ ...MODEL_ROW, apiKey: ANTHROPIC_KEY }],
  data: [{ ...MODEL_ROW, apiKey: ANTHROPIC_KEY }],
  items: [{ nested: { token: 'abc', secret: 'def' } }],
};

function controller(adminResult: unknown) {
  const admin = jest.fn().mockResolvedValue(adminResult);
  const benign = new Proxy(
    {},
    { get: () => () => Promise.resolve({ ok: true, data: [], total: 0 }) },
  );
  const config = { get: () => UUID, getOrThrow: () => UUID };
  const instance = new ConduitAdminController(
    { admin } as never,
    config as never,
    benign as never,
    benign as never,
    benign as never,
  );
  return { instance, admin };
}

const routeHandlers = Object.getOwnPropertyNames(
  ConduitAdminController.prototype,
).filter((name) => {
  const fn = (
    ConduitAdminController.prototype as unknown as Record<string, unknown>
  )[name];
  return typeof fn === 'function' && Reflect.hasMetadata('method', fn);
});

function argsFor(method: string): unknown[] {
  const meta = (Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    ConduitAdminController,
    method,
  ) ?? {}) as Record<string, { index: number }>;
  const args: unknown[] = [];
  for (const [key, { index }] of Object.entries(meta)) {
    args[index] = key.startsWith(`${RouteParamtypes.PARAM}:`)
      ? UUID
      : key.startsWith(`${RouteParamtypes.BODY}:`)
        ? { text: 'x', minutes: 5 }
        : {};
  }
  return Array.from({ length: args.length }, (_, i) => args[i] ?? {});
}

describe('redact-secrets', () => {
  it('scrubSecrets reemplaza campos de secreto y enmascara valores con forma de clave, sin tocar datos normales', () => {
    const out = scrubSecrets({
      id: 'm1',
      apiKey: ANTHROPIC_KEY,
      apiKeyLast4: 'xyz9',
      tokensUsedToday: 10,
      maxTokensConversation: 400,
      note: `error ${GOOGLE_KEY} fin`,
      nested: [
        {
          authorization: 'Bearer abcdefghijklmnopqrstuvwxyz012345',
          name: 'Ana',
        },
      ],
      when: new Date('2026-10-01'),
      empty: null,
    });
    expect(out).toEqual({
      id: 'm1',
      apiKey: SECRET_MASK,
      apiKeyLast4: 'xyz9',
      tokensUsedToday: 10,
      maxTokensConversation: 400,
      note: `error ${SECRET_MASK} fin`,
      nested: [{ authorization: SECRET_MASK, name: 'Ana' }],
      when: new Date('2026-10-01'),
      empty: null,
    });
  });

  it('findSecrets detecta lo que scrubSecrets limpia y acepta valores ya enmascarados', () => {
    expect(findSecrets({ a: { apiKey: 'x' }, b: [ANTHROPIC_KEY] })).toEqual([
      '$.a.apiKey (campo de secreto)',
      '$.b[0] (valor con forma de clave)',
    ]);
    expect(findSecrets(scrubSecrets(POISON))).toEqual([]);
    expect(findSecrets({ 'x-api-key': SECRET_MASK })).toEqual([]);
  });

  it.each([
    ANTHROPIC_KEY,
    GOOGLE_KEY,
    'sk-abcdefghijklmnopqrstuvwxyz123456',
    'gsk_abcdefghijklmnopqrstuvwxyz',
  ])('reconoce y enmascara %s', (secret) => {
    expect(looksLikeSecret(secret)).toBe(true);
    expect(maskSecrets(`x ${secret} y`)).toBe(`x ${SECRET_MASK} y`);
  });

  it('no confunde identificadores ni textos de negocio con claves', () => {
    const text =
      'Terapia de hidratación 2 horas, id 8e617ca9-5fd6-41ee-8cc5-6412cbe86235, tarea sk-8';
    expect(maskSecrets(text)).toBe(text);
  });
});

describe('toPublicAiModel', () => {
  it('conserva solo los campos públicos y los últimos 4 de la clave', () => {
    const model = toPublicAiModel({
      ...MODEL_ROW,
      apiKey: ANTHROPIC_KEY,
      hidden: 'x',
      botConfigId: 'b',
    });
    expect(model).toEqual(MODEL_ROW);
    expect(Object.keys(model!)).not.toContain('apiKey');
    expect(findSecrets(model)).toEqual([]);
  });

  it('descarta entradas sin id y acepta lista directa o paginada', () => {
    expect(toPublicAiModel(null)).toBeNull();
    expect(toPublicAiModel({ apiKey: ANTHROPIC_KEY })).toBeNull();
    expect(
      toPublicAiModels([{ ...MODEL_ROW, apiKey: ANTHROPIC_KEY }, 'x']),
    ).toEqual([MODEL_ROW]);
    expect(
      toPublicAiModels({ data: [{ ...MODEL_ROW, apiKey: ANTHROPIC_KEY }] }),
    ).toEqual([MODEL_ROW]);
    expect(toPublicAiModels(undefined)).toEqual([]);
  });
});

describe('ConduitAdminController: el panel nunca recibe secretos', () => {
  it('encuentra los endpoints del controlador', () => {
    expect(routeHandlers.length).toBeGreaterThan(30);
    expect(routeHandlers).toEqual(
      expect.arrayContaining([
        'models',
        'addModel',
        'removeModel',
        'resetModel',
      ]),
    );
  });

  it.each(['models', 'addModel', 'removeModel', 'resetModel'])(
    '%s devuelve solo AiModelPublic aunque Conduit responda con la apiKey (respuesta antigua)',
    async (method) => {
      const { instance } = controller(
        method === 'models' ? [POISON, POISON] : POISON,
      );
      const result = await (
        instance as unknown as Record<
          string,
          (...a: unknown[]) => Promise<unknown>
        >
      )[method](...argsFor(method));
      expect(findSecrets(result)).toEqual([]);
      expect(JSON.stringify(result)).not.toContain(ANTHROPIC_KEY);
      const row = (Array.isArray(result) ? result[0] : result) as Record<
        string,
        unknown
      >;
      expect(Object.keys(row).sort()).toEqual(Object.keys(MODEL_ROW).sort());
    },
  );

  it('cada endpoint, con una respuesta de Conduit llena de secretos, responde sin ninguno', async () => {
    let exercised = 0;
    const leaks: string[] = [];
    for (const method of routeHandlers) {
      const { instance } = controller(POISON);
      let result: unknown;
      try {
        result = await (
          instance as unknown as Record<
            string,
            (...a: unknown[]) => Promise<unknown>
          >
        )[method](...argsFor(method));
      } catch {
        continue;
      }
      exercised++;
      const found = findSecrets(result);
      if (found.length) leaks.push(`${method}: ${found.join(', ')}`);
      expect(JSON.stringify(result ?? null)).not.toContain(ANTHROPIC_KEY);
      expect(JSON.stringify(result ?? null)).not.toContain(GOOGLE_KEY);
    }
    expect(exercised).toBeGreaterThan(25);
    expect(leaks).toEqual([]);
  });

  it('el mensaje de un error de Conduit se enmascara antes de llegar al navegador', async () => {
    const admin = jest
      .fn()
      .mockRejectedValue(
        new ConduitAdminError(
          400,
          `Incorrect API key provided: ${ANTHROPIC_KEY}`,
        ),
      );
    const config = { get: () => UUID, getOrThrow: () => UUID };
    const benign = new Proxy({}, { get: () => () => Promise.resolve({}) });
    const instance = new ConduitAdminController(
      { admin } as never,
      config as never,
      benign as never,
      benign as never,
      benign as never,
    );
    const error = await instance.addModel({}).catch((e: unknown) => e);
    expect(
      JSON.stringify(error, Object.getOwnPropertyNames(error as object)),
    ).not.toContain(ANTHROPIC_KEY);
    expect(
      (error as { getResponse?: () => unknown }).getResponse?.(),
    ).toBeDefined();
    expect(
      JSON.stringify((error as { getResponse: () => unknown }).getResponse()),
    ).not.toContain(ANTHROPIC_KEY);
  });

  it('guardia estática: la única llamada directa a conduit.admin es la que barre secretos', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'conduit-admin.controller.ts'),
      'utf8',
    );
    const direct = source.match(/this\.conduit\.admin\b/g) ?? [];
    expect(direct).toHaveLength(1);
    expect(source).toMatch(
      /return scrubSecrets\(await this\.conduit\.admin<T>\(method, path, options\)\)/,
    );
  });
});
