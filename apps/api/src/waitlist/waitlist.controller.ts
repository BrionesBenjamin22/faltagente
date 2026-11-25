import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { MatchIdDto } from '../matches/dto/match-id.dto.js';
import { ReservationResponse } from '../matches/reservations.module.js';
import { WaitlistService } from './waitlist.service.js';
import {
  JoinWaitlistDto,
  OrganizerWaitlistResponse,
  OwnWaitlistResponse,
  WaitlistEntryIdDto,
  WaitlistEntryResponse,
  WaitlistOfferIdDto,
  WaitlistPageDto,
} from './waitlist.dto.js';
@ApiTags('Waitlist')
@ApiExtraModels(WaitlistEntryResponse)
@Controller()
export class WaitlistController {
  constructor(
    private readonly service: WaitlistService,
    private readonly auth: AuthService,
  ) {}
  @Post('matches/:id/waitlist')
  @ApiCreatedResponse({ type: WaitlistEntryResponse })
  async join(
    @Param() p: MatchIdDto,
    @Body() dto: JoinWaitlistDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.set('Cache-Control', 'no-store');
    return this.service.join(
      await this.auth.requireUser(req),
      p.id,
      dto.places,
    );
  }
  @Get('matches/:id/waitlist/me')
  @ApiOkResponse({
    schema: {
      allOf: [{ $ref: getSchemaPath(WaitlistEntryResponse) }],
      nullable: true,
    },
  })
  async mine(
    @Param() p: MatchIdDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.set('Cache-Control', 'no-store');
    return res.json(
      await this.service.mine(await this.auth.requireUser(req), p.id),
    );
  }
  @Post('matches/:id/waitlist/:entryId/leave')
  @HttpCode(200)
  @ApiOkResponse({ type: WaitlistEntryResponse })
  async leave(
    @Param() p: WaitlistEntryIdDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.set('Cache-Control', 'no-store');
    return this.service.leave(
      await this.auth.requireUser(req),
      p.id,
      p.entryId,
    );
  }
  @Get('matches/:id/waitlist')
  @ApiOkResponse({ type: OrganizerWaitlistResponse })
  async organizer(
    @Param() p: MatchIdDto,
    @Query() q: WaitlistPageDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.set('Cache-Control', 'no-store');
    return this.service.organizer(
      await this.auth.requireUser(req),
      p.id,
      q.page,
    );
  }
  @Post('waitlist/offers/:offerId/accept')
  @HttpCode(200)
  @ApiOkResponse({ type: ReservationResponse })
  async accept(
    @Param() p: WaitlistOfferIdDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.set('Cache-Control', 'no-store');
    return this.service.resolve(
      await this.auth.requireUser(req),
      p.offerId,
      true,
    );
  }
  @Post('waitlist/offers/:offerId/reject')
  @HttpCode(200)
  @ApiOkResponse({ type: WaitlistEntryResponse })
  async reject(
    @Param() p: WaitlistOfferIdDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.set('Cache-Control', 'no-store');
    return this.service.resolve(
      await this.auth.requireUser(req),
      p.offerId,
      false,
    );
  }
  @Get('users/me/waitlist')
  @ApiOkResponse({ type: OwnWaitlistResponse })
  async ownList(
    @Query() q: WaitlistPageDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.set('Cache-Control', 'no-store');
    return this.service.ownList(await this.auth.requireUser(req), q.page);
  }
}
