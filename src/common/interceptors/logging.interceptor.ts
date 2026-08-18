import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { RequestContextService } from '../context/request-context.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly requestContext: RequestContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const user = req.user as { id: string } | undefined;
    if (user?.id) this.requestContext.setUserId(user.id);

    const start = Date.now();
    this.logger.log(`→ ${req.method} ${req.originalUrl}`);

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(
            `← ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`,
          );
        },
        error: () => {
          this.logger.debug(
            `✖ ${req.method} ${req.originalUrl} falló tras ${Date.now() - start}ms`,
          );
        },
      }),
    );
  }
}
