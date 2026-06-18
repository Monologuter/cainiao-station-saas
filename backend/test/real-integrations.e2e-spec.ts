import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';
import { IntegrationConfigService } from '../apps/api/src/modules/config/integration-config.service';
import { KuaiDi100Provider } from '../apps/api/src/modules/logistics/kuaidi100.provider';
import { LogisticsProviderFactory } from '../apps/api/src/modules/logistics/logistics-provider.factory';
import { MockLogisticsProvider } from '../apps/api/src/modules/logistics/mock-logistics.provider';
import { InAppChannel } from '../apps/api/src/modules/notify/in-app.channel';
import { MockSmsChannel } from '../apps/api/src/modules/notify/mock-sms.channel';
import { SmsChannelFactory } from '../apps/api/src/modules/notify/sms-channel.factory';
import { TencentSmsChannel } from '../apps/api/src/modules/notify/tencent-sms.channel';
import { WechatSubscribeChannel } from '../apps/api/src/modules/notify/wechat-subscribe.channel';
import { WechatSubscribeChannelFactory } from '../apps/api/src/modules/notify/wechat-subscribe.factory';
import { MockPayChannel } from '../apps/api/src/modules/pay/mock-pay.channel';
import { PayChannelFactory } from '../apps/api/src/modules/pay/pay-channel.factory';
import { WechatPayChannel } from '../apps/api/src/modules/pay/wechat-pay.channel';

describe('Real integrations switchboard e2e', () => {
  let app: INestApplication;
  const wechatAuthMigration = join(
    __dirname,
    '../prisma/migrations/20260618233000_wechat_subscribe_authorizations/migration.sql',
  );
  const envExample = join(__dirname, '../.env.example');

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(() => app.close());

  it('keeps every real integration safely on mock by default in dev/test', async () => {
    const integrations = app.get(IntegrationConfigService);

    await expect(integrations.resolve('sms')).resolves.toMatchObject({
      provider: 'mock',
    });
    await expect(integrations.resolve('wechat')).resolves.toMatchObject({
      provider: 'mock',
    });
    await expect(integrations.resolve('pay')).resolves.toMatchObject({
      provider: 'mock',
    });
    await expect(integrations.resolve('logistics')).resolves.toMatchObject({
      provider: 'mock',
    });
  });

  it('selects stubbed real providers when switchboard resolves real channels', async () => {
    const real = (provider: string) =>
      ({ provider, degraded: false }) as Awaited<
        ReturnType<IntegrationConfigService['resolve']>
      >;

    await expect(
      new SmsChannelFactory(
        { resolve: jest.fn().mockResolvedValue(real('tencent')) } as any,
        app.get(MockSmsChannel),
        app.get(TencentSmsChannel),
      ).get(),
    ).resolves.toBeInstanceOf(TencentSmsChannel);

    await expect(
      new WechatSubscribeChannelFactory(
        { resolve: jest.fn().mockResolvedValue(real('wechat')) } as any,
        app.get(InAppChannel),
        app.get(WechatSubscribeChannel),
      ).get(),
    ).resolves.toBeInstanceOf(WechatSubscribeChannel);

    await expect(
      new LogisticsProviderFactory(
        { resolve: jest.fn().mockResolvedValue(real('kuaidi100')) } as any,
        app.get(MockLogisticsProvider),
        app.get(KuaiDi100Provider),
      ).get(),
    ).resolves.toBeInstanceOf(KuaiDi100Provider);

    await expect(
      new PayChannelFactory(
        { resolve: jest.fn().mockResolvedValue(real('wechat')) } as any,
        app.get(MockPayChannel),
        app.get(WechatPayChannel),
      ).get(),
    ).resolves.toBeInstanceOf(WechatPayChannel);
  });

  it('degrades real env toggles without required credentials', async () => {
    const integrations = new IntegrationConfigService();
    const previous = process.env.PAY_PROVIDER;
    const previousKey = process.env.WXPAY_API_V3_KEY;
    process.env.PAY_PROVIDER = 'wechat';
    delete process.env.WXPAY_API_V3_KEY;

    await expect(integrations.resolve('pay')).resolves.toMatchObject({
      provider: 'mock',
      degraded: true,
    });

    if (previous === undefined) {
      delete process.env.PAY_PROVIDER;
    } else {
      process.env.PAY_PROVIDER = previous;
    }
    if (previousKey === undefined) {
      delete process.env.WXPAY_API_V3_KEY;
    } else {
      process.env.WXPAY_API_V3_KEY = previousKey;
    }
  });

  it('documents real provider toggles and secret placeholders', () => {
    const env = readFileSync(envExample, 'utf8');

    for (const key of [
      'NOTIFY_SMS_PROVIDER',
      'NOTIFY_WECHAT_PROVIDER',
      'LOGISTICS_PROVIDER',
      'PAY_PROVIDER',
      'TENCENT_SMS_SECRET_ID',
      'WECHAT_APP_ID',
      'KUAIDI100_KEY',
      'WXPAY_API_V3_KEY',
    ]) {
      expect(env).toContain(key);
    }
  });

  it('declares wechat subscribe authorizations with tenant RLS', () => {
    expect(existsSync(wechatAuthMigration)).toBe(true);
    const sql = readFileSync(wechatAuthMigration, 'utf8');

    expect(sql).toContain("ADD VALUE IF NOT EXISTS 'WECHAT'");
    expect(sql).toContain('CREATE TABLE "wechat_subscribe_authorizations"');
    expect(sql).toContain('"tenant_id" UUID NOT NULL');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
    expect(sql).toContain(
      'CREATE POLICY "wechat_subscribe_authorizations_tenant_isolation"',
    );
  });
});
