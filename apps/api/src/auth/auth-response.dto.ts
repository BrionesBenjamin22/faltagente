import { ApiProperty } from '@nestjs/swagger';
import { UserResponse } from '../users/user-response.dto.js';

export class SessionResponse {
  @ApiProperty() authenticated: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  accessExpiresAt: string | null;
  @ApiProperty() refreshAvailable: boolean;
  @ApiProperty({ type: UserResponse, nullable: true })
  user: UserResponse | null;
}

export class CsrfResponse {
  @ApiProperty() csrfToken: string;
}
