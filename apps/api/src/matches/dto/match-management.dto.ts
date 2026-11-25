import { ApiProperty } from '@nestjs/swagger';

export class ManagementSportResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiProperty() active: boolean;
}
export class ManagementLocationResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() type: string;
  @ApiProperty() active: boolean;
}
export class MatchManagementResponse {
  @ApiProperty({ type: ManagementSportResponse })
  sport: ManagementSportResponse;
  @ApiProperty({ type: ManagementSportResponse, nullable: true })
  sportFormat: ManagementSportResponse | null;
  @ApiProperty({ type: ManagementLocationResponse })
  location: ManagementLocationResponse;
  @ApiProperty({ format: 'date-time' }) startsAt: Date;
  @ApiProperty() placeName: string;
  @ApiProperty() address: string;
  @ApiProperty({ type: String }) pricePerPerson: string;
  @ApiProperty({ type: String, nullable: true }) description: string | null;
  @ApiProperty({ enum: ['OPEN', 'CLOSED', 'CANCELLED'] }) status: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelledAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) cancellationReason:
    string | null;
  @ApiProperty() occupiedPlaces: number;
  @ApiProperty() activePlayerCount: number;
  @ApiProperty() hasConfirmedParticipants: boolean;
  @ApiProperty() canEdit: boolean;
  @ApiProperty() canCancel: boolean;
  @ApiProperty() canAdjustCapacity: boolean;
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() totalPlaces: number;
  @ApiProperty() availablePlaces: number;
  @ApiProperty() version: number;
}
