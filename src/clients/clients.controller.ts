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
import { Throttle } from '@nestjs/throttler';
import { ClientsService } from './clients.service';
import { ResolveClientDto } from './dto/resolve-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Public } from '../auth/decorators/public.decorator';
import { FindClientsQueryDto } from './dto/find-clients-query.dto';
import { SetHairProfileDto } from './dto/set-hair-profile.dto';
import { FindPendingHairProfilesQueryDto } from './dto/find-pending-hair-profiles-query.dto';

@Controller({ path: 'clients', version: '1' })
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('resolve')
  async resolve(@Body() dto: ResolveClientDto) {
    const client = await this.clientsService.resolveOrCreateForBooking(dto);
    return {
      id: client.id,
      name: client.name,
      hasHairProfile: Boolean(client.hairLength && client.hairColor),
    };
  }

  @Get()
  async search(@Query() query: FindClientsQueryDto) {
    return this.clientsService.search(query.q, query.page, query.pageSize);
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
  async findOne(@Param('id') id: string) {
    return this.clientsService.getDetail(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.clientsService.update(id, dto);
  }
}
