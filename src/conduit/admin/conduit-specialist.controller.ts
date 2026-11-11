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
} from './conduit-specialist.dto';

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
            query: { botConfigId: botId, limit: RECENT_LIMIT },
          }),
        [] as unknown,
      ),
      optional(
        () =>
          this.call('GET', 'verifications', {
            query: {
              botConfigId: botId,
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
