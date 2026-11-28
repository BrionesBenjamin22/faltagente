import { IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { IsUUID } from 'class-validator';

class PushKeysDto {
  @IsString()
  p256dh: string;

  @IsString()
  auth: string;
}

export class PushSubscriptionDto {
  @IsString()
  endpoint: string;

  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;
}

export class PushSubscriptionIdDto {
  @IsUUID()
  id: string;
}
