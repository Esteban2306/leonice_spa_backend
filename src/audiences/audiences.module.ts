import { Module } from '@nestjs/common';
import { MarketingFrequencyModule } from '../marketing/marketing-frequency.module';
import { AudiencesController } from './audiences.controller';
import { AudiencesService } from './audiences.service';

@Module({
  imports: [MarketingFrequencyModule],
  controllers: [AudiencesController],
  providers: [AudiencesService],
  exports: [AudiencesService],
})
export class AudiencesModule {}
