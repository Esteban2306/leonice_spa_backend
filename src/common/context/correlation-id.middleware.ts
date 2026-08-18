import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { RequestContextService } from './request-context.service';

const CORRELATION_ID_HEADER = 'x-correlation-id';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  constructor(private readonly context: RequestContextService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.headers[CORRELATION_ID_HEADER];
    const correlationId =
      typeof incoming === 'string' ? incoming : randomUUID();

    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    this.context.run({ correlationId, startTime: Date.now() }, () => next());
  }
}
