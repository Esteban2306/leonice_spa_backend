import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ClientsService } from './clients.service';
import { ResolveClientDto } from './dto/resolve-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Public } from '../auth/decorators/public.decorator';

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
  async search(@Query('q') query?: string) {
    return this.clientsService.search(query);
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
