import { ApiProperty } from '@nestjs/swagger';

export class SportIdentityResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
}

export class SportResponse extends SportIdentityResponse {
  @ApiProperty({ type: [SportIdentityResponse] })
  formats: SportIdentityResponse[];
}

export class SportsResponse {
  @ApiProperty({ type: [SportResponse] }) items: SportResponse[];
}
