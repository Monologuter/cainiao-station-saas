import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EventBus } from '../../../core/event-bus/event-bus';
import { ApiCode, BizError } from '../../../core/http/api-code';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SubscriptionService } from '../../billing/subscription/subscription.service';
import { TenantService } from '../tenant.service';

interface ProvisionInput {
  applicationId: string;
  reviewerId?: string;
  planCode?: string;
  stationName?: string;
}

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantService,
    private readonly subscriptions: SubscriptionService,
    private readonly eventBus: EventBus,
  ) {}

  async provision(input: ProvisionInput) {
    const tempPassword = this.tempPassword();
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      const application = await tx.tenantApplication.findUnique({
        where: { id: input.applicationId },
      });
      if (!application) {
        throw new BizError(ApiCode.NOT_FOUND, '申请不存在');
      }

      if (application.approvedTenantId) {
        return {
          ...(await this.existingProvision(tx, application)),
          shouldPublish: false,
        };
      }

      const planCode =
        input.planCode ?? application.proposedPlanCode ?? 'BASIC';
      const created = await this.tenants.createTenant(
        {
          name: application.entityName,
          ownerName: application.contactName,
          ownerPhone: application.contactPhone,
          ownerPassword: tempPassword,
          stationName: input.stationName ?? application.stationName,
          stationAddress: application.stationAddress,
        },
        tx,
      );
      const subscription = await this.subscriptions.subscribe({
        tenantId: created.tenantId,
        stationId: created.stationId,
        planCode,
        tx,
      });
      await tx.tenantApplication.update({
        where: { id: application.id },
        data: {
          status: 'APPROVED',
          approvedTenantId: created.tenantId,
          reviewedBy: input.reviewerId,
          reviewedAt: new Date(),
        },
      });

      return {
        applicationId: application.id,
        tenantId: created.tenantId,
        stationId: created.stationId,
        ownerUserId: created.ownerUserId,
        ownerUsername: application.contactPhone,
        tempPassword,
        planCode,
        subscriptionId: subscription.id,
        shouldPublish: true,
      };
    });

    if (result.shouldPublish) {
      await this.eventBus.publish(
        EventBus.createEvent('TenantApproved', {
          applicationId: result.applicationId,
          tenantId: result.tenantId,
          stationId: result.stationId,
          ownerUserId: result.ownerUserId,
          ownerUsername: result.ownerUsername,
          tempPassword: result.tempPassword,
          planCode: result.planCode,
        }),
      );
      await this.eventBus.publish(
        EventBus.createEvent('TenantStatusChanged', {
          tenantId: result.tenantId,
          status: 'ACTIVE',
          reason: 'ONBOARDING',
        }),
      );
    }

    const { shouldPublish, ...payload } = result;
    return payload;
  }

  private async existingProvision(tx: any, application: any) {
    const station = await tx.station.findFirst({
      where: { tenantId: application.approvedTenantId },
      orderBy: { createdAt: 'asc' },
    });
    const user = await tx.user.findFirst({
      where: {
        tenantId: application.approvedTenantId,
        username: application.contactPhone,
      },
    });
    const subscription = await tx.subscription.findFirst({
      where: {
        tenantId: application.approvedTenantId,
        stationId: station?.id,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      applicationId: application.id,
      tenantId: application.approvedTenantId,
      stationId: station?.id,
      ownerUserId: user?.id,
      ownerUsername: user?.username ?? application.contactPhone,
      tempPassword: undefined,
      planCode: application.proposedPlanCode ?? 'BASIC',
      subscriptionId: subscription?.id,
    };
  }

  private tempPassword() {
    return `Cn${randomUUID().replace(/-/g, '').slice(0, 10)}`;
  }
}
