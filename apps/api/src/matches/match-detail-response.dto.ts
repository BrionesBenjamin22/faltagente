import { ApiProperty } from '@nestjs/swagger';
import { SportIdentityResponse } from '../common/http/response.dto.js';

class PublicMatchIdentityResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
}

export class MatchDetailResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ type: SportIdentityResponse }) sport: SportIdentityResponse;
  @ApiProperty({ type: SportIdentityResponse, nullable: true })
  sportFormat: SportIdentityResponse | null;
  @ApiProperty({ format: 'date-time' }) startsAt: string;
  @ApiProperty({ type: PublicMatchIdentityResponse }) location: PublicMatchIdentityResponse;
  @ApiProperty() placeName: string;
  @ApiProperty() address: string;
  @ApiProperty({ example: '7000' }) pricePerPerson: string;
  @ApiProperty() availablePlaces: number;
  @ApiProperty({ type: String, nullable: true }) description: string | null;
  @ApiProperty({ enum: ['OPEN', 'CLOSED', 'CANCELLED'] }) status: string;
  @ApiProperty({ type: PublicMatchIdentityResponse }) organizer: PublicMatchIdentityResponse;
}
