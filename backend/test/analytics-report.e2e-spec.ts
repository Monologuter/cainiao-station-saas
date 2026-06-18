import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getTestApp, closeTestApp } from './setup';

describe('Analytics report e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(() => closeTestApp());

  it('creates a report, marks it done, and isolates job reads by tenant', async () => {
    const adminToken = await login('admin', 'admin123456');
    const boss = await openTenant(adminToken, 'report-main');
    const otherBoss = await openTenant(adminToken, 'report-other');

    const created = await request(app.getHttpServer())
      .post('/api/analytics/reports')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({
        type: 'daily_summary',
        format: 'csv',
        from: today(),
        to: today(),
        stationId: boss.stationId,
      })
      .expect(201);

    expect(created.body.data).toMatchObject({
      jobId: expect.any(String),
      status: 'PENDING',
    });

    const job = await request(app.getHttpServer())
      .get(`/api/analytics/reports/${created.body.data.jobId}`)
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);
    expect(job.body.data).toMatchObject({
      id: created.body.data.jobId,
      status: 'DONE',
      downloadUrl: expect.stringContaining('mock://download/reports/'),
    });
    expect(job.body.data.downloadUrl).toMatch(/\.csv$/);

    const denied = await request(app.getHttpServer())
      .get(`/api/analytics/reports/${created.body.data.jobId}`)
      .set('Authorization', `Bearer ${otherBoss.token}`)
      .expect(200);
    expect(denied.body.code).toBe(1004);
  });

  async function login(username: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(201);
    return res.body.data.accessToken as string;
  }

  async function openTenant(adminToken: string, suffix: string) {
    const phone = `134${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `报表驿站${suffix}`,
        ownerName: '报表店长',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);
    const token = await login(phone, 'pw123456');
    return {
      stationId: open.body.data.stationId as string,
      token,
    };
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }
});
