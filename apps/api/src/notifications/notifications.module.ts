import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import {
  InternalNotificationsController,
  NotificationsController,
} from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { PushNotificationsService } from './push-notifications.service.js';

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController, InternalNotificationsController],
  providers: [NotificationsService, PushNotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
