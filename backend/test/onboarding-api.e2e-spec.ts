import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getTestApp, uniqueSuffix, closeTestApp } from './setup';

describe('Onboarding API e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(() => closeTestApp());

  it('accepts public applications and lets platform review them with permissions', async () => {
    const suffix = uniqueSuffix();
    const phone = `134${suffix}`;
    const adminToken = await login('admin', 'admin123456');
    const planCode = `ONBOARD${suffix}`;
    await request(app.getHttpServer())
      .post('/api/billing/plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: planCode,
        name: '入驻测试套餐',
        monthlyPrice: 9900,
        quotas: { sms: 100, parcels: -1, stations: 1 },
        overagePrices: { sms: 10, parcels: 0, stations: 19900 },
      })
      .expect(201);

    const upload = await request(app.getHttpServer())
      .post('/api/onboarding/qualifications/upload-url')
      .send({ fileType: 'BUSINESS_LICENSE', contentType: 'image/jpeg' })
      .expect(201);
    expect(upload.body.data.fileKey).toContain('onboarding/');

    const submitted = await request(app.getHttpServer())
      .post('/api/onboarding/applications')
      .send(companyApplication(phone, upload.body.data.fileKey, planCode))
      .expect(201);
    expect(submitted.body.data).toMatchObject({ status: 'PENDING' });

    const tracked = await request(app.getHttpServer())
      .get('/api/onboarding/applications/track')
      .query({
        applicationNo: submitted.body.data.applicationNo,
        contactPhone: phone,
      })
      .expect(200);
    expect(tracked.body.data).toEqual({
      applicationNo: submitted.body.data.applicationNo,
      status: 'PENDING',
      rejectReason: null,
    });

    const list = await request(app.getHttpServer())
      .get('/api/admin/applications')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ status: 'PENDING', keyword: phone })
      .expect(200);
    const applicationId = findByPhone(list.body.data.items, phone);

    const detail = await request(app.getHttpServer())
      .get(`/api/admin/applications/${applicationId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(detail.body.data.qualifications[0].downloadUrl).toContain(
      'mock://download/',
    );

    const boss = await openTenant(adminToken);
    const denied = await request(app.getHttpServer())
      .post(`/api/admin/applications/${applicationId}/reject`)
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ rejectReason: '越权审核' })
      .expect(200);
    expect(denied.body.code).toBe(1003);

    const approved = await request(app.getHttpServer())
      .post(`/api/admin/applications/${applicationId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ planCode, stationName: '审核通过驿站' })
      .expect(201);
    expect(approved.body.data).toMatchObject({
      tenantId: expect.any(String),
      ownerUsername: phone,
    });

    const rejectPhone = `133${suffix}`;
    const rejectedApplication = await request(app.getHttpServer())
      .post('/api/onboarding/applications')
      .send(companyApplication(rejectPhone, upload.body.data.fileKey, planCode))
      .expect(201);
    const rejectList = await request(app.getHttpServer())
      .get('/api/admin/applications')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ keyword: rejectPhone })
      .expect(200);
    await request(app.getHttpServer())
      .post(
        `/api/admin/applications/${findByPhone(
          rejectList.body.data.items,
          rejectPhone,
        )}/reject`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rejectReason: '证照不清晰' })
      .expect(201);
    const rejectedTrack = await request(app.getHttpServer())
      .get('/api/onboarding/applications/track')
      .query({
        applicationNo: rejectedApplication.body.data.applicationNo,
        contactPhone: rejectPhone,
      })
      .expect(200);
    expect(rejectedTrack.body.data).toMatchObject({
      status: 'REJECTED',
      rejectReason: '证照不清晰',
    });
  }, 15000);

  // The admin list keyword search is a substring `contains`; the suite does not
  // truncate between runs, so filter to the exact phone (which uniqueSuffix()
  // keeps unique) instead of relying on the list having exactly one row.
  function findByPhone(
    items: Array<{ id: string; contactPhone: string }>,
    phone: string,
  ): string {
    const matches = items.filter((item) => item.contactPhone === phone);
    expect(matches).toHaveLength(1);
    return matches[0].id;
  }

  async function login(username: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(201);
    return res.body.data.accessToken as string;
  }

  async function openTenant(adminToken: string) {
    const phone = `132${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: '入驻权限测试驿站',
        ownerName: '权限店长',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);
    return { token: await login(phone, 'pw123456') };
  }

  function companyApplication(
    phone: string,
    fileKey: string,
    proposedPlanCode: string,
  ) {
    return {
      entityType: 'COMPANY',
      entityName: `入驻测试主体${phone.slice(-4)}`,
      unifiedCreditCode: `91310000${phone.slice(-8)}`,
      regionCode: '310000',
      contactName: '入驻联系人',
      contactPhone: phone,
      contactEmail: 'apply@example.com',
      stationName: '自助申请驿站',
      stationAddress: '上海市测试路 1 号',
      proposedPlanCode,
      qualifications: [
        { type: 'BUSINESS_LICENSE', fileKey, fileName: 'license.jpg' },
      ],
    };
  }
});
