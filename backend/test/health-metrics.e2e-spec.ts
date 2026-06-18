import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';

describe('Health and metrics e2e', () => {
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

  it('exposes live and ready health checks with request id propagation', async () => {
    const live = await request(app.getHttpServer())
      .get('/api/health/live')
      .set('X-Request-Id', 'trace-health-1')
      .expect(200);

    expect(live.headers['x-request-id']).toBe('trace-health-1');
    expect(live.body.data).toEqual({ status: 'ok' });

    const ready = await request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(200);
    expect(ready.body.data).toMatchObject({
      status: 'ok',
      checks: {
        postgres: 'up',
        redis: 'up',
      },
    });
  });

  it('exposes prometheus metrics including http request counters', async () => {
    await request(app.getHttpServer()).get('/api/health/live').expect(200);

    const metrics = await request(app.getHttpServer())
      .get('/api/metrics')
      .expect(200);

    expect(metrics.text).toContain('http_requests_total');
    expect(metrics.text).toContain('http_request_duration_seconds_count');
  });
});
