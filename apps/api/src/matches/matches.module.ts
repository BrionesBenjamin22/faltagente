import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MatchesController } from './matches.controller.js';
import { MatchesService } from './matches.service.js';
import { MatchPublicationController } from './match-publication.controller.js';
import { MatchManagementService } from './match-management.service.js';
import { MyMatchesController } from './my-matches.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [MatchesController, MatchPublicationController, MyMatchesController],
  providers: [MatchesService, MatchManagementService],
})
export class MatchesModule {}
