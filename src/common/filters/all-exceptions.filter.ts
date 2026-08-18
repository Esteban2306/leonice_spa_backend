import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { RequestContextService } from '../context/request-context.service';

@Catch()
export class AllExceptionsFilter {
  private readonly logger = new Logger('ExceptionsFilter');

  constructor(private readonly requestContext: RequestContextService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = isHttpException
      ? exception.getResponse()
      : 'Error interno del servidor';

    const correlationId = this.requestContext.getCorrelationId();

    const logLine = `${request.method} ${request.originalUrl} → ${status}`;
    if (status >= 500) {
      this.logger.error(
        logLine,
        exception instanceof Error ? exception.stack : String(exception),
        'ExceptionsFilter',
      );
    } else {
      this.logger.warn(logLine, 'ExceptionsFilter');
    }
    response.status(status).json({
      statusCode: status,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    });
  }
}
