import { DomainEvent, EventBus } from '../../core/event-bus/event-bus';
import { TenantContext } from '../../core/tenant-context/tenant-context';
import { NotifyService } from './notify.service';
import { OverdueSubscriber } from './overdue.subscriber';

describe('OverdueSubscriber', () => {
  it('subscribes to ParcelOverdueDetected', () => {
    const eventBus = {
      subscribe: jest.fn(),
    } as unknown as jest.Mocked<EventBus>;
    const notify = { notifyParcelOverdue: jest.fn() } as any;
    const subscriber = new OverdueSubscriber(eventBus, notify);

    subscriber.onModuleInit();

    expect(eventBus.subscribe).toHaveBeenCalledWith(
      'ParcelOverdueDetected',
      expect.any(Function),
    );
  });

  it('runs overdue notification in event tenant context', async () => {
    const eventBus = { subscribe: jest.fn() } as any;
    const notify = {
      notifyParcelOverdue: jest.fn(async () => {
        expect(TenantContext.get()?.tenantId).toBe('t1');
      }),
    } as unknown as jest.Mocked<NotifyService>;
    const subscriber = new OverdueSubscriber(eventBus, notify);

    await subscriber.onParcelOverdue({
      name: 'ParcelOverdueDetected',
      eventId: 'e1',
      occurredAt: new Date(),
      payload: {
        tenantId: 't1',
        parcelId: 'p1',
        stationId: 's1',
        level: 3,
        daysOverdue: 11,
        receiverPhone: '13800000000',
        pickupCode: '1234',
      },
    } as DomainEvent<any>);

    expect(notify.notifyParcelOverdue).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        parcelId: 'p1',
        level: 3,
      }),
    );
  });
});
