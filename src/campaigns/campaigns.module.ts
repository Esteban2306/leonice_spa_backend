import { Module } from '@nestjs/common';
import { AudiencesModule } from '../audiences/audiences.module';
import { MarketingFrequencyModule } from '../marketing/marketing-frequency.module';
import { ConduitModule } from '../conduit/conduit.module';
import { CampaignRunnerService } from './campaign-runner.service';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [AudiencesModule, ConduitModule, MarketingFrequencyModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignRunnerService],
})
export class CampaignsModule {}
