import { IsString, Matches } from 'class-validator';

export class SendConsumerCodeDto {
  @IsString()
  @Matches(/^1\d{10}$/)
  phone: string;
}

export class VerifyConsumerCodeDto extends SendConsumerCodeDto {
  @IsString()
  code: string;
}
