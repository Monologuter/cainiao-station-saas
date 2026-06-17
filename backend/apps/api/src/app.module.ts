import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ContextInterceptor } from './core/http/context.interceptor';
import { PrismaService } from './core/prisma/prisma.service';
import { TenantPrismaService } from './core/prisma/tenant-prisma.service';
import { RedisLockService } from './core/redis/redis-lock.service';
import { RedisService } from './core/redis/redis.service';
import { IdentityModule } from './modules/identity/identity.module';
import { JwtAuthGuard } from './modules/identity/jwt-auth.guard';
import { PermissionGuard } from './modules/identity/permission.guard';
import { StationModule } from './modules/station/station.module';
import { TenantModule } from './modules/tenant/tenant.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    IdentityModule,
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
