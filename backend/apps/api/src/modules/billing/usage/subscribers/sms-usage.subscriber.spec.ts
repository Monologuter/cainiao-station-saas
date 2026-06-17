import { EventBus } from '../../../../core/event-bus/event-bus';
import { ApiCode, BizError } from '../../../../core/http/api-code';
import { SmsUsageSubscriber } from './sms-usage.subscriber';

describe('SmsUsageSubscriber', () => {
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
