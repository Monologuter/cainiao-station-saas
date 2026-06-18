import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { ApiCode } from '../apps/api/src/core/http/api-code';
import { getTestApp, closeTestApp } from './setup';

describe('Rate limit e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(() => closeTestApp());

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
