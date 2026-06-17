import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ContextInterceptor } from './core/http/context.interceptor';
import { PrismaService } from './core/prisma/prisma.service';
import { TenantPrismaService } from './core/prisma/tenant-prisma.service';
import { IdentityModule } from './modules/identity/identity.module';
import { JwtAuthGuard } from './modules/identity/jwt-auth.guard';
import { PermissionGuard } from './modules/identity/permission.guard';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), IdentityModule],
  controllers: [],
  providers: [
    PrismaService,
    TenantPrismaService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: ContextInterceptor },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule {}
