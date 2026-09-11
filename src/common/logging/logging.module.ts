import { Global, Module } from '@nestjs/common';
import { StructuredLoggerService } from './structured-logger.service';
import { ContextModule } from '../context/context.module';
import { PinoLoggerService } from './pino-logger.service';

@Global()
@Module({
  imports: [ContextModule],
  providers: [PinoLoggerService, StructuredLoggerService],
  exports: [StructuredLoggerService, PinoLoggerService],
})
export class LoggingModule {}
