import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventBusModule } from './core/event-bus/event-bus.module';
import { ContextInterceptor } from './core/http/context.interceptor';
import { PrismaService } from './core/prisma/prisma.service';
import { TenantPrismaService } from './core/prisma/tenant-prisma.service';
import { RedisLockService } from './core/redis/redis-lock.service';
import { RedisService } from './core/redis/redis.service';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { BillingModule } from './modules/billing/billing.module';
import { ExceptionModule } from './modules/exceptions/exception.module';
import { IdentityModule } from './modules/identity/identity.module';
import { JwtAuthGuard } from './modules/identity/jwt-auth.guard';
import { PermissionGuard } from './modules/identity/permission.guard';
import { InboundModule } from './modules/inbound/inbound.module';
import { MemberModule } from './modules/member/member.module';
import { NotifyModule } from './modules/notify/notify.module';
import { ParcelModule } from './modules/parcel/parcel.module';
import { PickupModule } from './modules/pickup/pickup.module';
import { ReviewModule } from './modules/review/review.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { StationModule } from './modules/station/station.module';
import { TenantModule } from './modules/tenant/tenant.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventBusModule,
    AnalyticsModule,
    BillingModule,
    ExceptionModule,
    IdentityModule,
    InboundModule,
    MemberModule,
    NotifyModule,
    ParcelModule,
    PickupModule,
    ReviewModule,
    ShippingModule,
    StationModule,
    TenantModule,
  ],
  controllers: [],
  providers: [
    PrismaService,
    TenantPrismaService,
    RedisService,
    RedisLockService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: ContextInterceptor },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule {}
