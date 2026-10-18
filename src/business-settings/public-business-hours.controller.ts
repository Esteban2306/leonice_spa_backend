import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { BusinessSettingsService } from './business-settings.service';

@Public()
@Controller({ path: 'business-hours', version: '1' })
export class PublicBusinessHoursController {
  constructor(private readonly service: BusinessSettingsService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  get() {
    return this.service.publicHours();
  }
}
