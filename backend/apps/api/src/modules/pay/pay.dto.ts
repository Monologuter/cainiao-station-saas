import { IsObject, IsString } from 'class-validator';

export class WechatPayCallbackDto {
  @IsString()
  body: string;

  @IsString()
  timestamp: string;

  @IsString()
  nonce: string;

  @IsString()
  signature: string;

  @IsString()
  serial: string;

  @IsObject()
  resource: Record<string, unknown>;
}
