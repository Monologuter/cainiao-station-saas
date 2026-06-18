import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';

describe('Billing plans e2e', () => {
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

  it('lets platform manage plans and tenants read active plans only', async () => {
    const adminToken = await login('admin', 'admin123456');
    const boss = await openTenant(adminToken);
    const code = `TIER${Date.now()}`;

    const created = await request(app.getHttpServer())
      .post('/api/billing/plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code,
        name: '运营测试版',
        monthlyPrice: 12300,
        quotas: { sms: 100, parcels: -1, stations: 1 },
        overagePrices: { sms: 9, parcels: 0, stations: 9900 },
      })
      .expect(201);
    expect(created.body.data).toMatchObject({ code, status: 'ACTIVE' });

    const visible = await request(app.getHttpServer())
      .get('/api/billing/plans')
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);
    expect(visible.body.data.map((plan: any) => plan.code)).toContain(code);

    await request(app.getHttpServer())
      .post(`/api/billing/plans/${created.body.data.id}/archive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const afterArchive = await request(app.getHttpServer())
      .get('/api/billing/plans')
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);
    expect(afterArchive.body.data.map((plan: any) => plan.code)).not.toContain(
      code,
    );

    const denied = await request(app.getHttpServer())
      .post('/api/billing/plans')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({
        code: `BAD${Date.now()}`,
        name: '越权版',
        monthlyPrice: 1,
        quotas: {},
        overagePrices: {},
      })
      .expect(200);
    expect(denied.body.code).toBe(1003);
  });

  it('rejects invalid plan price payloads before persistence', async () => {
    const adminToken = await login('admin', 'admin123456');
    const invalid = await request(app.getHttpServer())
      .post('/api/billing/plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `NEG${Date.now()}`,
        name: '非法套餐',
        monthlyPrice: -1,
        quotas: {},
        overagePrices: {},
      })
      .expect(400);
    expect(invalid.body.message).toContain('monthlyPrice');
  });

  async function login(username: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(201);
    return res.body.data.accessToken as string;
  }

  async function openTenant(adminToken: string) {
    const phone = `131${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: '计费套餐驿站',
        ownerName: '计费店长',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);
    const token = await login(phone, 'pw123456');
    return { token };
  }
});
