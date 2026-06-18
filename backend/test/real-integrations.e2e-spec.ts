import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';
import { IntegrationConfigService } from '../apps/api/src/modules/config/integration-config.service';

describe('Real integrations switchboard e2e', () => {
  let app: INestApplication;
  const wechatAuthMigration = join(
    __dirname,
    '../prisma/migrations/20260618233000_wechat_subscribe_authorizations/migration.sql',
  );

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
