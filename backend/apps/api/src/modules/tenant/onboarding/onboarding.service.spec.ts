import { EventBus } from '../../../core/event-bus/event-bus';
import { OnboardingService } from './onboarding.service';

describe('OnboardingService', () => {
  it('provisions a tenant, station owner and subscription from a pending application', async () => {
    const { service, tx, tenant, subscriptions, eventBus } = createService();

    const result = await service.provision({
      applicationId: 'app-1',
      reviewerId: 'admin-1',
      planCode: 'STANDARD',
      stationName: '审核后门店名',
    });

    expect(tenant.createTenant).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '上海测试科技有限公司',
        ownerName: '张三',
        ownerPhone: '13800000001',
        stationName: '审核后门店名',
        stationAddress: '上海市测试路 1 号',
      }),
      tx,
    );
    expect(subscriptions.subscribe).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      stationId: 'station-1',
      planCode: 'STANDARD',
      tx,
    });
    expect(tx.tenantApplication.update).toHaveBeenCalledWith({
      where: { id: 'app-1' },
      data: expect.objectContaining({
        status: 'APPROVED',
        approvedTenantId: 'tenant-1',
        reviewedBy: 'admin-1',
      }),
    });
    expect(result).toMatchObject({
      tenantId: 'tenant-1',
      stationId: 'station-1',
      ownerUserId: 'user-1',
      ownerUsername: '13800000001',
      planCode: 'STANDARD',
      subscriptionId: 'sub-1',
    });
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'TenantApproved',
        payload: expect.objectContaining({
          applicationId: 'app-1',
          tenantId: 'tenant-1',
          stationId: 'station-1',
          ownerUsername: '13800000001',
          planCode: 'STANDARD',
        }),
      }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'TenantStatusChanged',
        payload: { tenantId: 'tenant-1', status: 'ACTIVE', reason: 'ONBOARDING' },
      }),
    );
  });

  it('returns existing tenant for an already provisioned application without duplicate side effects', async () => {
    const { service, tenant, subscriptions, eventBus } = createService({
      application: {
        id: 'app-1',
        applicationNo: 'APP20260618-0001',
        status: 'APPROVED',
        approvedTenantId: 'tenant-existing',
        contactPhone: '13800000001',
        stationName: '已开通门店',
        proposedPlanCode: 'BASIC',
      },
      existingStation: { id: 'station-existing' },
      existingUser: { id: 'user-existing', username: '13800000001' },
      existingSubscription: { id: 'sub-existing' },
    });

    const result = await service.provision({
      applicationId: 'app-1',
      reviewerId: 'admin-1',
    });

    expect(result).toMatchObject({
      tenantId: 'tenant-existing',
      stationId: 'station-existing',
      ownerUserId: 'user-existing',
      subscriptionId: 'sub-existing',
    });
    expect(tenant.createTenant).not.toHaveBeenCalled();
    expect(subscriptions.subscribe).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  function createService(options: any = {}) {
    const application = options.application ?? {
      id: 'app-1',
      applicationNo: 'APP20260618-0001',
      status: 'PENDING',
      approvedTenantId: null,
      entityName: '上海测试科技有限公司',
      contactName: '张三',
      contactPhone: '13800000001',
      stationName: '张三菜鸟驿站',
      stationAddress: '上海市测试路 1 号',
      proposedPlanCode: 'BASIC',
    };
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      tenantApplication: {
        findUnique: jest.fn().mockResolvedValue(application),
        update: jest.fn().mockResolvedValue({
          ...application,
          status: 'APPROVED',
          approvedTenantId: 'tenant-1',
        }),
      },
      station: {
        findFirst: jest.fn().mockResolvedValue(options.existingStation ?? null),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue(options.existingUser ?? null),
      },
      subscription: {
        findFirst: jest
          .fn()
          .mockResolvedValue(options.existingSubscription ?? null),
      },
    };
    const prisma = { $transaction: jest.fn((fn) => fn(tx)) };
    const tenant = {
      createTenant: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        stationId: 'station-1',
        ownerUserId: 'user-1',
      }),
    };
    const subscriptions = {
      subscribe: jest.fn().mockResolvedValue({ id: 'sub-1' }),
    };
    const eventBus = { publish: jest.fn() };
    return {
      service: new OnboardingService(
        prisma as any,
        tenant as any,
        subscriptions as any,
        eventBus as any,
      ),
      tx,
      tenant,
      subscriptions,
      eventBus,
    };
  }
});
