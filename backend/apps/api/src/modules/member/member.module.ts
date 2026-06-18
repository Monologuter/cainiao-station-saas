import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { requireJwtSecret } from '../../core/config/security-env';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { ParcelPickedUpListener } from './listeners/parcel-picked-up.listener';
import { ShipOrderPaidListener } from './listeners/ship-order-paid.listener';
import { CouponService } from './coupon.service';
import { CheckinService } from './checkin.service';
import {
  MemberAdminController,
  MemberCenterController,
  MemberController,
} from './member.controller';
import { MemberService } from './member.service';
import { PointService } from './point.service';

@Module({
  imports: [
    JwtModule.register({
      secret: requireJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [
    MemberController,
    MemberCenterController,
    MemberAdminController,
  ],
  providers: [
    MemberService,
    PointService,
    CouponService,
    CheckinService,
    ParcelPickedUpListener,
    ShipOrderPaidListener,
    PrismaService,
    TenantPrismaService,
    RedisService,
  ],
  exports: [MemberService, PointService, CouponService, CheckinService],
})
export class MemberModule {}
