import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PlanController } from './plan/plan.controller';
import { PlanService } from './plan/plan.service';

@Module({
  controllers: [PlanController],
  providers: [PlanService, PrismaService],
})
export class BillingModule {}
