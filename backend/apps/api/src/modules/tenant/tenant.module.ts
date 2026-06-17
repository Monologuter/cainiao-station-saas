import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { FileModule } from '../file/file.module';
import { ApplicationService } from './application/application.service';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';

@Module({
  imports: [FileModule],
  controllers: [TenantController],
  providers: [ApplicationService, TenantService, PrismaService],
})
export class TenantModule {}
