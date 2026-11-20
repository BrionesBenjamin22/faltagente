import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class MatchIdDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() id: string;
}
