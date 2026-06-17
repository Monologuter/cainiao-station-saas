import { RuntimeConfigService } from './runtime-config.service';
import { SystemConfigService } from './system-config.service';

describe('RuntimeConfigService', () => {
  const originalEnv = process.env.CAINIAO_CONFIG_NOTIFY_SMS_DAILY_LIMIT;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CAINIAO_CONFIG_NOTIFY_SMS_DAILY_LIMIT;
    } else {
      process.env.CAINIAO_CONFIG_NOTIFY_SMS_DAILY_LIMIT = originalEnv;
    }
  });

  it('resolves values by env over db over default and caches reads', async () => {
    const tx = {
      $executeRawUnsafe: jest.fn(),
      systemConfig: {
        findUnique: jest.fn().mockResolvedValue({
          configKey: 'notify.sms.daily_limit',
          value: 5000,
          defaultValue: 1000,
          valueType: 'NUMBER',
        }),
      },
    };
    const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
    const runtime = new RuntimeConfigService(prisma as any);

    process.env.CAINIAO_CONFIG_NOTIFY_SMS_DAILY_LIMIT = '7000';

    await expect(runtime.get('notify.sms.daily_limit')).resolves.toBe(7000);
    await expect(runtime.get('notify.sms.daily_limit')).resolves.toBe(7000);
    expect(tx.systemConfig.findUnique).toHaveBeenCalledTimes(1);

    delete process.env.CAINIAO_CONFIG_NOTIFY_SMS_DAILY_LIMIT;
    runtime.invalidate('notify.sms.daily_limit');
    await expect(runtime.get('notify.sms.daily_limit')).resolves.toBe(5000);
  });
});

describe('SystemConfigService', () => {
  it('rejects updates to non-editable configs and invalidates cache after updates', async () => {
    const tx = {
      $executeRawUnsafe: jest.fn(),
      systemConfig: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            configKey: 'security.jwt.expires_in',
            editable: false,
          })
          .mockResolvedValueOnce({
            configKey: 'notify.sms.daily_limit',
            editable: true,
          }),
        update: jest.fn().mockResolvedValue({ value: 6000 }),
      },
    };
    const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
    const runtime = {
      invalidate: jest.fn(),
      get: jest.fn().mockResolvedValue(6000),
    };
    const service = new SystemConfigService(prisma as any, runtime as any);

    await expect(
      service.update('security.jwt.expires_in', { value: '30d' }, 'user-1'),
    ).rejects.toMatchObject({ code: 1001 });

    await expect(
      service.update('notify.sms.daily_limit', { value: 6000 }, 'user-1'),
    ).resolves.toMatchObject({ value: 6000 });
    expect(runtime.invalidate).toHaveBeenCalledWith('notify.sms.daily_limit');
  });
});
