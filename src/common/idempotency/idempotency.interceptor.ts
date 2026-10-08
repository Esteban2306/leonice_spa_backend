import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AppException } from '../errors/app.exception';
import {
  IDEMPOTENCY_KEY_PATTERN,
  fingerprintRequest,
  idempotencyStoreKey,
} from './idempotency-decision';
import { IdempotencyService } from './idempotency.service';

export const IDEMPOTENCY_HEADERS = [
  'idempotency-key',
  'x-conduit-idempotency-key',
] as const;
export const IDEMPOTENT_REPLAY_HEADER = 'Idempotent-Replayed';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function readKey(req: Request): string | undefined {
  for (const header of IDEMPOTENCY_HEADERS) {
    const value = req.headers[header];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotencyService: IdempotencyService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    if (!MUTATING_METHODS.has(req.method)) return next.handle();
    const key = readKey(req);
    if (key === undefined) return next.handle();
    if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
      throw new AppException('IDEMPOTENCY_KEY_INVALID');
    }

    const route =
      (req.route as { path?: string } | undefined)?.path ?? req.path;
    const actor = (req.user as { id?: string } | undefined)?.id ?? 'anonymous';
    const storeKey = idempotencyStoreKey({
      method: req.method,
      route,
      actor,
      key,
    });
    const fingerprint = fingerprintRequest({
      params: req.params,
      query: req.query,
      body: req.body as unknown,
    });

    const decision = await this.idempotencyService.begin(storeKey, fingerprint);
    if (decision.kind === 'REJECT') throw new AppException(decision.code);
    if (decision.kind === 'REPLAY') {
      res.status(decision.statusCode);
      res.setHeader(IDEMPOTENT_REPLAY_HEADER, 'true');
      return of(decision.body);
    }

    return next.handle().pipe(
      tap({
        next: (body: unknown) => {
          void this.idempotencyService.complete(
            storeKey,
            fingerprint,
            res.statusCode,
            body,
          );
        },
        error: () => {
          void this.idempotencyService.abandon(storeKey);
        },
      }),
    );
  }
}
