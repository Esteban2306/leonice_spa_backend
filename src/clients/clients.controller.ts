import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ClientsService } from './clients.service';
import { ClientTagsService } from './tags/client-tags.service';
import { ResolveClientDto } from './dto/resolve-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { FindClientsQueryDto } from './dto/find-clients-query.dto';
import { SetHairProfileDto } from './dto/set-hair-profile.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { RecordConsentDto } from './dto/record-consent.dto';
import { FindPendingHairProfilesQueryDto } from './dto/find-pending-hair-profiles-query.dto';

@Controller({ path: 'clients', version: '1' })
export class ClientsController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly clientTags: ClientTagsService,
  ) {}

  @Post('resolve')
  async resolve(@Body() dto: ResolveClientDto) {
    const client = await this.clientsService.resolveOrCreateForBooking(dto, {
      trustedIdentity: true,
    });
    return {
      id: client.id,
      name: client.name,
      hasHairProfile: Boolean(client.hairLength && client.hairColor),
    };
  }

  @Post()
  async create(@Body() dto: CreateClientDto) {
    return this.clientsService.createByAdmin(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/consents')
  async recordConsent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordConsentDto,
  ) {
    return this.clientsService.recordConsent(id, dto);
  }

  @Get()
  async search(@Query() query: FindClientsQueryDto) {
    return this.clientsService.search(
      query.q,
      query.page,
      query.pageSize,
      query.tags,
    );
  }

  @Get('tags/catalog')
  async tagCatalog() {
    return this.clientTags.catalog();
  }

  @HttpCode(HttpStatus.OK)
  @Post('tags/refresh')
  async refreshTags() {
    return this.clientTags.refreshAll();
  }

  @Get('hair-profiles/pending')
  async findPendingHairProfiles(
    @Query() query: FindPendingHairProfilesQueryDto,
  ) {
    return this.clientsService.findPendingHairProfiles(
      query.page,
      query.pageSize,
    );
  }

  @Put(':id/hair-profile')
  async setHairProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetHairProfileDto,
  ) {
    return this.clientsService.setHairProfile(id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/hair-profile/confirm')
  async confirmHairProfile(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.confirmHairProfile(id);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.getDetail(id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clientsService.update(id, dto);
  }
}
