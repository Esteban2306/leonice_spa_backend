import { Module } from '@nestjs/common';
import { ReservationsModule } from '../reservations/reservations.module';
import { AdminDashboardController } from './dashboard/admin-dashboard.controller';
import { AdminDashboardService } from './dashboard/admin-dashboard.service';
import { AdminCalendarController } from './calendar/admin-calendar.controller';
import { AdminCalendarService } from './calendar/admin-calendar.service';
import { AdminScheduleController } from './schedule/admin-schedule.controller';
import { AdminScheduleService } from './schedule/admin-schedule.service';

@Module({
  imports: [ReservationsModule],

  controllers: [
    AdminDashboardController,
    AdminCalendarController,
    AdminScheduleController,
  ],

  providers: [
    AdminDashboardService,
    AdminCalendarService,
    AdminScheduleService,
  ],
})
export class AdminModule {}
