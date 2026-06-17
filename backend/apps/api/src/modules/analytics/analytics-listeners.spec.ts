import { EventBus } from '../../core/event-bus/event-bus';
import {
  ParcelLifecycleAnalyticsListener,
  ParcelStoredAnalyticsListener,
  ShipOrderAnalyticsListener,
} from './listeners/analytics.listeners';

function event(name: string, payload: Record<string, unknown>) {
  return EventBus.createEvent(name, payload) as any;
}

describe('analytics event listeners', () => {
  it('collects ParcelStored into counters, stored snapshot, overdue rank and heatmap', async () => {
    const metrics = {
      incr: jest.fn().mockResolvedValue({ skipped: false, value: 1 }),
      adjustStored: jest.fn().mockResolvedValue(8),
      addOverdueCandidate: jest.fn(),
      adjustHeat: jest.fn(),
    };
    const publisher = {
      publishMetric: jest.fn(),
      publishParcelStored: jest.fn(),
    };
    const listener = new ParcelStoredAnalyticsListener(
      { subscribe: jest.fn() } as any,
      metrics as any,
      publisher as any,
    );

    await listener.onParcelStored(
      event('ParcelStored', {
        tenantId: 't1',
        stationId: 's1',
        parcelId: 'p1',
        slotCode: 'A-01-01-01',
      }),
    );

    expect(metrics.incr).toHaveBeenCalledWith({
      tenantId: 't1',
      stationId: 's1',
      metric: 'inbound',
      by: 1,
      eventId: expect.any(String),
      at: expect.any(Date),
    });
    expect(metrics.adjustStored).toHaveBeenCalledWith({
      tenantId: 't1',
      stationId: 's1',
      delta: 1,
    });
    expect(metrics.addOverdueCandidate).toHaveBeenCalledWith({
      tenantId: 't1',
      stationId: 's1',
      parcelId: 'p1',
      at: expect.any(Date),
    });
    expect(metrics.adjustHeat).toHaveBeenCalledWith({
      tenantId: 't1',
      stationId: 's1',
      shelfCode: 'A',
      delta: 1,
    });
    expect(publisher.publishParcelStored).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        stationId: 's1',
        parcelId: 'p1',
      }),
    );
  });

  it('collects pickup and returned events by decrementing stored snapshot', async () => {
    const metrics = {
      incr: jest.fn().mockResolvedValue({ skipped: false, value: 1 }),
      adjustStored: jest.fn().mockResolvedValue(4),
      removeOverdueCandidate: jest.fn(),
      adjustHeatBySlotId: jest.fn(),
    };
    const publisher = { publishMetric: jest.fn() };
    const listener = new ParcelLifecycleAnalyticsListener(
      { subscribe: jest.fn() } as any,
      metrics as any,
      publisher as any,
    );

    await listener.onParcelPickedUp(
      event('ParcelPickedUp', {
        tenantId: 't1',
        stationId: 's1',
        parcelId: 'p1',
        slotId: 'slot-1',
      }),
    );
    await listener.onParcelReturned(
      event('ParcelReturned', {
        tenantId: 't1',
        stationId: 's1',
        parcelId: 'p2',
        slotId: 'slot-2',
      }),
    );

    expect(metrics.incr).toHaveBeenCalledWith(
      expect.objectContaining({
        metric: 'pickup',
        eventId: expect.any(String),
      }),
    );
    expect(metrics.incr).toHaveBeenCalledWith(
      expect.objectContaining({
        metric: 'returned',
        eventId: expect.any(String),
      }),
    );
    expect(metrics.adjustStored).toHaveBeenCalledTimes(2);
    expect(metrics.removeOverdueCandidate).toHaveBeenCalledWith({
      tenantId: 't1',
      stationId: 's1',
      parcelId: 'p1',
    });
  });

  it('collects paid shipping orders into paid count and gmv', async () => {
    const metrics = { incr: jest.fn() };
    const publisher = { publishMetric: jest.fn() };
    const listener = new ShipOrderAnalyticsListener(
      { subscribe: jest.fn() } as any,
      metrics as any,
      publisher as any,
    );

    await listener.onShipOrderPaid(
      event('ShipOrderPaid', {
        tenantId: 't1',
        stationId: 's1',
        shipOrderId: 'so1',
        amount: 1200,
      }),
    );

    expect(metrics.incr).toHaveBeenCalledWith(
      expect.objectContaining({ metric: 'ship_paid', by: 1 }),
    );
    expect(metrics.incr).toHaveBeenCalledWith(
      expect.objectContaining({ metric: 'ship_gmv', by: 1200 }),
    );
  });
});
