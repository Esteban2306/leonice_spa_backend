import { Module } from '@nestjs/common';
import { ConduitApiClient } from './client/conduit-api.client';
import { HmacSignatureGuard } from './guards/hmac-signature.guard';

@Module({
  providers: [ConduitApiClient, HmacSignatureGuard],
  exports: [ConduitApiClient, HmacSignatureGuard],
})
export class ConduitModule {}
