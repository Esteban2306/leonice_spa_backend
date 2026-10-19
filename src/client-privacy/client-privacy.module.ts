import { Module } from '@nestjs/common';
import { ReservationsModule } from '../reservations/reservations.module';
import { ClientAnonymizationService } from './client-anonymization.service';
import { ClientPrivacyController } from './client-privacy.controller';
import { ClientRetentionScheduler } from './client-retention.scheduler';
import { ClientRetentionService } from './client-retention.service';

@Module({
  imports: [ReservationsModule],
  controllers: [ClientPrivacyController],
  providers: [
    ClientAnonymizationService,
    ClientRetentionService,
    ClientRetentionScheduler,
  ],
  exports: [ClientRetentionService, ClientAnonymizationService],
})
export class ClientPrivacyModule {}
