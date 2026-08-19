import { Module } from '@nestjs/common';
import { ConduitApiClient } from './client/conduit-api.client';

@Module({
  providers: [ConduitApiClient],
  exports: [ConduitApiClient],
})
export class ConduitModule {}
