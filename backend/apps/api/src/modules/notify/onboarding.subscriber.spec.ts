import { EventBus } from '../../core/event-bus/event-bus';
import { OnboardingSubscriber } from './onboarding.subscriber';

describe('OnboardingSubscriber', () => {
  it('subscribes to onboarding review events', () => {
    const eventBus = { subscribe: jest.fn() };
    const subscriber = new OnboardingSubscriber(eventBus as any, {} as any);

    subscriber.onModuleInit();

    expect(eventBus.subscribe).toHaveBeenCalledWith(
      'TenantApproved',
      expect.any(Function),
    );
    expect(eventBus.subscribe).toHaveBeenCalledWith(
      'ApplicationRejected',
      expect.any(Function),
    );
  });

  it('forwards approved and rejected events to notify service', async () => {
    const notify = {
      notifyTenantApproved: jest.fn(),
      notifyApplicationRejected: jest.fn(),
    };
    const subscriber = new OnboardingSubscriber({ subscribe: jest.fn() } as any, notify as any);

    await subscriber.onTenantApproved(
      EventBus.createEvent('TenantApproved', {
        applicationId: 'app-1',
        tenantId: 'tenant-1',
        stationId: 'station-1',
        ownerUserId: 'user-1',
        ownerUsername: '13800000001',
        tempPassword: 'Cn123456',
        planCode: 'BASIC',
      }),
    );
    await subscriber.onApplicationRejected(
      EventBus.createEvent('ApplicationRejected', {
        applicationId: 'app-2',
        contactPhone: '13800000002',
        rejectReason: '证照不清晰',
      }),
    );

    expect(notify.notifyTenantApproved).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', ownerUsername: '13800000001' }),
    );
    expect(notify.notifyApplicationRejected).toHaveBeenCalledWith({
      applicationId: 'app-2',
      contactPhone: '13800000002',
      rejectReason: '证照不清晰',
    });
  });
});
