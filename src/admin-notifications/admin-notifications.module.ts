import { Module } from '@nestjs/common';
import { AdminNotificationRecipientsController } from './admin-notification-recipients.controller';
import { AdminNotificationRecipientsService } from './admin-notification-recipients.service';
import { AdminNotificationRecipientsRepository } from './repository/admin-notification-recipients.repository';

@Module({
  controllers: [AdminNotificationRecipientsController],
  providers: [
    AdminNotificationRecipientsService,
    AdminNotificationRecipientsRepository,
  ],
  exports: [AdminNotificationRecipientsRepository],
})
export class AdminNotificationsModule {}
