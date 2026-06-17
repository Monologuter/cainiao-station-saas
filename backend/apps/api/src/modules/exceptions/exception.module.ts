import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { ParcelModule } from '../parcel/parcel.module';
import { ExceptionService } from './exception.service';

@Module({
  imports: [ParcelModule],
  providers: [ExceptionService, PrismaService, TenantPrismaService],
  exports: [ExceptionService],
})
export class ExceptionModule {}
