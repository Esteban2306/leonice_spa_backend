import { Module } from '@nestjs/common';
import { ReservationsModule } from '../reservations/reservations.module';
import { AdminDashboardController } from './dashboard/admin-dashboard.controller';
import { AdminDashboardService } from './dashboard/admin-dashboard.service';
import { AdminCalendarController } from './calendar/admin-calendar.controller';
import { AdminCalendarService } from './calendar/admin-calendar.service';

@Module({
  imports: [ReservationsModule],

  controllers: [AdminDashboardController, AdminCalendarController],

  providers: [AdminDashboardService, AdminCalendarService],
})
export class AdminModule {}
