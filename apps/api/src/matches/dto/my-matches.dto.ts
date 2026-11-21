import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MatchResponse } from './matches-response.dto.js';

export class MyMatchesQueryDto {
  @ApiPropertyOptional({ enum: ['upcoming', 'past', 'cancelled'], default: 'upcoming' })
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

export class MyMatchResponse extends MatchResponse {
  @ApiProperty({ enum: ['OPEN', 'CLOSED', 'CANCELLED'] }) declare status: string;
}

export class MyMatchesResponse {
  @ApiProperty({ type: [MyMatchResponse] }) items: MyMatchResponse[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty({ example: 9 }) pageSize: number;
  @ApiProperty() hasMore: boolean;
}
