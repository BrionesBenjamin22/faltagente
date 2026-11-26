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
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { NotificationIdDto, NotificationsQueryDto } from './dto/notification.dto.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    private readonly auth: AuthService,
  ) {}

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
