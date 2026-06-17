import { Logger } from '@nestjs/common';
import { EventBus } from './event-bus';

describe('EventBus', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('publishes events to all subscribers', async () => {
    const bus = new EventBus();
    const calls: string[] = [];
    const event = {
      name: 'ParcelStored',
      payload: { parcelId: 'p1' },
      occurredAt: new Date(),
      eventId: 'e1',
    };

    bus.subscribe('ParcelStored', async () => {
      calls.push('first');
    });
    bus.subscribe('ParcelStored', async () => {
      calls.push('second');
    });

    await bus.publish(event);

    expect(calls).toEqual(['first', 'second']);
  });

  it('isolates subscriber errors from other subscribers and publisher', async () => {
    const bus = new EventBus();
    const calls: string[] = [];
    const event = {
      name: 'ParcelStored',
      payload: { parcelId: 'p1' },
      occurredAt: new Date(),
      eventId: 'e2',
    };

    bus.subscribe('ParcelStored', async () => {
      throw new Error('boom');
    });
    bus.subscribe('ParcelStored', async () => {
      calls.push('survived');
    });

    await expect(bus.publish(event)).resolves.toBeUndefined();
    expect(calls).toEqual(['survived']);
  });

  it('lets subscribers apply idempotency with eventId', async () => {
    const bus = new EventBus();
    const handled = new Set<string>();
    let count = 0;
    const event = {
      name: 'ParcelStored',
      payload: { parcelId: 'p1' },
      occurredAt: new Date(),
      eventId: 'same-event',
    };

    bus.subscribe('ParcelStored', async (incoming) => {
      if (handled.has(incoming.eventId)) return;
      handled.add(incoming.eventId);
      count += 1;
    });

    await bus.publish(event);
    await bus.publish(event);

    expect(count).toBe(1);
  });
});
