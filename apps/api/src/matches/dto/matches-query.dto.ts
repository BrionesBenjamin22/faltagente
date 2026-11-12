import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MatchesQueryDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() locationId: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sportId?: string;
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Requires sportId and must belong to that sport.',
  })
  @IsOptional()
  @IsUUID()
  sportFormatId?: string;
  @ApiPropertyOptional({
    format: 'date',
    example: '2026-11-03',
    description: 'Calendar day in America/Argentina/Buenos_Aires.',
  })
  @IsOptional()
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  date?: string;
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;
}
