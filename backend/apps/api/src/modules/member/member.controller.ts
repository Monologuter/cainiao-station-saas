import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { Public } from '../identity/decorators';
import {
  SendConsumerCodeDto,
  VerifyConsumerCodeDto,
} from './consumer-auth.dto';
import { MemberService } from './member.service';

class ConsumerParcelQuery {
  @IsOptional()
  @IsString()
  status?: string;
}

@Public()
@Controller('consumer')
export class MemberController {
  constructor(private readonly member: MemberService) {}

  @Post('auth/send-code')
  sendCode(@Body() dto: SendConsumerCodeDto) {
    return this.member.sendCode(dto.phone);
  }

  @Post('auth/verify')
  verify(@Body() dto: VerifyConsumerCodeDto) {
    return this.member.verifyCode(dto.phone, dto.code);
  }

  @Get('parcels')
  listParcels(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: ConsumerParcelQuery,
  ) {
    return this.member.listParcels(authorization, query.status);
  }

  @Get('parcels/:id')
  getParcel(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ) {
    return this.member.getParcel(authorization, id);
  }
}
