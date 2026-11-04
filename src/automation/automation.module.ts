import { AutomaticMessagesController } from './automatic-messages.controller';
import { AutomaticMessagesService } from './automatic-messages.service';
import { MarketingFrequencyModule } from '../marketing/marketing-frequency.module';
import { Module } from '@nestjs/common';
import { ReservationsModule } from '../reservations/reservations.module';
import { ConduitModule } from '../conduit/conduit.module';
import { ClientsModule } from '../clients/clients.module';
import { ClientPrivacyModule } from '../client-privacy/client-privacy.module';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';
import { ReservationTimeoutsProcessor } from './processors/reservation-timeouts.processor';
import { AutomationCommunicationsProcessor } from './processors/automation-communications.processor';
import { ReservationEventsListener } from './listeners/reservation-events.listener';
import { ScheduleReminderListener } from './listeners/schedule-reminder.listener';
import { ScheduleReactivationListener } from './listeners/schedule-reactivation.listener';
import { OperationalNotificationsListener } from './listeners/operational-notifications.listener';
import { OperationalNotificationsService } from './operational-notifications.service';
import { AutomationExecutionRepository } from './repositories/automation-execution.repository';
import { AutomationRulesRepository } from './repositories/automation-rules.repository';
import { AutomationRulesService } from './automation-rules.service';
import { AutomationRulesController } from './automation-rules.controller';
import { ReservationSweepsScheduler } from './reservation-sweeps.scheduler';

@Module({
  imports: [
    ReservationsModule,
    ConduitModule,
    ClientsModule,
    ClientPrivacyModule,
    AdminNotificationsModule,
    MarketingFrequencyModule,
  ],
  controllers: [AutomationRulesController, AutomaticMessagesController],
  providers: [
    AutomaticMessagesService,
    ReservationTimeoutsProcessor,
    AutomationCommunicationsProcessor,
    ReservationEventsListener,
    ScheduleReminderListener,
    ScheduleReactivationListener,
    OperationalNotificationsListener,
    OperationalNotificationsService,
    AutomationExecutionRepository,
    AutomationRulesRepository,
    AutomationRulesService,
    ReservationSweepsScheduler,
  ],
})
export class AutomationModule {}
