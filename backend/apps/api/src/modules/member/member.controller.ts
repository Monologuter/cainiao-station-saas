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
import { CurrentUser, Public, RequirePermission } from '../identity/decorators';
import { CheckinService } from './checkin.service';
import {
  SendConsumerCodeDto,
  VerifyConsumerCodeDto,
} from './consumer-auth.dto';
import { CouponService } from './coupon.service';
import { MemberService } from './member.service';
import { PointService } from './point.service';

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

@Public()
@Controller('member')
export class MemberCenterController {
  constructor(
    private readonly member: MemberService,
    private readonly points: PointService,
    private readonly checkins: CheckinService,
    private readonly coupons: CouponService,
  ) {}

  @Get('profile')
  async profile(@Headers('authorization') authorization: string | undefined) {
    const { member } = await this.member.requireMember(authorization);
    return this.member.getProfile(member.id);
  }

  @Get('points/records')
  async pointRecords(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: any,
  ) {
    const { member } = await this.member.requireMember(authorization);
    return this.points.getRecords(member.id, query);
  }

  @Get('points/rank')
  async pointRank(
    @Headers('authorization') authorization: string | undefined,
    @Query('tenantId') tenantId: string,
  ) {
    const { member } = await this.member.requireMember(authorization);
    return this.points.getRank(tenantId, member.id);
  }

  @Post('checkin')
  async checkin(@Headers('authorization') authorization: string | undefined) {
    const { member } = await this.member.requireMember(authorization);
    return this.checkins.checkin(member.id);
  }

  @Get('checkin/status')
  async checkinStatus(
    @Headers('authorization') authorization: string | undefined,
    @Query('month') month?: string,
  ) {
    const { member } = await this.member.requireMember(authorization);
    return this.checkins.getStatus(
      member.id,
      month ?? new Date().toISOString().slice(0, 7),
    );
  }

  @Get('coupons')
  async listCoupons(
    @Headers('authorization') authorization: string | undefined,
    @Query('status') status?: string,
  ) {
    const { member } = await this.member.requireMember(authorization);
    return this.coupons.listMemberCoupons(member.id, status);
  }

  @Get('coupon-templates')
  listCouponTemplates(@Query() query: any) {
    return this.coupons.listTemplates(query);
  }

  @Post('coupons/redeem')
  async redeemCoupon(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: any,
  ) {
    const { member } = await this.member.requireMember(authorization);
    return this.coupons.redeemByPoints(member.id, body.templateId);
  }

  @Post('coupons/:id/verify')
  async verifyCoupon(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const { member } = await this.member.requireMember(authorization);
    return this.coupons.verifyForMember(member.id, id, body);
  }
}

@Controller('admin')
export class MemberAdminController {
  constructor(private readonly coupons: CouponService) {}

  @RequirePermission('coupon:manage')
  @Post('coupon-templates')
  createCouponTemplate(@CurrentUser() user: any, @Body() body: any) {
    return this.coupons.createTemplate(user.tenantId, body);
  }

  @RequirePermission('coupon:manage')
  @Get('coupon-templates')
  listCouponTemplates(@Query() query: any) {
    return this.coupons.listTemplates(query);
  }

  @RequirePermission('coupon:issue')
  @Post('coupon-templates/:id/issue')
  issueCoupons(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.coupons.issue(user.tenantId, id, body.memberIds ?? []);
  }
}
