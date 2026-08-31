import { Module } from '@nestjs/common';
import { ReservationsModule } from '../reservations/reservations.module';
import { ReservationTimeoutsProcessor } from './processors/reservation-timeouts.processor';
import { ReservationEventsListener } from './listeners/reservation-events.listener';

@Module({
  imports: [ReservationsModule],
  providers: [ReservationTimeoutsProcessor, ReservationEventsListener],
})
export class AutomationModule {}
