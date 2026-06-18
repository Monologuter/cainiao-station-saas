import { EventBus } from '../event-bus/event-bus';
import { IdempotencyService } from './idempotency.service';

describe('IdempotencyService', () => {
  it('executes concurrent requests with the same key once and returns the same result', async () => {
    const service = new IdempotencyService();
    const worker = jest.fn().mockResolvedValue({ id: 'result-1' });

    const [first, second] = await Promise.all([
      service.runOnce('request:pay:1', worker),
      service.runOnce('request:pay:1', worker),
    ]);

    expect(worker).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(first).toEqual({ id: 'result-1' });
  });

  it('lets different keys execute independently', async () => {
    const service = new IdempotencyService();
    const worker = jest.fn((value: string) => Promise.resolve(value));

    await Promise.all([
      service.runOnce('event:a', () => worker('a')),
      service.runOnce('event:b', () => worker('b')),
    ]);

    expect(worker).toHaveBeenCalledTimes(2);
  });
});

describe('EventBus idempotency integration', () => {
  it('dedups repeated event delivery per handler and event id', async () => {
    const idempotency = new IdempotencyService();
    const bus = new EventBus(idempotency);
    const handler = jest.fn();
    bus.subscribe('ParcelPickedUp', handler);

    const event = {
      name: 'ParcelPickedUp',
      payload: { parcelId: 'p1' },
      occurredAt: new Date(),
      eventId: 'evt-1',
    };
    await bus.publish(event);
    await bus.publish(event);

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
