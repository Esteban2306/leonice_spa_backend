import { Body, Controller, Get, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { BusinessSettingsService } from './business-settings.service';
import { UpdateBusinessSettingsDto } from './dto/update-business-settings.dto';

@Controller({ path: 'business-settings', version: '1' })
export class BusinessSettingsController {
  constructor(private readonly service: BusinessSettingsService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @Put()
  update(
    @Body() dto: UpdateBusinessSettingsDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.service.update(dto, user?.id);
  }
}
