import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { RequestContextService } from './request-context.service';
import { CorrelationIdMiddleware } from './correlation-id.middleware';

@Global()
@Module({
  providers: [RequestContextService, CorrelationIdMiddleware],
  exports: [RequestContextService, CorrelationIdMiddleware],
})
export class ContextModule implements NestModule {
  // Sin esto el middleware nunca corría y todo quedaba como "sin-correlacion".
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('{*splat}');
  }
}
