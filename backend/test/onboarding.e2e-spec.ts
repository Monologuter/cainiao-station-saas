import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { PrismaService } from '../apps/api/src/core/prisma/prisma.service';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';

describe('Onboarding full flow e2e', () => {
  let app: INestApplication;
  const prisma = new PrismaService();

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
    await prisma.$connect();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('submits, approves, provisions tenant login and starts subscription', async () => {
    const adminToken = await login('admin', 'admin123456');
    const suffix = Date.now().toString().slice(-8);
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
  });

  it('rejects an application and allows the same phone to reapply', async () => {
    const adminToken = await login('admin', 'admin123456');
    const suffix = Date.now().toString().slice(-8);
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
    expect(list.body.data.items).toHaveLength(1);
    return list.body.data.items[0].id as string;
  }

  async function readTempPassword(tenantId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      const notification = await tx.notification.findFirstOrThrow({
        where: {
          tenantId,
          templateCode: 'TENANT_APPROVED',
          channel: 'SMS',
        },
        orderBy: { createdAt: 'desc' },
      });
      const match = notification.content.match(/初始密码([A-Za-z0-9]+)/);
      expect(match?.[1]).toBeTruthy();
      return match![1];
    });
  }
});
