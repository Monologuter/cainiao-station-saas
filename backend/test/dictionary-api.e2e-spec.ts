import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';

describe('Dictionary API e2e', () => {
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

  it('lets platform operators manage dictionary items while public enum only returns enabled items', async () => {
    const adminToken = await login('admin', 'admin123456');
    const code = `QA_${Date.now()}`;

    const dictionaries = await request(app.getHttpServer())
      .get('/api/admin/config/dictionaries')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(dictionaries.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'exception_type',
          name: '异常类型',
        }),
      ]),
    );

    const created = await request(app.getHttpServer())
      .post('/api/admin/config/dictionaries/exception_type/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code,
        label: '质检异常',
        value: { severity: 'HIGH' },
        sort: 99,
      })
      .expect(201);
    expect(created.body.data).toMatchObject({
      code,
      label: '质检异常',
      enabled: true,
    });

    const duplicate = await request(app.getHttpServer())
      .post('/api/admin/config/dictionaries/exception_type/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code, label: '重复异常' })
      .expect(200);
    expect(duplicate.body.code).toBe(1001);

    const visible = await request(app.getHttpServer())
      .get('/api/dict/exception_type')
      .expect(200);
    expect(visible.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code, label: '质检异常' }),
      ]),
    );

    const updated = await request(app.getHttpServer())
      .patch(`/api/admin/config/dict-items/${created.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'SHOULD_NOT_CHANGE', label: '已禁用异常', enabled: false })
      .expect(200);
    expect(updated.body.data).toMatchObject({
      code,
      label: '已禁用异常',
      enabled: false,
    });

    const afterDisable = await request(app.getHttpServer())
      .get('/api/dict/exception_type')
      .expect(200);
    expect(afterDisable.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );
  });

  it('rejects tenant users from dictionary management', async () => {
    const adminToken = await login('admin', 'admin123456');
    const boss = await openTenant(adminToken);

    const denied = await request(app.getHttpServer())
      .post('/api/admin/config/dictionaries/exception_type/items')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ code: `TENANT_${Date.now()}`, label: '租户新增' })
      .expect(200);
    expect(denied.body.code).toBe(1003);

    const readable = await request(app.getHttpServer())
      .get('/api/dict/exception_type')
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);
    expect(readable.body.data.length).toBeGreaterThan(0);
  });

  async function login(username: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(201);
    return res.body.data.accessToken as string;
  }

  async function openTenant(adminToken: string) {
    const phone = `135${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `字典租户${phone}`,
        ownerName: '字典店长',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);
    return { token: await login(phone, 'pw123456') };
  }
});
