import { DomainEvent, EventBus } from '../../core/event-bus/event-bus';
import { PARCEL_OVERDUE_NOTIFY_JOB } from './notify-queue.constants';
import { OverdueSubscriber } from './overdue.subscriber';

describe('OverdueSubscriber', () => {
  it('subscribes to ParcelOverdueDetected', () => {
    const eventBus = {
      subscribe: jest.fn(),
    } as unknown as jest.Mocked<EventBus>;
    const queue = { add: jest.fn() } as any;
    const subscriber = new OverdueSubscriber(eventBus, queue);

    subscriber.onModuleInit();

    expect(eventBus.subscribe).toHaveBeenCalledWith(
      'ParcelOverdueDetected',
      expect.any(Function),
    );
  });

  it('enqueues overdue notification with retry options', async () => {
    const eventBus = { subscribe: jest.fn() } as any;
    const queue = { add: jest.fn().mockResolvedValue(undefined) } as any;
    const subscriber = new OverdueSubscriber(eventBus, queue);

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

    expect(queue.add).toHaveBeenCalledWith(
      PARCEL_OVERDUE_NOTIFY_JOB,
      expect.objectContaining({ tenantId: 't1', parcelId: 'p1', level: 3 }),
      expect.objectContaining({
        attempts: 5,
        jobId: 'parcel-overdue__t1__p1__3',
      }),
    );
  });
});
