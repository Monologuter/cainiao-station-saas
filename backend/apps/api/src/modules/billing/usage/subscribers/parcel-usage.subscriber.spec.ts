import { EventBus } from '../../../../core/event-bus/event-bus';
import { ParcelUsageSubscriber } from './parcel-usage.subscriber';

describe('ParcelUsageSubscriber', () => {
  it('meters stored parcels into PARCELS usage with the domain event id as dedup key', async () => {
    const usage = {
      meter: jest.fn().mockResolvedValue({ counted: true }),
    };
    const subscriber = new ParcelUsageSubscriber(
      { subscribe: jest.fn() } as any,
      usage as any,
    );
    const event = EventBus.createEvent('ParcelStored', {
      tenantId: 'tenant-1',
      stationId: 'station-1',
      parcelId: 'parcel-1',
    });

    await subscriber.onParcelStored(event);

    expect(usage.meter).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      stationId: 'station-1',
      eventId: event.eventId,
      metric: 'PARCELS',
      quantity: 1,
      eventAt: event.occurredAt,
    });
  });
});
