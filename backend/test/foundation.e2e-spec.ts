import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getTestApp, closeTestApp } from './setup';

describe('Foundation e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(() => closeTestApp());

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
    // #11 契约：/auth/me 必须含 id + username（前端刷新后保留用户名）
    expect(me.body.data.id).toBe(bossLogin.body.data.user.id);
    expect(me.body.data.username).toBe(phone);
    // #6：店长门店作用域为「全门店」
    expect(me.body.data.allStations).toBe(true);
    expect(me.body.data.stations).toContain(open.body.data.stationId);
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

  it('登录用户可拉取权限码与按 RBAC 过滤后的菜单', async () => {
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123456' })
      .expect(201);
    const adminToken = adminLogin.body.data.accessToken;

    const adminPermissions = await request(app.getHttpServer())
      .get('/api/auth/permissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(adminPermissions.body.data).toEqual(
      expect.arrayContaining(['tenant:create', 'parcel:read']),
    );

    const adminMenus = await request(app.getHttpServer())
      .get('/api/auth/menus')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const adminFlattened = adminMenus.body.data.flatMap(
      (group: any) => group.items,
    );
    expect(adminFlattened).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '/platform/tenants/new' }),
        expect.objectContaining({ path: '/platform/tenants' }),
      ]),
    );

    const phone = `137${Date.now().toString().slice(-8)}`;
    await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'RBAC 菜单驿站',
        ownerName: '赵六',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);

    const bossLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: phone, password: 'pw123456' })
      .expect(201);
    const bossToken = bossLogin.body.data.accessToken;

    const bossPermissions = await request(app.getHttpServer())
      .get('/api/auth/permissions')
      .set('Authorization', `Bearer ${bossToken}`)
      .expect(200);
    expect(bossPermissions.body.data).toEqual(
      expect.arrayContaining([
        'parcel:inbound',
        'parcel:pickup',
        'exception:create',
        'exception:read',
        'exception:handle',
        'parcel:overdue:scan',
      ]),
    );
    expect(bossPermissions.body.data).not.toContain('tenant:create');

    const bossMenus = await request(app.getHttpServer())
      .get('/api/auth/menus')
      .set('Authorization', `Bearer ${bossToken}`)
      .expect(200);
    const flattened = bossMenus.body.data.flatMap((group: any) => group.items);
    expect(flattened).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'inbound' }),
        expect.objectContaining({ code: 'pickup' }),
        expect.objectContaining({ code: 'exceptions', perm: 'exception:read' }),
        expect.objectContaining({ code: 'shelves' }),
      ]),
    );
    expect(
      flattened.find((item: any) => item.code === 'exceptions'),
    ).not.toEqual(expect.objectContaining({ disabled: true }));
    expect(flattened).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'tenant-open' }),
      ]),
    );
  }, 15000);
});
