import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { ApiCode } from '../apps/api/src/core/http/api-code';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';

describe('Rate limit e2e', () => {
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

  it('limits repeated login attempts and returns Retry-After', async () => {
    const payload = { username: 'rate-limit-user', password: 'wrong123' };
    for (let i = 0; i < 10; i += 1) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send(payload)
        .expect(200);
    }

    const limited = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send(payload)
      .expect(200);

    expect(limited.headers['retry-after']).toBeDefined();
    expect(limited.body.code).toBe(ApiCode.RATE_LIMITED);
  });
});
