import { EventBus } from '../../core/event-bus/event-bus';
import {
  APPLICATION_REJECTED_NOTIFY_JOB,
  TENANT_APPROVED_NOTIFY_JOB,
} from './notify-queue.constants';
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

  it('enqueues approved and rejected events for queued delivery', async () => {
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const subscriber = new OnboardingSubscriber(
      { subscribe: jest.fn() } as any,
      queue as any,
    );

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

    expect(queue.add).toHaveBeenCalledWith(
      TENANT_APPROVED_NOTIFY_JOB,
      expect.objectContaining({
        tenantId: 'tenant-1',
        ownerUsername: '13800000001',
      }),
      expect.objectContaining({
        attempts: 5,
        jobId: 'tenant-approved__tenant-1__app-1',
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      APPLICATION_REJECTED_NOTIFY_JOB,
      {
        applicationId: 'app-2',
        contactPhone: '13800000002',
        rejectReason: '证照不清晰',
      },
      expect.objectContaining({
        attempts: 5,
        jobId: 'application-rejected__app-2',
      }),
    );
  });
});
