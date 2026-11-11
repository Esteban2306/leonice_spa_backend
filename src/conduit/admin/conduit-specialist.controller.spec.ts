import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ConduitAdminError } from '../client/conduit-api.client';
import { ConduitSpecialistController } from './conduit-specialist.controller';
import {
  ReviewVerificationDto,
  RotateModelKeyDto,
  SetVerificationModeDto,
} from './conduit-specialist.dto';

const BOT = '0f6c1f0e-4f5d-4c8e-9a8b-111111111111';
const SPECIALIST = 'a9705da3-087c-4949-b433-409602747229';
const MODEL = '8e617ca9-5fd6-41ee-8cc5-6412cbe86235';
const VERIFICATION = '5b2f1f0e-4f5d-4c8e-9a8b-222222222222';
const ANTHROPIC_KEY =
  'sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef-xyz9';

const model = (extra: Record<string, unknown> = {}) => ({
  id: MODEL,
  provider: 'ANTHROPIC',
  model: 'claude-haiku-5-5',
  baseUrl: null,
  role: 'IMAGE_ANALYSIS',
  tier: 'PAID',
  priority: 1,
  isActive: true,
  dailyTokenLimit: null,
  minuteRequestLimit: null,
  tokensUsedToday: 0,
  requestsThisMinute: null,
  unavailableUntil: null,
  apiKeyLast4: 'xyz9',
  createdAt: '2026-11-10T10:00:00.000Z',
  apiKey: ANTHROPIC_KEY,
  ...extra,
});

const binding = (extra: Record<string, unknown> = {}) => ({
  capability: 'image-analysis',
  specialistId: SPECIALIST,
  mode: 'ACTIVE',
  timeoutMs: 15000,
  onFailure: 'BLOCK',
  blockMessage: 'Una persona revisará tu comprobante.',
  specialist: {
    id: SPECIALIST,
    key: 'comprobante-anticipo',
    name: 'Comprobante de anticipo',
    status: 'ACTIVE',
    version: 3,
  },
  ...extra,
});

const verification = (extra: Record<string, unknown> = {}) => ({
  id: VERIFICATION,
  conversationId: 'conv-1',
  verdict: 'VALID',
  mode: 'ACTIVE',
  confidence: 0.9,
  fields: {
    amount: 25000,
    destination: '3144455235',
    recipient: 'Leonice',
    reference: 'M123456',
    date: '2026-11-10',
  },
  reasonCodes: ['RULES_PASSED'],
  createdAt: '2026-11-10T15:00:00.000Z',
  reviewedAt: null,
  reviewDecision: null,
  ...extra,
});

type Routes = Record<string, unknown>;
type AdminOptions = { query?: Record<string, unknown>; body?: unknown };
type AdminCall = [method: string, route: string, options?: AdminOptions];
type AdminMock = jest.Mock<Promise<unknown>, AdminCall>;

function build(overrides: Routes = {}, botId: string | null = BOT) {
  const routes: Routes = {
    [`GET bot/config/${BOT}`]: { id: BOT, imageAnalysisEnabled: true },
    [`GET bots/${BOT}/specialists`]: [binding()],
    [`GET specialists/${SPECIALIST}`]: binding().specialist,
    [`GET specialists/${SPECIALIST}/models`]: [model()],
    'GET specialists/runtime': { enabled: true },
    'GET verifications': { items: [verification()], nextCursor: null },
    ...overrides,
  };
  const admin: AdminMock = jest.fn(
    (method: string, route: string, options?: AdminOptions) => {
      const key = `${method} ${route}`;
      if (!(key in routes)) {
        return Promise.reject(new ConduitAdminError(404, `sin ruta ${key}`));
      }
      const value = routes[key];
      const out =
        typeof value === 'function' ? (value as () => unknown)() : value;
      if (out instanceof Error) return Promise.reject(out);
      void options;
      return Promise.resolve(out);
    },
  );
  const config = {
    get: (name: string) =>
      name === 'CONDUIT_DEFAULT_BOT_ID' ? botId : undefined,
  };
  const controller = new ConduitSpecialistController(
    { admin } as never,
    config as never,
  );
  return { controller, admin };
}

const calls = (admin: AdminMock, method: string, route: string) =>
  admin.mock.calls.filter((c) => c[0] === method && c[1] === route);

describe('ConduitSpecialistController.status', () => {
  it('con todo en orden está listo y la lista de comprobación pasa entera', async () => {
    const { controller } = build();
    const status = await controller.status();

    expect(status.ready).toBe(true);
    expect(status.checklist).toEqual([
      { key: 'runtime', ok: true },
      { key: 'images', ok: true },
      { key: 'specialist', ok: true },
      { key: 'model', ok: true },
      { key: 'binding', ok: true },
    ]);
    expect(status.specialist).toMatchObject({
      id: SPECIALIST,
      status: 'ACTIVE',
      version: 3,
    });
    expect(status.binding).toMatchObject({ mode: 'ACTIVE', timeoutMs: 15000 });
    expect(status.partial).toBe(false);
  });

  it('nunca devuelve la clave del modelo, solo sus últimos 4 caracteres', async () => {
    const { controller } = build();
    const status = await controller.status();
    const json = JSON.stringify(status);
    expect(json).not.toContain(ANTHROPIC_KEY);
    expect(json).not.toContain('sk-ant');
    expect(status.models[0].apiKeyLast4).toBe('xyz9');
  });

  it('resume los resultados recientes sin exponer la cuenta completa ni la referencia', async () => {
    const { controller } = build();
    const [recent] = (await controller.status()).recent;
    expect(recent).toEqual({
      id: VERIFICATION,
      createdAt: '2026-11-10T15:00:00.000Z',
      verdict: 'VALID',
      mode: 'ACTIVE',
      reasonCodes: ['RULES_PASSED'],
      amount: 25000,
      date: '2026-11-10',
      destinationLast4: '5235',
      pendingReview: false,
      reviewDecision: null,
    });
    const json = JSON.stringify(recent);
    expect(json).not.toContain('3144455235');
    expect(json).not.toContain('M123456');
    expect(json).not.toContain('Leonice');
  });

  it('marca como pendientes los dudosos o con error sin revisar y cuenta los pendientes', async () => {
    const pendingItem = verification({ verdict: 'NEEDS_REVIEW' });
    const { controller, admin } = build({
      'GET verifications': () => ({ items: [pendingItem], nextCursor: null }),
    });
    const status = await controller.status();
    expect(status.recent[0].pendingReview).toBe(true);
    expect(status.pendingReview).toBe(1);

    const pendingCall = admin.mock.calls.find(
      (c) => c[1] === 'verifications' && c[2]?.query?.pendingReview === 'true',
    );
    expect(pendingCall?.[2]?.query).toMatchObject({ botConfigId: BOT });
  });

  it('una verificación ya revisada no cuenta como pendiente', async () => {
    const { controller } = build({
      'GET verifications': {
        items: [
          verification({
            verdict: 'NEEDS_REVIEW',
            reviewedAt: '2026-11-10T16:00:00.000Z',
            reviewDecision: 'APPROVED',
          }),
        ],
      },
    });
    const [recent] = (await controller.status()).recent;
    expect(recent.pendingReview).toBe(false);
    expect(recent.reviewDecision).toBe('APPROVED');
  });

  it('sin análisis de imágenes en el bot no está listo', async () => {
    const { controller } = build({
      [`GET bot/config/${BOT}`]: { id: BOT, imageAnalysisEnabled: false },
    });
    const status = await controller.status();
    expect(status.ready).toBe(false);
    expect(status.checklist.find((i) => i.key === 'images')?.ok).toBe(false);
  });

  it('si Conduit no tiene el endpoint de estado, lo marca desconocido y no está listo', async () => {
    const { controller } = build({
      'GET specialists/runtime': new ConduitAdminError(404, 'no existe'),
    });
    const status = await controller.status();
    expect(status.runtimeEnabled).toBeNull();
    expect(status.checklist[0]).toEqual({ key: 'runtime', ok: null });
    expect(status.ready).toBe(false);
    expect(status.partial).toBe(true);
  });

  it('con los especialistas apagados en el servidor no está listo', async () => {
    const { controller } = build({
      'GET specialists/runtime': { enabled: false },
    });
    const status = await controller.status();
    expect(status.runtimeEnabled).toBe(false);
    expect(status.ready).toBe(false);
  });

  it('sin vínculo pero con el especialista creado, lo muestra y marca el vínculo como pendiente', async () => {
    const { controller } = build({
      [`GET bots/${BOT}/specialists`]: [],
      'GET specialists/by-key/comprobante-anticipo': {
        id: SPECIALIST,
        key: 'comprobante-anticipo',
        name: 'Comprobante de anticipo',
        status: 'ACTIVE',
        version: 1,
      },
    });
    const status = await controller.status();
    expect(status.specialist?.id).toBe(SPECIALIST);
    expect(status.binding).toBeNull();
    expect(status.models).toHaveLength(1);
    expect(status.checklist.find((i) => i.key === 'binding')?.ok).toBe(false);
    expect(status.ready).toBe(false);
  });

  it('sin especialista no consulta modelos y lo informa', async () => {
    const { controller, admin } = build({
      [`GET bots/${BOT}/specialists`]: [],
    });
    const status = await controller.status();
    expect(status.specialist).toBeNull();
    expect(status.models).toEqual([]);
    expect(status.checklist.find((i) => i.key === 'specialist')?.ok).toBe(
      false,
    );
    expect(admin.mock.calls.some((c) => String(c[1]).endsWith('/models'))).toBe(
      false,
    );
  });

  it.each(['OFF', 'SHADOW'])(
    'un vínculo en %s no está listo: solo observa o está apagado',
    async (mode) => {
      const { controller } = build({
        [`GET bots/${BOT}/specialists`]: [binding({ mode })],
      });
      const status = await controller.status();
      expect(status.binding?.mode).toBe(mode);
      expect(status.checklist.find((i) => i.key === 'binding')?.ok).toBe(false);
      expect(status.ready).toBe(false);
    },
  );

  it('un especialista inactivo no pasa la comprobación', async () => {
    const { controller } = build({
      [`GET specialists/${SPECIALIST}`]: {
        ...binding().specialist,
        status: 'INACTIVE',
      },
    });
    expect((await controller.status()).checklist[2]).toEqual({
      key: 'specialist',
      ok: false,
    });
  });

  it.each([
    ['inactivo', { isActive: false }],
    ['de conversación', { role: 'CONVERSATION' }],
    [
      'no disponible por ahora',
      { unavailableUntil: new Date(Date.now() + 3_600_000).toISOString() },
    ],
  ])('un modelo %s no cuenta como utilizable', async (_name, extra) => {
    const { controller } = build({
      [`GET specialists/${SPECIALIST}/models`]: [model(extra)],
    });
    expect((await controller.status()).checklist[3]).toEqual({
      key: 'model',
      ok: false,
    });
  });

  it('un modelo de respaldo cuenta como utilizable', async () => {
    const { controller } = build({
      [`GET specialists/${SPECIALIST}/models`]: [
        model({ isActive: false }),
        model({ id: VERIFICATION, role: 'FALLBACK' }),
      ],
    });
    expect((await controller.status()).checklist[3].ok).toBe(true);
  });

  it('si fallan las consultas opcionales igual responde, marcado como parcial', async () => {
    const { controller } = build({
      'GET verifications': new ConduitAdminError(500, 'caído'),
      [`GET specialists/${SPECIALIST}/models`]: new ConduitAdminError(
        500,
        'caído',
      ),
    });
    const status = await controller.status();
    expect(status.recent).toEqual([]);
    expect(status.models).toEqual([]);
    expect(status.partial).toBe(true);
    expect(status.ready).toBe(false);
  });

  it('si falla lo esencial (el bot), responde que Conduit no está disponible', async () => {
    const { controller } = build({
      [`GET bot/config/${BOT}`]: new ConduitAdminError(503, 'caído'),
    });
    await expect(controller.status()).rejects.toMatchObject({
      code: 'CONDUIT_UNAVAILABLE',
    });
  });

  it('sin el bot configurado en el servidor, lo dice sin llamar a Conduit', async () => {
    const { controller, admin } = build({}, null);
    await expect(controller.status()).rejects.toMatchObject({
      code: 'CONDUIT_NOT_CONFIGURED',
    });
    expect(admin).not.toHaveBeenCalled();
  });
});

describe('ConduitSpecialistController: acciones', () => {
  it('cambiar el modo conserva tiempo, política de fallo y mensaje del vínculo', async () => {
    const { controller, admin } = build({
      [`PUT bots/${BOT}/specialists/image-analysis`]: {
        binding: {},
        warnings: [],
      },
    });
    await controller.setMode({ mode: 'OFF' });

    const [put] = calls(admin, 'PUT', `bots/${BOT}/specialists/image-analysis`);
    expect(put[2]?.body).toEqual({
      specialistId: SPECIALIST,
      mode: 'OFF',
      timeoutMs: 15000,
      onFailure: 'BLOCK',
      blockMessage: 'Una persona revisará tu comprobante.',
    });
  });

  it('sin vínculo previo usa los valores seguros por defecto', async () => {
    const { controller, admin } = build({
      [`GET bots/${BOT}/specialists`]: [],
      'GET specialists/by-key/comprobante-anticipo': {
        id: SPECIALIST,
        key: 'comprobante-anticipo',
        name: 'x',
        status: 'ACTIVE',
        version: 1,
      },
      [`PUT bots/${BOT}/specialists/image-analysis`]: { binding: {} },
    });
    await controller.setMode({ mode: 'ACTIVE' });
    const [put] = calls(admin, 'PUT', `bots/${BOT}/specialists/image-analysis`);
    expect(put[2]?.body).toEqual({
      specialistId: SPECIALIST,
      mode: 'ACTIVE',
      timeoutMs: 12000,
      onFailure: 'DEGRADE',
    });
  });

  it('sin especialista no intenta vincular nada', async () => {
    const { controller, admin } = build({
      [`GET bots/${BOT}/specialists`]: [],
    });
    await expect(controller.setMode({ mode: 'ACTIVE' })).rejects.toBeInstanceOf(
      AppException,
    );
    expect(
      calls(admin, 'PUT', `bots/${BOT}/specialists/image-analysis`),
    ).toHaveLength(0);
  });

  it('si Conduit rechaza el cambio (por ejemplo sin modelo), el motivo llega al panel', async () => {
    const { controller } = build({
      [`PUT bots/${BOT}/specialists/image-analysis`]: new ConduitAdminError(
        409,
        'No se puede poner el vínculo en ACTIVE.',
      ),
    });
    await expect(controller.setMode({ mode: 'ACTIVE' })).rejects.toMatchObject({
      code: 'CONDUIT_REQUEST_REJECTED',
      message: 'No se puede poner el vínculo en ACTIVE.',
    });
  });

  it('rotar la clave envía solo la clave nueva al especialista correcto y no la devuelve', async () => {
    const { controller, admin } = build({
      [`PATCH specialists/${SPECIALIST}/models/${MODEL}`]: model({
        apiKeyLast4: 'abcd',
      }),
    });
    const result = await controller.rotateKey(MODEL, {
      apiKey: 'sk-ant-nueva-clave-de-prueba-0000',
    });

    const [patch] = calls(
      admin,
      'PATCH',
      `specialists/${SPECIALIST}/models/${MODEL}`,
    );
    expect(patch[2]?.body).toEqual({
      apiKey: 'sk-ant-nueva-clave-de-prueba-0000',
    });
    expect(result).toMatchObject({ id: MODEL, apiKeyLast4: 'abcd' });
    expect(JSON.stringify(result)).not.toContain('sk-ant');
  });

  it('rotar la clave ignora cualquier otro campo que llegue en el cuerpo', async () => {
    const { controller, admin } = build({
      [`PATCH specialists/${SPECIALIST}/models/${MODEL}`]: model(),
    });
    await controller.rotateKey(MODEL, {
      apiKey: 'sk-ant-nueva-clave-de-prueba-0000',
      isActive: false,
      priority: 1,
    } as never);
    const [patch] = calls(
      admin,
      'PATCH',
      `specialists/${SPECIALIST}/models/${MODEL}`,
    );
    expect(Object.keys(patch[2]?.body as object)).toEqual(['apiKey']);
  });

  it('reactivar un modelo usa el especialista resuelto por el servidor, no uno del cliente', async () => {
    const { controller, admin } = build({
      [`POST specialists/${SPECIALIST}/models/${MODEL}/reactivate`]: model(),
    });
    await controller.reactivateModel(MODEL);
    expect(
      calls(
        admin,
        'POST',
        `specialists/${SPECIALIST}/models/${MODEL}/reactivate`,
      ),
    ).toHaveLength(1);
  });

  it('revisar un resultado reenvía solo la decisión y la nota', async () => {
    const { controller, admin } = build({
      [`POST verifications/${VERIFICATION}/review`]: verification(),
    });
    await controller.review(VERIFICATION, {
      decision: 'APPROVED',
      note: 'Pago confirmado en el banco',
    });
    const [post] = calls(admin, 'POST', `verifications/${VERIFICATION}/review`);
    expect(post[2]?.body).toEqual({
      decision: 'APPROVED',
      note: 'Pago confirmado en el banco',
    });
  });
});

describe('ConduitSpecialistController: validación de los cuerpos', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const check = (body: unknown, metatype: unknown) =>
    pipe.transform(body, { type: 'body', metatype: metatype as never });

  it.each(['OFF', 'SHADOW', 'ACTIVE'])('acepta el modo %s', async (mode) => {
    await expect(check({ mode }, SetVerificationModeDto)).resolves.toEqual({
      mode,
    });
  });

  it.each([{ mode: 'on' }, { mode: '' }, {}, { mode: 'ACTIVE', extra: 1 }])(
    'rechaza %j',
    async (body) => {
      await expect(check(body, SetVerificationModeDto)).rejects.toBeDefined();
    },
  );

  it.each([
    { apiKey: 'corta' },
    { apiKey: 'x'.repeat(401) },
    {},
    { apiKey: 5 },
  ])('rechaza la clave %j', async (body) => {
    await expect(check(body, RotateModelKeyDto)).rejects.toBeDefined();
  });

  it('acepta una decisión válida con o sin nota y rechaza lo demás', async () => {
    await expect(
      check({ decision: 'REJECTED' }, ReviewVerificationDto),
    ).resolves.toEqual({ decision: 'REJECTED' });
    await expect(
      check({ decision: 'MAYBE' }, ReviewVerificationDto),
    ).rejects.toBeDefined();
    await expect(
      check(
        { decision: 'APPROVED', note: 'x'.repeat(501) },
        ReviewVerificationDto,
      ),
    ).rejects.toBeDefined();
    await expect(
      check({ decision: 'APPROVED', tenantId: 'otro' }, ReviewVerificationDto),
    ).rejects.toBeDefined();
  });
});

describe('ConduitSpecialistController: guardia estática', () => {
  it('la única llamada directa a conduit.admin es la que barre secretos', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'conduit-specialist.controller.ts'),
      'utf8',
    );
    expect(source.match(/this\.conduit\.admin\b/g) ?? []).toHaveLength(1);
    expect(source).toMatch(
      /scrubSecrets\(\s*await this\.conduit\.admin<T>\(method, path, options\)/,
    );
  });

  it('el bot sale de la configuración del servidor, nunca del cliente', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'conduit-specialist.controller.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/@Body\(\)[^)]*botId/);
    expect(source).not.toMatch(/@Param\('botId'/);
    expect(source).not.toMatch(/@Query\(/);
  });
});
