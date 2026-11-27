import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { WaitlistController } from './waitlist.controller.js';
import { WaitlistService } from './waitlist.service.js';
import { WaitlistEventsService } from './waitlist-events.service.js';
@Module({
  imports: [AuthModule],
  controllers: [WaitlistController],
  providers: [WaitlistService, WaitlistEventsService],
  exports: [WaitlistService, WaitlistEventsService],
})
export class WaitlistModule {}
