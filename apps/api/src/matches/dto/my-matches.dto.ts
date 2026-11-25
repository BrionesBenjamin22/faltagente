import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MatchResponse } from './matches-response.dto.js';

export class MyMatchesQueryDto {
  @ApiPropertyOptional({ enum: ['organizer', 'player'], default: 'organizer' })
  @IsOptional()
  @IsIn(['organizer', 'player'])
  role: 'organizer' | 'player' = 'organizer';
  @ApiPropertyOptional({
    enum: ['upcoming', 'past', 'cancelled'],
    default: 'upcoming',
  })
  @IsOptional()
  @IsIn(['upcoming', 'past', 'cancelled'])
  filter: 'upcoming' | 'past' | 'cancelled' = 'upcoming';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;
}

export class MyMatchReservationResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() places: number;
  @ApiProperty({ enum: ['CONFIRMED', 'CANCELLED'] }) status: string;
  @ApiProperty({ enum: ['USER', 'MATCH'], nullable: true }) cancellationSource:
    string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelledAt: Date | null;
}

export class MyMatchResponse extends MatchResponse {
  @ApiProperty({ enum: ['OPEN', 'CLOSED', 'CANCELLED'] })
  declare status: string;
  @ApiPropertyOptional({ type: () => MyMatchReservationResponse })
  reservation?: MyMatchReservationResponse;
}

export class MyMatchesResponse {
  @ApiProperty({ type: [MyMatchResponse] }) items: MyMatchResponse[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty({ example: 9 }) pageSize: number;
  @ApiProperty() hasMore: boolean;
}
