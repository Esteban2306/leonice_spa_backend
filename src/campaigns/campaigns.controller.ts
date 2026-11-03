import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import {
  CreateCampaignDto,
  EstimateCampaignDto,
  ListCampaignRecipientsQueryDto,
  UpdateCampaignSettingsDto,
} from './dto/campaign.dto';

@Controller({ path: 'campaigns', version: '1' })
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get('templates')
  templates() {
    return this.campaigns.listTemplates();
  }

  @Get('settings')
  settings() {
    return this.campaigns.getSettings();
  }

  @Put('settings')
  updateSettings(@Body() dto: UpdateCampaignSettingsDto) {
    return this.campaigns.updateSettings(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('estimate')
  estimate(@Body() dto: EstimateCampaignDto) {
    return this.campaigns.estimate(dto);
  }

  @Post()
  create(@Body() dto: CreateCampaignDto) {
    return this.campaigns.create(dto);
  }

  @Get()
  list() {
    return this.campaigns.list();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.get(id);
  }

  @Get(':id/recipients')
  recipients(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListCampaignRecipientsQueryDto,
  ) {
    return this.campaigns.recipients(id, query);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/pause')
  pause(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.pause(id, 'Pausada por el equipo');
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/resume')
  resume(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.resume(id);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.cancel(id);
  }
}
