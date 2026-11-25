import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';
import { MatchIdDto } from '../matches/dto/match-id.dto.js';
export class JoinWaitlistDto {
  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  places: number;
}
export class WaitlistPageDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 10000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;
}
export class WaitlistEntryIdDto extends MatchIdDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() entryId: string;
}
export class WaitlistOfferIdDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() offerId: string;
}
export class WaitlistOfferResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({
    enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'INVALIDATED'],
  })
  status: string;
  @ApiProperty() places: number;
  @ApiProperty({ format: 'date-time' }) expiresAt: Date;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) reservationId:
    string | null;
}
export class WaitlistEntryResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) matchId: string;
  @ApiProperty() places: number;
  @ApiProperty({
    enum: ['WAITING', 'OFFERED', 'COMPLETED', 'LEFT', 'EXPIRED', 'INVALIDATED'],
  })
  status: string;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
  @ApiProperty({ type: WaitlistOfferResponse, nullable: true })
  offer: WaitlistOfferResponse | null;
}
export class WaitlistUserResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
}
export class OrganizerWaitlistEntryResponse extends WaitlistEntryResponse {
  @ApiProperty({ type: WaitlistUserResponse }) user: WaitlistUserResponse;
}
export class WaitlistSportResponse extends WaitlistUserResponse {
  @ApiProperty() slug: string;
}
export class WaitlistLocationResponse extends WaitlistUserResponse {
  @ApiProperty() type: string;
}
export class WaitlistMatchResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'date-time' }) startsAt: Date;
  @ApiProperty() venueName: string;
  @ApiProperty() address: string;
  @ApiProperty() availablePlaces: number;
  @ApiProperty({ enum: ['OPEN', 'CLOSED', 'CANCELLED'] }) status: string;
  @ApiProperty({ type: WaitlistSportResponse }) sport: WaitlistSportResponse;
  @ApiProperty({ type: WaitlistSportResponse, nullable: true })
  sportFormat: WaitlistSportResponse | null;
  @ApiProperty({ type: WaitlistLocationResponse })
  location: WaitlistLocationResponse;
}
export class OwnWaitlistEntryResponse extends WaitlistEntryResponse {
  @ApiProperty({ type: WaitlistMatchResponse }) match: WaitlistMatchResponse;
}
export class WaitlistPageResponse {
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty({ example: 9 }) pageSize: number;
  @ApiProperty() hasMore: boolean;
}
export class OrganizerWaitlistResponse extends WaitlistPageResponse {
  @ApiProperty({ type: [OrganizerWaitlistEntryResponse] })
  items: OrganizerWaitlistEntryResponse[];
}
export class OwnWaitlistResponse extends WaitlistPageResponse {
  @ApiProperty({ type: [OwnWaitlistEntryResponse] })
  items: OwnWaitlistEntryResponse[];
}
