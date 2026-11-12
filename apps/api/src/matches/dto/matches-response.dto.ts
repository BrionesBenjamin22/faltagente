import { ApiProperty } from '@nestjs/swagger';
import { PublicLocationResponse } from '../../locations/locations-response.dto.js';
import { SportIdentityResponse } from '../../sports/sports-response.dto.js';

export class MatchResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ type: PublicLocationResponse })
  location: PublicLocationResponse;
  @ApiProperty({ type: SportIdentityResponse }) sport: SportIdentityResponse;
  @ApiProperty({ type: SportIdentityResponse, nullable: true })
  sportFormat: SportIdentityResponse | null;
  @ApiProperty({ format: 'date-time' }) startsAt: string;
  @ApiProperty() venueName: string;
  @ApiProperty() address: string;
  @ApiProperty({ example: '5000.00' }) pricePerPerson: string;
  @ApiProperty() availablePlaces: number;
  @ApiProperty({ enum: ['OPEN', 'CLOSED'] }) status: string;
  @ApiProperty({ type: String, nullable: true }) description: string | null;
}

export class MatchesResponse {
  @ApiProperty({ type: [MatchResponse] }) items: MatchResponse[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty({ example: 9 }) pageSize: number;
  @ApiProperty() hasMore: boolean;
}
