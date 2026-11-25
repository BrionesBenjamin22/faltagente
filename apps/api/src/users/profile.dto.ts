import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsUUID, Length, ValidateIf } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 100 })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 100)
  name?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  primaryLocationId?: string;
}
