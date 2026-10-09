import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AdminScheduleService } from './admin-schedule.service';
import { CreateScheduleExceptionDto } from './dto/create-schedule-exception.dto';
import { FindScheduleExceptionsQueryDto } from './dto/find-schedule-exceptions-query.dto';
import { UpdateBaseScheduleDto } from './dto/update-base-schedule.dto';

@Controller('admin/schedule')
export class AdminScheduleController {
  constructor(private readonly adminScheduleService: AdminScheduleService) {}

  @Get('base')
  getBaseSchedule() {
    return this.adminScheduleService.getBaseSchedule();
  }

  @Put('base')
  updateBaseSchedule(@Body() dto: UpdateBaseScheduleDto) {
    return this.adminScheduleService.updateBaseSchedule(dto);
  }

  @Get('exceptions')
  listExceptions(@Query() query: FindScheduleExceptionsQueryDto) {
    return this.adminScheduleService.listExceptions(query);
  }

  @Get('days/:date')
  getDay(@Param('date') date: string) {
    return this.adminScheduleService.getDay(date);
  }

  @Post('exceptions')
  createException(
    @Body() dto: CreateScheduleExceptionDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.adminScheduleService.createException(dto, user.id);
  }

  @Delete('exceptions/:id')
  deleteException(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminScheduleService.deleteException(id);
  }
}
