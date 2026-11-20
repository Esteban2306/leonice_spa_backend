import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/errors/app.exception';
import {
  ConduitAdminError,
  ConduitApiClient,
} from '../client/conduit-api.client';
import type { AdminQuery } from '../client/conduit-api.client';
import {
  maskSecrets,
  scrubSecrets,
} from '../../common/conduit-security/redact-secrets';
import { toPublicAiModel } from './ai-model-public';
import {
  BindingSummary,
  SpecialistSummary,
  VERIFICATION_CAPABILITY,
  VerificationMode,
  VERIFICATION_SPECIALIST_KEY,
  VerificationStatus,
  buildStatus,
  findBinding,
  listOf,
  toSpecialistSummary,
} from './conduit-specialist-status';
import {
  ReviewVerificationDto,
  RotateModelKeyDto,
  SetVerificationModeDto,
  SetupHairPhotoDto,
} from './conduit-specialist.dto';
import {
  HAIR_CAPABILITY,
  HAIR_SPECIALIST_DEFINITION,
  HAIR_SPECIALIST_KEY,
  HAIR_SPECIALIST_MODELS,
} from '../specialists/hair-photo-specialist';
import { HairPhotoStatus, buildHairPhotoStatus } from './hair-photo-status';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    isRecord(inner)
      ? Object.fromEntries(
          Object.keys(inner)
            .sort()
            .map((k) => [k, inner[k]]),
        )
      : inner,
  );
}

const RECENT_LIMIT = 10;
const PENDING_LIMIT = 50;
const DEFAULT_TIMEOUT_MS = 12000;

interface Resolved {
  specialist: SpecialistSummary | null;
  binding: BindingSummary | null;
}

@Controller({ path: 'admin/conduit/specialist', version: '1' })
export class ConduitSpecialistController {
  constructor(
    private readonly conduit: ConduitApiClient,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async status(): Promise<VerificationStatus> {
    const botId = this.botId();
    let partial = false;

    const [bot, bindings] = await Promise.all([
      this.call<Record<string, unknown>>('GET', `bot/config/${botId}`),
      this.call('GET', `bots/${botId}/specialists`),
    ]);

    const optional = async <T>(run: () => Promise<T>, fallback: T) => {
      try {
        return await run();
      } catch {
        partial = true;
        return fallback;
      }
    };

    const resolved = await this.resolve(bindings);
    const [runtime, models, recent, pending] = await Promise.all([
      optional(
        () =>
          this.call<{ enabled?: unknown }>('GET', 'specialists/runtime').then(
            (r) => (typeof r?.enabled === 'boolean' ? r.enabled : null),
          ),
        null as boolean | null,
      ),
      resolved.specialist
        ? optional(
            () =>
              this.call('GET', `specialists/${resolved.specialist!.id}/models`),
            [] as unknown,
          )
        : Promise.resolve([] as unknown),
      optional(
        () =>
          this.call('GET', 'verifications', {
            query: {
              botConfigId: botId,
              capability: VERIFICATION_CAPABILITY,
              limit: RECENT_LIMIT,
            },
          }),
        [] as unknown,
      ),
      optional(
        () =>
          this.call('GET', 'verifications', {
            query: {
              botConfigId: botId,
              capability: VERIFICATION_CAPABILITY,
              pendingReview: 'true',
              limit: PENDING_LIMIT,
            },
          }),
        [] as unknown,
      ),
    ]);

    return buildStatus({
      runtimeEnabled: runtime,
      imageAnalysisEnabled: bot?.imageAnalysisEnabled === true,
      specialist: resolved.specialist,
      binding: resolved.binding,
      rawModels: models,
      rawRecent: recent,
      pendingReview: listOf(pending).length,
      partial,
    });
  }

  @Put('binding')
  async setMode(@Body() body: SetVerificationModeDto) {
    const botId = this.botId();
    const resolved = await this.resolve(
      await this.call('GET', `bots/${botId}/specialists`),
    );
    if (!resolved.specialist) {
      throw new AppException('NOT_FOUND', {
        message:
          'El especialista de comprobantes no existe todavía. Créalo con la semilla de Conduit.',
      });
    }
    return this.call(
      'PUT',
      `bots/${botId}/specialists/${VERIFICATION_CAPABILITY}`,
      {
        body: {
          specialistId: resolved.specialist.id,
          mode: body.mode,
          timeoutMs: resolved.binding?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          onFailure: resolved.binding?.onFailure ?? 'DEGRADE',
          ...(resolved.binding?.blockMessage
            ? { blockMessage: resolved.binding.blockMessage }
            : {}),
        },
      },
    );
  }

  @Patch('models/:modelId/key')
  async rotateKey(
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Body() body: RotateModelKeyDto,
  ) {
    const specialist = await this.requireSpecialist();
    return toPublicAiModel(
      await this.call(
        'PATCH',
        `specialists/${specialist.id}/models/${modelId}`,
        { body: { apiKey: body.apiKey } },
      ),
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('models/:modelId/reactivate')
  async reactivateModel(@Param('modelId', ParseUUIDPipe) modelId: string) {
    const specialist = await this.requireSpecialist();
    return toPublicAiModel(
      await this.call(
        'POST',
        `specialists/${specialist.id}/models/${modelId}/reactivate`,
      ),
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('verifications/:id/review')
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReviewVerificationDto,
  ) {
    return this.call('POST', `verifications/${id}/review`, {
      body: { decision: body.decision, note: body.note },
    });
  }

  @Get('hair-photo')
  async hairPhotoStatus(): Promise<HairPhotoStatus> {
    const botId = this.botId();
    const [bot, bindings, specialist] = await Promise.all([
      this.call<Record<string, unknown>>('GET', `bot/config/${botId}`),
      this.call('GET', `bots/${botId}/specialists`),
      this.hairSpecialist(),
    ]);
    let partial = false;
    const optional = async (run: () => Promise<unknown>) => {
      try {
        return await run();
      } catch {
        partial = true;
        return [];
      }
    };
    const [models, recent] = specialist
      ? await Promise.all([
          optional(() =>
            this.call('GET', `specialists/${specialist.id}/models`),
          ),
          optional(() =>
            this.call('GET', 'verifications', {
              query: {
                botConfigId: botId,
                capability: HAIR_CAPABILITY,
                limit: RECENT_LIMIT,
              },
            }),
          ),
        ])
      : [[], []];
    return buildHairPhotoStatus({
      imageAnalysisEnabled: bot?.imageAnalysisEnabled === true,
      specialist,
      bindings,
      rawModels: models,
      rawRecent: recent,
      partial,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('hair-photo/setup')
  async setupHairPhoto(
    @Body() body: SetupHairPhotoDto,
  ): Promise<HairPhotoStatus> {
    let specialist = await this.hairSpecialist();
    if (!specialist) {
      const created = toSpecialistSummary(
        await this.call('POST', 'specialists', {
          body: {
            key: HAIR_SPECIALIST_KEY,
            capability: HAIR_CAPABILITY,
            ...HAIR_SPECIALIST_DEFINITION,
          },
        }),
      );
      if (!created) throw new AppException('CONDUIT_UNAVAILABLE');
      specialist = created;
    } else {
      await this.ensureHairDefinition(specialist.id);
    }
    if (specialist.status !== 'ACTIVE') {
      await this.call('PATCH', `specialists/${specialist.id}`, {
        body: { status: 'ACTIVE' },
      });
    }

    const existing = listOf(
      await this.call('GET', `specialists/${specialist.id}/models`),
    );
    for (const wanted of HAIR_SPECIALIST_MODELS) {
      const current = existing.find(
        (m): m is { id: string } =>
          typeof m === 'object' &&
          m !== null &&
          (m as Record<string, unknown>).role === wanted.role &&
          typeof (m as Record<string, unknown>).id === 'string',
      );
      if (current) {
        await this.call(
          'PATCH',
          `specialists/${specialist.id}/models/${current.id}`,
          { body: { apiKey: body.apiKey } },
        );
      } else {
        await this.call('POST', `specialists/${specialist.id}/models`, {
          body: {
            provider: 'ANTHROPIC',
            model: wanted.model,
            apiKey: body.apiKey,
            role: wanted.role,
            tier: 'PAID',
            priority: wanted.priority,
          },
        });
      }
    }

    await this.bindHairPhoto(specialist.id, body.mode ?? 'SHADOW');
    return this.hairPhotoStatus();
  }

  @Put('hair-photo/binding')
  async setHairPhotoMode(@Body() body: SetVerificationModeDto) {
    const specialist = await this.hairSpecialist();
    if (!specialist) {
      throw new AppException('NOT_FOUND', {
        message:
          'El especialista de fotos del cabello no existe todavía: actívalo con tu clave.',
      });
    }
    if (body.mode !== 'OFF') await this.ensureHairDefinition(specialist.id);
    return this.bindHairPhoto(specialist.id, body.mode);
  }

  @Patch('hair-photo/models/:modelId/key')
  async rotateHairPhotoKey(
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Body() body: RotateModelKeyDto,
  ) {
    const specialist = await this.requireHairSpecialist();
    return toPublicAiModel(
      await this.call(
        'PATCH',
        `specialists/${specialist.id}/models/${modelId}`,
        { body: { apiKey: body.apiKey } },
      ),
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('hair-photo/models/:modelId/reactivate')
  async reactivateHairPhotoModel(
    @Param('modelId', ParseUUIDPipe) modelId: string,
  ) {
    const specialist = await this.requireHairSpecialist();
    return toPublicAiModel(
      await this.call(
        'POST',
        `specialists/${specialist.id}/models/${modelId}/reactivate`,
      ),
    );
  }

  private bindHairPhoto(specialistId: string, mode: VerificationMode) {
    return this.call(
      'PUT',
      `bots/${this.botId()}/specialists/${HAIR_CAPABILITY}`,
      {
        body: {
          specialistId,
          mode,
          timeoutMs: DEFAULT_TIMEOUT_MS,
          onFailure: 'DEGRADE',
        },
      },
    );
  }

  private async ensureHairDefinition(specialistId: string): Promise<void> {
    const current = await this.call<Record<string, unknown>>(
      'GET',
      `specialists/${specialistId}`,
    );
    const wanted = HAIR_SPECIALIST_DEFINITION;
    const rules = isRecord(current?.rules) ? current.rules.rules : undefined;
    const untouched =
      !Array.isArray(rules) ||
      rules.length === 0 ||
      canonical(current?.rules) === canonical(wanted.rules);
    if (!untouched) return;
    if (
      current?.promptTemplate === wanted.promptTemplate &&
      canonical(current?.outputSchema) === canonical(wanted.outputSchema) &&
      canonical(current?.rules) === canonical(wanted.rules)
    ) {
      return;
    }
    await this.call('PATCH', `specialists/${specialistId}`, {
      body: {
        promptTemplate: wanted.promptTemplate,
        outputSchema: wanted.outputSchema,
        rules: wanted.rules,
        changeNote: 'Vista previa del cabello y regla es_cabello',
      },
    });
  }

  private hairSpecialist(): Promise<SpecialistSummary | null> {
    return this.call('GET', `specialists/by-key/${HAIR_SPECIALIST_KEY}`)
      .then(toSpecialistSummary)
      .catch((error: unknown) => {
        if (error instanceof AppException && error.code === 'NOT_FOUND') {
          return null;
        }
        throw error;
      });
  }

  private async requireHairSpecialist(): Promise<SpecialistSummary> {
    const specialist = await this.hairSpecialist();
    if (!specialist) {
      throw new AppException('NOT_FOUND', {
        message: 'El especialista de fotos del cabello no existe todavía.',
      });
    }
    return specialist;
  }

  private async requireSpecialist(): Promise<SpecialistSummary> {
    const resolved = await this.resolve(
      await this.call('GET', `bots/${this.botId()}/specialists`),
    );
    if (!resolved.specialist) {
      throw new AppException('NOT_FOUND', {
        message: 'El especialista de comprobantes no existe todavía.',
      });
    }
    return resolved.specialist;
  }

  private async resolve(bindings: unknown): Promise<Resolved> {
    const found = findBinding(bindings);
    if (found?.specialist) {
      const full = await this.call(
        'GET',
        `specialists/${found.specialist.id}`,
      ).catch(() => null);
      return {
        binding: found.binding,
        specialist: toSpecialistSummary(full) ?? found.specialist,
      };
    }
    const byKey = await this.call(
      'GET',
      `specialists/by-key/${VERIFICATION_SPECIALIST_KEY}`,
    ).catch(() => null);
    return {
      binding: found?.binding ?? null,
      specialist: toSpecialistSummary(byKey),
    };
  }

  private async call<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options: { query?: AdminQuery; body?: unknown } = {},
  ): Promise<T> {
    try {
      return scrubSecrets(await this.conduit.admin<T>(method, path, options));
    } catch (error) {
      throw this.translate(error);
    }
  }

  private translate(error: unknown): AppException {
    if (!(error instanceof ConduitAdminError)) {
      return new AppException('CONDUIT_UNAVAILABLE');
    }
    if (error.status === null || error.status >= 500) {
      return new AppException('CONDUIT_UNAVAILABLE', {
        details: { conduitMessage: maskSecrets(error.message) },
      });
    }
    if (error.status === 401 || error.status === 403) {
      return new AppException('CONDUIT_NOT_CONFIGURED', {
        details: { conduitStatus: error.status },
      });
    }
    if (error.status === 404) {
      return new AppException('NOT_FOUND', {
        message: maskSecrets(error.message),
      });
    }
    return new AppException('CONDUIT_REQUEST_REJECTED', {
      message: maskSecrets(error.message),
      details: { conduitStatus: error.status },
    });
  }

  private botId(): string {
    const value = this.config.get<string>('CONDUIT_DEFAULT_BOT_ID');
    if (!value || !/^[0-9a-f-]{36}$/i.test(value)) {
      throw new AppException('CONDUIT_NOT_CONFIGURED', {
        details: { missing: 'CONDUIT_DEFAULT_BOT_ID' },
      });
    }
    return value;
  }
}
