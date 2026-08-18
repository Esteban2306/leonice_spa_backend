import { Global, Module } from '@nestjs/common';
import { RequestContextService } from './request-context.service';
import { CorrelationIdMiddleware } from './correlation-id.middleware';

@Global()
@Module({
  providers: [RequestContextService, CorrelationIdMiddleware],
  exports: [RequestContextService, CorrelationIdMiddleware],
})
export class ContextModule {}
