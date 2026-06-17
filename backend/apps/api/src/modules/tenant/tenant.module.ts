import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { BillingModule } from '../billing/billing.module';
import { FileModule } from '../file/file.module';
import { ApplicationController } from './application/application.controller';
import { ApplicationService } from './application/application.service';
import { OnboardingService } from './onboarding/onboarding.service';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';

@Module({
  imports: [BillingModule, FileModule],
  controllers: [ApplicationController, TenantController],
  providers: [
    ApplicationService,
    OnboardingService,
    TenantService,
    PrismaService,
  ],
})
export class TenantModule {}
