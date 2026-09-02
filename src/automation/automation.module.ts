// automation.module.ts — completo, con todo lo de hoy
import { Module } from '@nestjs/common';
import { ReservationsModule } from '../reservations/reservations.module';
import { ConduitModule } from '../conduit/conduit.module';
import { ClientsModule } from '../clients/clients.module';
import { ReservationTimeoutsProcessor } from './processors/reservation-timeouts.processor';
import { AutomationCommunicationsProcessor } from './processors/automation-communications.processor';
import { ReservationEventsListener } from './listeners/reservation-events.listener';
import { ScheduleReminderListener } from './listeners/schedule-reminder.listener';
import { ScheduleReactivationListener } from './listeners/schedule-reactivation.listener';
import { AutomationExecutionRepository } from './repositories/automation-execution.repository';
import { AutomationRulesRepository } from './repositories/automation-rules.repository';
import { AutomationRulesService } from './automation-rules.service';
import { AutomationRulesController } from './automation-rules.controller';

@Module({
  imports: [ReservationsModule, ConduitModule, ClientsModule],
  controllers: [AutomationRulesController],
  providers: [
    ReservationTimeoutsProcessor,
    AutomationCommunicationsProcessor,
    ReservationEventsListener,
    ScheduleReminderListener,
    ScheduleReactivationListener,
    AutomationExecutionRepository,
    AutomationRulesRepository,
    AutomationRulesService,
  ],
})
export class AutomationModule {}
