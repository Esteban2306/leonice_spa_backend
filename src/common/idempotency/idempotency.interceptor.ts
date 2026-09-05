import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { IdempotencyService } from './idempotency.service';

const IDEMPOTENCY_HEADER = 'x-conduit-idempotency-key';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotencyService: IdempotencyService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const key = req.headers[IDEMPOTENCY_HEADER] as string | undefined;

    if (!key) return next.handle();

    const existing = await this.idempotencyService.findExisting(key);
    if (existing) {
      res.status(existing.statusCode);
      return of(existing.body);
    }

    return next.handle().pipe(
      tap((body) => {
        void this.idempotencyService.store(key, {
          statusCode: res.statusCode,
          body,
        });
      }),
    );
  }
}
