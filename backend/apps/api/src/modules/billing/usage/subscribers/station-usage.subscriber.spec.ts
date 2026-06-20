import { EventBus } from '../../../../core/event-bus/event-bus';
import { StationUsageSubscriber } from './station-usage.subscriber';

describe('StationUsageSubscriber', () => {
  it('meters created stations into EXTRA_STATIONS usage with the domain event id as dedup key', async () => {
    const usage = {
      meter: jest.fn().mockResolvedValue({ counted: true }),
    };
    const subscriber = new StationUsageSubscriber(
      { subscribe: jest.fn() } as any,
      usage as any,
    );
    const event = EventBus.createEvent('StationCreated', {
      tenantId: 'tenant-1',
      stationId: 'station-2',
    });

    await subscriber.onStationCreated(event);

    expect(usage.meter).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      eventId: event.eventId,
      metric: 'EXTRA_STATIONS',
      quantity: 1,
      eventAt: event.occurredAt,
    });
  });
});
