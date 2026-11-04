import { Controller, Get, Query } from '@nestjs/common';
import { AutomaticMessagesService } from './automatic-messages.service';
import { ListAutomaticMessagesQueryDto } from './dto/list-automatic-messages-query.dto';

@Controller({ path: 'automatic-messages', version: '1' })
export class AutomaticMessagesController {
  constructor(private readonly service: AutomaticMessagesService) {}

  @Get()
  list(@Query() query: ListAutomaticMessagesQueryDto) {
    return this.service.list(query);
  }
}
