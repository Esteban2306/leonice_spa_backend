import { Module } from '@nestjs/common';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { AvailabilityRepository } from './repositories/availability.repository';

@Module({
  controllers: [ReservationsController],
  providers: [ReservationsService, AvailabilityRepository],
  exports: [AvailabilityRepository],
})
export class ReservationsModule {}
