import { ApiProperty } from '@nestjs/swagger';

export class ProfileChangeResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'date-time' }) occurredAt: string;
  @ApiProperty({
    type: Object,
    example: { name: { before: 'Ana', after: 'Ana María' } },
  })
  changes: Record<string, unknown>;
}

export class ProfileHistoryResponse {
  @ApiProperty({ type: [ProfileChangeResponse] })
  items: ProfileChangeResponse[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty({ example: 3 }) pageSize: number;
  @ApiProperty() hasMore: boolean;
}
