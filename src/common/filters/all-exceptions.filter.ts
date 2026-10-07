import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { RequestContextService } from '../context/request-context.service';
import {
  normalizeException,
  type ErrorResponseBody,
} from '../errors/normalize-exception';

/**
 * Único punto de salida de errores HTTP. Toda excepción se normaliza al
 * contrato de `ErrorResponseBody` (code del catálogo + correlationId) y se
 * registra una sola vez: 5xx con stack, 4xx como advertencia con su code.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionsFilter');

  constructor(private readonly requestContext: RequestContextService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const normalized = normalizeException(exception);
    const correlationId = this.requestContext.getCorrelationId();

    const logLine = `${request.method} ${request.originalUrl} → ${normalized.status} ${normalized.code}`;
    if (normalized.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        logLine,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${logLine}: ${normalized.message}`);
    }

    const body: ErrorResponseBody = {
      statusCode: normalized.status,
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details ? { details: normalized.details } : {}),
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    };
    response.status(normalized.status).json(body);
  }
}
