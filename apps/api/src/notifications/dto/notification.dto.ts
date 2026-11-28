import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { NotificationType } from '@prisma/client';

export class NotificationsQueryDto {
  @IsOptional()
  @IsIn(['all', 'unread'])
  filter: 'all' | 'unread' = 'all';

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? 1 : Number(value)))
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? 9 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(9)
  pageSize = 9;
}

export class NotificationIdDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id: string;
}

export class NotificationResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ enum: Object.values(NotificationType) })
  type: NotificationType;
  @ApiProperty()
  title: string;
  @ApiProperty()
  body: string;
  @ApiPropertyOptional()
  detail: string | null;
  @ApiPropertyOptional({ format: 'uuid' })
  relatedMatchId: string | null;
  @ApiPropertyOptional()
  metadata: unknown;
  @ApiProperty()
  isRead: boolean;
  @ApiPropertyOptional({ format: 'date-time' })
  readAt: Date | null;
  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
  relatedMatch?: {
    id: string;
    startsAt: Date;
    venueName: string;
    address: string;
    availablePlaces: number;
    totalPlaces: number;
    sport: { id: string; name: string; slug: string };
  } | null;
  actor?: { id: string; name: string } | null;
}
