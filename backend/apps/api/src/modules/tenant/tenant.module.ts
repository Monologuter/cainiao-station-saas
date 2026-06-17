import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';

@Module({
  controllers: [TenantController],
  providers: [TenantService, PrismaService],
})
export class TenantModule {}
