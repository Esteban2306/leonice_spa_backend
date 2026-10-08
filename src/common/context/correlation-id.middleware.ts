import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { RequestContextService } from './request-context.service';

const CORRELATION_ID_HEADER = 'x-correlation-id';
const SAFE_CORRELATION_ID = /^[A-Za-z0-9._-]{8,64}$/;

export function resolveCorrelationId(incoming: unknown): string {
  return typeof incoming === 'string' && SAFE_CORRELATION_ID.test(incoming)
    ? incoming
    : randomUUID();
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  constructor(private readonly context: RequestContextService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const correlationId = resolveCorrelationId(
      req.headers[CORRELATION_ID_HEADER],
    );

    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    this.context.run({ correlationId, startTime: Date.now() }, () => next());
  }
}
