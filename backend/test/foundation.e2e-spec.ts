import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';

describe('Foundation e2e', () => {
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

  it('平台登录 → 开店 → 店长登录 → /auth/me', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123456' })
      .expect(201);
    const adminToken = login.body.data.accessToken;
    expect(adminToken).toBeDefined();

    const phone = `139${Date.now().toString().slice(-8)}`;
    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: '城南驿站',
        ownerName: '张三',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);
    expect(open.body.data.tenantId).toBeDefined();

    const bossLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: phone, password: 'pw123456' })
      .expect(201);
    expect(bossLogin.body.data.user.roles).toContain('店长');

    await request(app.getHttpServer()).get('/api/auth/me').expect(401);

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${bossLogin.body.data.accessToken}`)
      .expect(200);
    expect(me.body.data.tenantId).toBe(open.body.data.tenantId);
  });

  it('店长无 tenant:create 权限 → 开店被拒(403 业务码)', async () => {
    const phone = `138${Date.now().toString().slice(-8)}`;
    const admin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123456' });

    await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${admin.body.data.accessToken}`)
      .send({
        name: 'B 驿站',
        ownerName: '李四',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      });

    const boss = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: phone, password: 'pw123456' });

    const res = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${boss.body.data.accessToken}`)
      .send({
        name: 'X',
        ownerName: 'x',
        ownerPhone: '13700000000',
        ownerPassword: 'pw123456',
      });

    expect(res.body.code).toBe(1003);
  });
});
