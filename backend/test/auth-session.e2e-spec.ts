import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { ApiCode } from '../apps/api/src/core/http/api-code';
import { getTestApp, closeTestApp } from './setup';

describe('Auth session hardening e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(() => closeTestApp());

  it('rotates refresh tokens and revokes all sessions on reuse detection', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123456' })
      .expect(201);
    const firstRefresh = login.body.data.refreshToken;
    expect(firstRefresh).toBeDefined();

    const refreshed = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: firstRefresh })
      .expect(201);
    const secondRefresh = refreshed.body.data.refreshToken;
    expect(secondRefresh).toBeDefined();
    expect(secondRefresh).not.toBe(firstRefresh);

    const reused = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: firstRefresh })
      .expect(200);
    expect(reused.body.code).toBe(ApiCode.UNAUTHORIZED);

    const revoked = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: secondRefresh })
      .expect(200);
    expect(revoked.body.code).toBe(ApiCode.UNAUTHORIZED);
  });

  it('logs out refresh sessions', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123456' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .send({ refreshToken: login.body.data.refreshToken })
      .expect(201);

    const refreshed = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.data.refreshToken })
      .expect(200);
    expect(refreshed.body.code).toBe(ApiCode.UNAUTHORIZED);
  });

  it('revokes old refresh tokens after password change', async () => {
    const admin = await login('admin', 'admin123456');
    const phone = `132${Date.now().toString().slice(-8)}`;
    await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: `改密租户${phone}`,
        ownerName: '改密店长',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);

    const boss = await login(phone, 'pw123456');
    await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${boss.accessToken}`)
      .send({ oldPassword: 'pw123456', newPassword: 'pw654321' })
      .expect(201);

    const oldAccess = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${boss.accessToken}`)
      .expect(200);
    expect(oldAccess.body.code).toBe(ApiCode.UNAUTHORIZED);

    const oldRefresh = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: boss.refreshToken })
      .expect(200);
    expect(oldRefresh.body.code).toBe(ApiCode.UNAUTHORIZED);

    const oldPassword = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: phone, password: 'pw123456' })
      .expect(200);
    expect(oldPassword.body.code).toBe(ApiCode.UNAUTHORIZED);

    const newPassword = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: phone, password: 'pw654321' })
      .expect(201);
    expect(newPassword.body.data.accessToken).toBeDefined();
  });

  async function login(username: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(201);
    return {
      accessToken: res.body.data.accessToken as string,
      refreshToken: res.body.data.refreshToken as string,
    };
  }
});
