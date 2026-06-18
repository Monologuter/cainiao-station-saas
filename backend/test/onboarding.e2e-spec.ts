import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import type { PrismaService } from '../apps/api/src/core/prisma/prisma.service';
import { getTestApp, getTestPrisma, uniqueSuffix, closeTestApp } from './setup';

describe('Onboarding full flow e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await getTestApp();
    prisma = getTestPrisma();
  });

  afterAll(() => closeTestApp());

  it('submits, approves, provisions tenant login and starts subscription', async () => {
    const adminToken = await login('admin', 'admin123456');
    const suffix = uniqueSuffix();
    const planCode = `FULLONBOARD${suffix}`;
    await createPlan(adminToken, planCode);

    const phone = `139${suffix}`;
    const submitted = await submitApplication(phone, planCode);
    const applicationId = await findApplication(adminToken, phone);

    const approved = await request(app.getHttpServer())
      .post(`/api/admin/applications/${applicationId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ planCode, stationName: '全链路审核驿站' })
      .expect(201)
      .then((res) => res.body.data);
    expect(approved).toMatchObject({
      tenantId: expect.any(String),
      ownerUsername: phone,
    });

    const tempPassword = await readTempPassword(approved.tenantId);
    const ownerToken = await login(phone, tempPassword);
    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(me.body.data.tenantId).toBe(approved.tenantId);

    const subscriptions = await request(app.getHttpServer())
      .get('/api/billing/subscriptions')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(subscriptions.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tenantId: approved.tenantId,
          status: 'ACTIVE',
        }),
      ]),
    );

    const tracked = await request(app.getHttpServer())
      .get('/api/onboarding/applications/track')
      .query({
        applicationNo: submitted.applicationNo,
        contactPhone: phone,
      })
      .expect(200);
    expect(tracked.body.data.status).toBe('APPROVED');
  }, 30000);

  it('rejects an application and allows the same phone to reapply', async () => {
    const adminToken = await login('admin', 'admin123456');
    const suffix = uniqueSuffix();
    const planCode = `REAPPLY${suffix}`;
    await createPlan(adminToken, planCode);
    const phone = `137${suffix}`;

    const first = await submitApplication(phone, planCode);
    const firstId = await findApplication(adminToken, phone);
    await request(app.getHttpServer())
      .post(`/api/admin/applications/${firstId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rejectReason: '证照不清晰' })
      .expect(201);

    const tracked = await request(app.getHttpServer())
      .get('/api/onboarding/applications/track')
      .query({ applicationNo: first.applicationNo, contactPhone: phone })
      .expect(200);
    expect(tracked.body.data).toMatchObject({
      status: 'REJECTED',
      rejectReason: '证照不清晰',
    });

    const second = await submitApplication(phone, planCode);
    expect(second.applicationNo).not.toBe(first.applicationNo);
    expect(second.status).toBe('PENDING');
  });

  async function login(username: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(201);
    return res.body.data.accessToken as string;
  }

  async function createPlan(adminToken: string, code: string) {
    await request(app.getHttpServer())
      .post('/api/billing/plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code,
        name: '入驻全链路套餐',
        monthlyPrice: 9900,
        quotas: { sms: 100, parcels: -1, stations: 1 },
        overagePrices: { sms: 10, parcels: 0, stations: 19900 },
      })
      .expect(201);
  }

  async function submitApplication(phone: string, planCode: string) {
    const upload = await request(app.getHttpServer())
      .post('/api/onboarding/qualifications/upload-url')
      .send({ fileType: 'BUSINESS_LICENSE', contentType: 'image/jpeg' })
      .expect(201);
    return request(app.getHttpServer())
      .post('/api/onboarding/applications')
      .send({
        entityType: 'COMPANY',
        entityName: `入驻全链路主体${phone.slice(-4)}`,
        unifiedCreditCode: `91310000${phone.slice(-8)}`,
        regionCode: '310000',
        contactName: '全链路联系人',
        contactPhone: phone,
        contactEmail: 'apply@example.com',
        stationName: '全链路申请驿站',
        stationAddress: '上海市测试路 1 号',
        proposedPlanCode: planCode,
        qualifications: [
          {
            type: 'BUSINESS_LICENSE',
            fileKey: upload.body.data.fileKey,
            fileName: 'license.jpg',
          },
        ],
      })
      .expect(201)
      .then((res) => res.body.data);
  }

  async function findApplication(adminToken: string, phone: string) {
    const list = await request(app.getHttpServer())
      .get('/api/admin/applications')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ keyword: phone })
      .expect(200);
    // Match by exact phone rather than asserting an exact list length: the
    // keyword search is a substring `contains`, so residue from prior runs (the
    // suite does not truncate) could surface extra rows. uniqueSuffix() makes
    // the phone unique, so exactly one row should carry it.
    const matches = (
      list.body.data.items as Array<{
        id: string;
        contactPhone: string;
      }>
    ).filter((item) => item.contactPhone === phone);
    expect(matches).toHaveLength(1);
    return matches[0].id;
  }

  async function readTempPassword(tenantId: string, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const notification = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.bypass_rls', 'on', true)`,
        );
        return tx.notification.findFirst({
          where: {
            tenantId,
            templateCode: 'TENANT_APPROVED',
            channel: 'SMS',
          },
          orderBy: { createdAt: 'desc' },
        });
      });
      const match = notification?.content.match(/初始密码([A-Za-z0-9]+)/);
      if (match?.[1]) {
        return match[1];
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('TENANT_APPROVED SMS notification was not delivered');
  }
});
