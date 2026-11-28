import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Headers,
  Body,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { NotificationIdDto, NotificationsQueryDto } from './dto/notification.dto.js';
import { NotificationsService } from './notifications.service.js';
import { PushNotificationsService } from './push-notifications.service.js';
import { PushSubscriptionDto, PushSubscriptionIdDto } from './dto/push.dto.js';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    private readonly auth: AuthService,
    private readonly push: PushNotificationsService,
  ) {}

  @Get('push/config')
  pushConfig() {
    return this.push.configDto();
  }

  @Post('push/subscriptions')
  @HttpCode(200)
  async subscribePush(
    @Req() req: Request,
    @Body() dto: PushSubscriptionDto,
  ) {
    return this.push.subscribe(await this.auth.requireUser(req), dto);
  }

  @Delete('push/subscriptions/:id')
  @HttpCode(204)
  async unsubscribePush(
    @Req() req: Request,
    @Param() params: PushSubscriptionIdDto,
  ) {
    await this.push.unsubscribe(await this.auth.requireUser(req), params.id);
  }

  @Get()
  @ApiOkResponse({ description: 'Listado paginado de notificaciones.' })
  async list(@Req() req: Request, @Query() query: NotificationsQueryDto) {
    return this.service.list(
      await this.auth.requireUser(req),
      query.filter,
      query.page,
      query.pageSize,
    );
  }

  @Get('unread-count')
  async unreadCount(@Req() req: Request) {
    return this.service.unreadCount(await this.auth.requireUser(req));
  }

  @Get(':id')
  async detail(@Req() req: Request, @Param() params: NotificationIdDto) {
    return this.service.detail(await this.auth.requireUser(req), params.id);
  }

  @Patch(':id/read')
  @HttpCode(200)
  async markRead(@Req() req: Request, @Param() params: NotificationIdDto) {
    return this.service.markRead(
      await this.auth.requireUser(req),
      params.id,
    );
  }

  @Post('read-all')
  @HttpCode(200)
  async markAllRead(@Req() req: Request) {
    return this.service.markAllRead(await this.auth.requireUser(req));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() req: Request, @Param() params: NotificationIdDto) {
    await this.service.remove(await this.auth.requireUser(req), params.id);
  }
}

@ApiTags('Internal Notifications')
@Controller('internal/notifications')
export class InternalNotificationsController {
  constructor(private readonly push: PushNotificationsService) {}

  @Post('process')
  @HttpCode(200)
  process(
    @Headers('x-notification-service-token') token: string,
    @Query('limit') limit = '20',
  ) {
    return this.push.process(token, Number(limit));
  }
}
