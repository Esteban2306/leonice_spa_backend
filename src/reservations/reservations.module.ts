import { Module } from '@nestjs/common';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { AvailabilityRepository } from './repositories/availability.repository';
import { ReservationsRepository } from './repositories/reservations.repository';
import { CreateReservationOrchestrator } from './orchestrators/create-reservation.orchestrator';
import { CancelReservationOrchestrator } from './orchestrators/cancel-reservation.orchestrator';
import { RescheduleReservationOrchestrator } from './orchestrators/reschedule-reservation.orchestrator';
import { CheckInReservationOrchestrator } from './orchestrators/check-in-reservation.orchestrator';
import { CompleteReservationOrchestrator } from './orchestrators/complete-reservation.orchestrator';
import { ConfirmDepositOrchestrator } from './orchestrators/confirm-deposit.orchestrator';
import { MarkNoShowOrchestrator } from './orchestrators/mark-no-show.orchestrator';
import { ClientsModule } from '../clients/clients.module';
import { ConfirmValoracionOrchestrator } from './orchestrators/confirm-valoracion.orchestrator';
import { AdminRescheduleReservationOrchestrator } from './orchestrators/admin-reservartion.orchestator';
import { AdminCancelReservationOrchestrator } from './orchestrators/admin-cancel-reservation.orchestrator';

@Module({
  imports: [ClientsModule],
  controllers: [ReservationsController],
  providers: [
    ReservationsService,
    AvailabilityRepository,
    ReservationsRepository,
    CreateReservationOrchestrator,
    CancelReservationOrchestrator,
    RescheduleReservationOrchestrator,
    CheckInReservationOrchestrator,
    CompleteReservationOrchestrator,
    AdminRescheduleReservationOrchestrator,
    ConfirmDepositOrchestrator,
    ConfirmValoracionOrchestrator,
    MarkNoShowOrchestrator,
    AdminCancelReservationOrchestrator,
  ],
  exports: [
    AvailabilityRepository,
    ReservationsRepository,
    CancelReservationOrchestrator,
    MarkNoShowOrchestrator,
  ],
})
export class ReservationsModule {}
