import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
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

export class CreatedMatchResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
}
