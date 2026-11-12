import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateMatchDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() sportId: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  sportFormatId?: string | null;
  @ApiProperty({ format: 'uuid' }) @IsUUID() locationId: string;
  @ApiProperty({ format: 'date-time', example: '2099-11-12T20:00:00-03:00' })
  @IsDateString({ strict: true })
  @Matches(/T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/)
  startsAt: string;
  @ApiProperty({ minLength: 2, maxLength: 120 })
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  placeName: string;
  @ApiProperty({ minLength: 2, maxLength: 200 })
  @Transform(trim)
  @IsString()
  @Length(2, 200)
  address: string;
  @ApiProperty({
    type: String,
    example: '2500.50',
    description: 'Decimal no negativo, máximo 8 enteros y 2 decimales.',
  })
  @IsString()
  @Matches(/^\d{1,8}(?:\.\d{1,2})?$/)
  pricePerPerson: string;
  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  totalPlaces: number;
  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 2000)
  description?: string | null;
}

export class MatchHistoryQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;
}

export class CreatedMatchResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
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

export class MatchIdDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() id: string;
}
