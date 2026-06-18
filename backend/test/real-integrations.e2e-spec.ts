import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';
import { IntegrationConfigService } from '../apps/api/src/modules/config/integration-config.service';

describe('Real integrations switchboard e2e', () => {
  let app: INestApplication;

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
});
