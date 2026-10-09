import { Module } from '@nestjs/common';
import { ReservationsModule } from '../reservations/reservations.module';
import { AdminDashboardController } from './dashboard/admin-dashboard.controller';
import { AdminDashboardService } from './dashboard/admin-dashboard.service';
import { AdminCalendarController } from './calendar/admin-calendar.controller';
import { AdminCalendarService } from './calendar/admin-calendar.service';
import { AdminScheduleController } from './schedule/admin-schedule.controller';
import { AdminScheduleService } from './schedule/admin-schedule.service';
import { AdminReportsController } from './reports/admin-reports.controller';
import { AdminReportsRepository } from './reports/admin-reports.repository';
import { AdminReportsService } from './reports/admin-reports.service';
import { ClientsModule } from '../clients/clients.module';

@Module({
  imports: [ReservationsModule, ClientsModule],

  controllers: [
    AdminDashboardController,
    AdminCalendarController,
    AdminScheduleController,
    AdminReportsController,
  ],

  providers: [
    AdminDashboardService,
    AdminCalendarService,
    AdminScheduleService,
    AdminReportsService,
    AdminReportsRepository,
  ],
})
export class AdminModule {}
