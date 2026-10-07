import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { AdminNotificationRecipientsService } from './admin-notification-recipients.service';
import { CreateAdminNotificationRecipientDto } from './dto/create-admin-notification-recipient.dto';
import { UpdateAdminNotificationRecipientDto } from './dto/update-admin-notification-recipient.dto';

@Controller({ path: 'admin-notification-recipients', version: '1' })
export class AdminNotificationRecipientsController {
  constructor(private readonly service: AdminNotificationRecipientsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  create(@Body() dto: CreateAdminNotificationRecipientDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminNotificationRecipientDto,
  ) {
    return this.service.update(id, dto);
  }
}
