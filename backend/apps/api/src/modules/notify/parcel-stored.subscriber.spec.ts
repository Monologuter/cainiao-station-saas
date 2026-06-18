import type { Queue } from 'bullmq';
import { DomainEvent, EventBus } from '../../core/event-bus/event-bus';
import { PARCEL_STORED_NOTIFY_JOB } from './notify-queue.constants';
import { ParcelStoredSubscriber } from './parcel-stored.subscriber';

describe('ParcelStoredSubscriber', () => {
  function buildEvent(): DomainEvent<any> {
    return {
      name: 'ParcelStored',
      eventId: 'e1',
      occurredAt: new Date(),
      payload: {
        parcelId: 'p1',
        tenantId: 't1',
        stationId: 's1',
        stationName: '城南驿站',
        receiverPhone: '13800000000',
        pickupCode: '1234',
        slotCode: 'A-01',
      },
    } as DomainEvent<any>;
  }

  it('subscribes to ParcelStored', () => {
    const eventBus = { subscribe: jest.fn() } as unknown as jest.Mocked<EventBus>;
    const queue = { add: jest.fn() } as unknown as Queue;

    new ParcelStoredSubscriber(eventBus, queue).onModuleInit();

    expect(eventBus.subscribe).toHaveBeenCalledWith(
      'ParcelStored',
      expect.any(Function),
    );
  });

  it('enqueues a notify job with retry + exponential backoff instead of sending inline', async () => {
    const eventBus = { subscribe: jest.fn() } as any;
    const queue = { add: jest.fn().mockResolvedValue(undefined) } as unknown as Queue;
    const subscriber = new ParcelStoredSubscriber(eventBus, queue);

    await subscriber.onParcelStored(buildEvent());

    expect(queue.add).toHaveBeenCalledTimes(1);
    const [jobName, data, opts] = (queue.add as jest.Mock).mock.calls[0];
    expect(jobName).toBe(PARCEL_STORED_NOTIFY_JOB);
    expect(data).toMatchObject({
      parcelId: 'p1',
      tenantId: 't1',
      stationId: 's1',
      receiverPhone: '13800000000',
      pickupCode: '1234',
      slotCode: 'A-01',
    });
    // Reliability contract: never drop on first failure — retry with backoff.
    expect(opts).toMatchObject({
      attempts: 5,
      backoff: { type: 'exponential' },
    });
  });

  it('uses a stable parcel-scoped jobId so redelivered events do not double-enqueue', async () => {
    const eventBus = { subscribe: jest.fn() } as any;
    const queue = { add: jest.fn().mockResolvedValue(undefined) } as unknown as Queue;
    const subscriber = new ParcelStoredSubscriber(eventBus, queue);

    await subscriber.onParcelStored(buildEvent());

    const [, , opts] = (queue.add as jest.Mock).mock.calls[0];
    expect(opts.jobId).toBe('parcel-stored:t1:p1');
  });
});
