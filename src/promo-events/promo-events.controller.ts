import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PromoEventsService } from './promo-events.service';
import {
  CreatePromoEventDto,
  DrawPrizeDto,
  UpdatePromoEventDto,
} from './dto/promo-event.dto';

@Controller({ path: 'promo-events', version: '1' })
export class PromoEventsController {
  constructor(private readonly service: PromoEventsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  create(@Body() dto: CreatePromoEventDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePromoEventDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  @Get(':id/tickets')
  tickets(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.tickets(id);
  }

  @Post(':id/draw')
  draw(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DrawPrizeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.draw(id, dto.prize, user.id);
  }
}
