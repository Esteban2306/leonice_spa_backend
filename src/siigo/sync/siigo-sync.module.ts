import { Module } from '@nestjs/common';
import { SiigoModule } from '../siigo.module';
import { SiigoSyncProcessor } from './siigo-sync.processor';
import { SiigoSyncScheduler } from './siigo-sync.scheduler';
import { SiigoSyncService } from './siigo-sync.service';

@Module({
  imports: [SiigoModule],
  providers: [SiigoSyncService, SiigoSyncProcessor, SiigoSyncScheduler],
  exports: [SiigoSyncService],
})
export class SiigoSyncModule {}
