import { ApiProperty } from '@nestjs/swagger';
import { PublicLocationResponse } from '../locations/locations-response.dto.js';

export class UserResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({ format: 'email' }) email: string;
  @ApiProperty() emailVerified: boolean;
  @ApiProperty() hasLocalPassword: boolean;
  @ApiProperty({ type: PublicLocationResponse, nullable: true })
  primaryLocation: PublicLocationResponse | null;
}
