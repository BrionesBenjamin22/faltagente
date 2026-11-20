import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class MatchHistoryQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;
}

export class ManagementSportResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiProperty() active: boolean;
}
export class ManagementLocationResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() type: string;
  @ApiProperty() active: boolean;
}
export class MatchManagementResponse {
  @ApiProperty({ type: ManagementSportResponse })
  sport: ManagementSportResponse;
  @ApiProperty({ type: ManagementSportResponse, nullable: true })
  sportFormat: ManagementSportResponse | null;
  @ApiProperty({ type: ManagementLocationResponse })
  location: ManagementLocationResponse;
  @ApiProperty({ format: 'date-time' }) startsAt: Date;
  @ApiProperty() placeName: string;
  @ApiProperty() address: string;
  @ApiProperty({ type: String }) pricePerPerson: string;
  @ApiProperty({ type: String, nullable: true }) description: string | null;
  @ApiProperty({ enum: ['OPEN', 'CLOSED', 'CANCELLED'] }) status: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelledAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) cancellationReason:
    string | null;
  @ApiProperty() occupiedPlaces: number;
  @ApiProperty() activePlayerCount: number;
  @ApiProperty() hasConfirmedParticipants: boolean;
  @ApiProperty() canEdit: boolean;
  @ApiProperty() canCancel: boolean;
  @ApiProperty() canAdjustCapacity: boolean;
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() totalPlaces: number;
  @ApiProperty() availablePlaces: number;
  @ApiProperty() version: number;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt: Date;
}

export class MatchHistoryActorResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
}

export class MatchHistoryItemResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'PUBLISHED' }) event: string;
  @ApiProperty({ format: 'date-time' }) occurredAt: Date;
  @ApiProperty({ type: MatchHistoryActorResponse })
  actor: MatchHistoryActorResponse;
  @ApiProperty({
    type: 'object',
    additionalProperties: {
      type: 'object',
      properties: { before: {}, after: {} },
    },
  })
  changes: unknown;
}

export class MatchHistoryResponse {
  @ApiProperty({ type: [MatchHistoryItemResponse] })
  items: MatchHistoryItemResponse[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty({ example: 3 }) pageSize: number;
  @ApiProperty() hasMore: boolean;
}
