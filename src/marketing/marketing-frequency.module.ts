import { Module } from '@nestjs/common';
import { MarketingFrequencyService } from './marketing-frequency.service';

@Module({
  providers: [MarketingFrequencyService],
  exports: [MarketingFrequencyService],
})
export class MarketingFrequencyModule {}
