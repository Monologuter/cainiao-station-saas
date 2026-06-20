import { SlotReleaseSubscriber } from './slot-release.subscriber';

describe('SlotReleaseSubscriber', () => {
  it('releases slot on ParcelPickedUp event', async () => {
    const allocator = { release: jest.fn() };
    const subscriber = new SlotReleaseSubscriber(
      { subscribe: jest.fn() } as any,
      allocator as any,
    );

    await subscriber.onParcelPickedUp({
      name: 'ParcelPickedUp',
      eventId: 'e1',
      occurredAt: new Date(),
      payload: { parcelId: 'p1', slotId: 'slot1' },
    });

    expect(allocator.release).toHaveBeenCalledWith('slot1', 'p1');
  });

  it('releases slot on ParcelMarkedException event as an idempotent fallback', async () => {
    const allocator = { release: jest.fn() };
    const subscriber = new SlotReleaseSubscriber(
      { subscribe: jest.fn() } as any,
      allocator as any,
    );

    await subscriber.onParcelMarkedException({
      name: 'ParcelMarkedException',
      eventId: 'e1',
      occurredAt: new Date(),
      payload: { parcelId: 'p1', slotId: 'slot1' },
    });

    expect(allocator.release).toHaveBeenCalledWith('slot1', 'p1');
  });

  it('ignores event without slot id', async () => {
    const allocator = { release: jest.fn() };
    const subscriber = new SlotReleaseSubscriber(
      { subscribe: jest.fn() } as any,
      allocator as any,
    );

    await subscriber.onParcelPickedUp({
      name: 'ParcelPickedUp',
      eventId: 'e1',
      occurredAt: new Date(),
      payload: { parcelId: 'p1', slotId: null },
    });

    expect(allocator.release).not.toHaveBeenCalled();
  });

  it('subscribes to picked up, returned and exception events on module init', () => {
    const eventBus = { subscribe: jest.fn() };
    const subscriber = new SlotReleaseSubscriber(
      eventBus as any,
      { release: jest.fn() } as any,
    );

    subscriber.onModuleInit();

    expect(eventBus.subscribe).toHaveBeenCalledWith(
      'ParcelPickedUp',
      expect.any(Function),
    );
    expect(eventBus.subscribe).toHaveBeenCalledWith(
      'ParcelReturned',
      expect.any(Function),
    );
    expect(eventBus.subscribe).toHaveBeenCalledWith(
      'ParcelMarkedException',
      expect.any(Function),
    );
  });
});
