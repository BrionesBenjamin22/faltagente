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

export class MatchManagementResponse {
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
