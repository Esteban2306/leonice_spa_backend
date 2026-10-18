import { Module } from '@nestjs/common';
import { BusinessSettingsController } from './business-settings.controller';
import { BusinessSettingsService } from './business-settings.service';
import { PublicBusinessHoursController } from './public-business-hours.controller';

@Module({
  controllers: [BusinessSettingsController, PublicBusinessHoursController],
  providers: [BusinessSettingsService],
  exports: [BusinessSettingsService],
})
export class BusinessSettingsModule {}
