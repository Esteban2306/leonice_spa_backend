import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
export class MonitoringInterceptor implements NestInterceptor {
  constructor(private readonly monitoring: MonitoringService) {}

  intercept<T>(context: ExecutionContext, next: CallHandler<T>): Observable<T> {
    const req: Request = context.switchToHttp().getRequest<Request>();
    const method = req.method;
    const path = req.path;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - start;
          const res: Response = context.switchToHttp().getResponse();
          this.monitoring.incrementHttpRequests(method, path, res.statusCode);
          this.monitoring.observeRequestDuration(method, path, duration);
        },
        error: (err: unknown) => {
          const duration = Date.now() - start;
          const status: number = this.getErrorStatus(err);
          this.monitoring.incrementHttpRequests(method, path, status);
          this.monitoring.observeRequestDuration(method, path, duration);
        },
      }),
    );
  }

  private getErrorStatus(error: unknown): number {
    if (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof (error as { status?: number }).status === 'number'
    ) {
      return (error as { status: number }).status;
    }

    return 500;
  }
}
