import { EventBus } from '../../../../core/event-bus/event-bus';
import { ApiCode, BizError } from '../../../../core/http/api-code';
import { SmsUsageSubscriber } from './sms-usage.subscriber';

describe('SmsUsageSubscriber', () => {
  it('meters real SMS billing quantity from notification events', async () => {
    const usage = {
      meter: jest.fn().mockResolvedValue({ id: 'usage-1' }),
    };
    const subscriber = new SmsUsageSubscriber(
      { subscribe: jest.fn() } as any,
      usage as any,
    );

    await subscriber.onSmsNotificationSent(
      EventBus.createEvent('SmsNotificationSent', {
        tenantId: 'tenant-1',
        stationId: 'station-1',
        usageEventId: 'notify:tenant-1:event-1',
        quantity: 2,
        sentAt: '2026-06-18T00:00:00.000Z',
      }),
    );

    expect(usage.meter).toHaveBeenCalledWith(
      expect.objectContaining({
        metric: 'SMS',
        quantity: 2,
      }),
    );
  });

  it('ignores SMS usage events when a tenant has no active subscription yet', async () => {
    const usage = {
      meter: jest
        .fn()
        .mockRejectedValue(new BizError(ApiCode.NOT_FOUND, '未找到有效订阅')),
    };
    const subscriber = new SmsUsageSubscriber(
      { subscribe: jest.fn() } as any,
      usage as any,
    );

    await expect(
      subscriber.onSmsNotificationSent(
        EventBus.createEvent('SmsNotificationSent', {
          tenantId: 'tenant-1',
          stationId: 'station-1',
          usageEventId: 'notify:tenant-1:event-1',
          sentAt: '2026-06-18T00:00:00.000Z',
        }),
      ),
    ).resolves.toBeUndefined();
  });
});
