import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { ParcelModule } from '../parcel/parcel.module';
import { ExceptionController } from './exception.controller';
import { ExceptionService } from './exception.service';

@Module({
  imports: [ParcelModule],
  controllers: [ExceptionController],
  providers: [ExceptionService, PrismaService, TenantPrismaService],
  exports: [ExceptionService],
})
export class ExceptionModule {}
