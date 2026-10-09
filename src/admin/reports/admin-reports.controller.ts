import { Controller, Get, Query } from '@nestjs/common';
import { AdminReportsService } from './admin-reports.service';
import { FindDailyReportQueryDto } from './dto/find-daily-report-query.dto';

@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly adminReportsService: AdminReportsService) {}

  @Get('daily')
  getDailyReport(@Query() query: FindDailyReportQueryDto) {
    return this.adminReportsService.getDailyReport(query.date);
  }
}
