import { ApiProperty } from '@nestjs/swagger';

export class PublicLocationResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: ['PROVINCIA', 'CIUDAD', 'LOCALIDAD', 'BARRIO', 'ZONA'] })
  type: string;
}

export class LocationResponse extends PublicLocationResponse {
  @ApiProperty({ format: 'uuid', nullable: true }) parentId: string | null;
}

export class LocationsResponse {
  @ApiProperty({ type: [LocationResponse] }) items: LocationResponse[];
}
