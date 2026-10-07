import { Controller, Get, Query } from '@nestjs/common';
import { AdminCalendarService } from './admin-calendar.service';
import { FindCalendarQueryDto } from './dto/find-calendar-query.dto';

@Controller('admin/calendar')
export class AdminCalendarController {
  constructor(private readonly adminCalendarService: AdminCalendarService) {}

  @Get()
  async findByDate(@Query() query: FindCalendarQueryDto) {
    return this.adminCalendarService.findByDate(query);
  }
}
