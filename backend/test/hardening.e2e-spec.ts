import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { ApiCode } from '../apps/api/src/core/http/api-code';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';

describe('P3-4 hardening smoke e2e', () => {
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

  it('exposes health and metrics', async () => {
    await request(app.getHttpServer()).get('/api/health/live').expect(200);
    await request(app.getHttpServer()).get('/api/health/ready').expect(200);
    const metrics = await request(app.getHttpServer())
      .get('/api/metrics')
      .expect(200);
    expect(metrics.text).toContain('http_requests_total');
  });

  it('triggers login rate limiting', async () => {
    const payload = {
      username: `hardening-${Date.now()}`,
      password: 'wrong123',
    };
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
    expect(limited.body.code).toBe(ApiCode.RATE_LIMITED);
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('rotates refresh tokens', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123456' })
      .expect(201);
    const refreshed = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.data.refreshToken })
      .expect(201);

    expect(refreshed.body.data.refreshToken).toBeDefined();
    expect(refreshed.body.data.refreshToken).not.toBe(
      login.body.data.refreshToken,
    );
  });

  it('invalidates dictionary cache after writes', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123456' })
      .expect(201);
    const token = login.body.data.accessToken;
    const code = `HARDEN_${Date.now()}`;

    await request(app.getHttpServer())
      .get('/api/dict/exception_type')
      .expect(200);
    const created = await request(app.getHttpServer())
      .post('/api/admin/config/dictionaries/exception_type/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ code, label: '加固冒烟' })
      .expect(201);

    const visible = await request(app.getHttpServer())
      .get('/api/dict/exception_type')
      .expect(200);
    expect(visible.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );

    await request(app.getHttpServer())
      .patch(`/api/admin/config/dict-items/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: false })
      .expect(200);

    const hidden = await request(app.getHttpServer())
      .get('/api/dict/exception_type')
      .expect(200);
    expect(hidden.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );
  });
});
