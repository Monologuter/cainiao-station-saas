import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { PrismaService } from '../apps/api/src/core/prisma/prisma.service';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';

describe('Shipping quote e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
    prisma = app.get(PrismaService);
  });

  afterAll(() => app.close());

  it('returns ranked courier quotes for a tenant boss', async () => {
    const { token } = await openTenantAndLogin('quote');

    const res = await request(app.getHttpServer())
      .post('/api/shipping/quote')
      .set('Authorization', `Bearer ${token}`)
      .send(makeQuoteBody())
      .expect(201);

    expect(res.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          courierCode: expect.any(String),
          courierName: expect.any(String),
          amount: expect.any(Number),
          estHours: expect.any(Number),
          recommended: expect.any(Boolean),
        }),
      ]),
    );
    expect(res.body.data[0].recommended).toBe(true);
  });

  it('rejects users without shipping:quote permission', async () => {
    const { tenantId } = await openTenantAndLogin('limited');
    const token = await createLimitedUser(tenantId);

    const res = await request(app.getHttpServer())
      .post('/api/shipping/quote')
      .set('Authorization', `Bearer ${token}`)
      .send(makeQuoteBody());

    expect(res.body.code).toBe(1003);
  });

  async function openTenantAndLogin(suffix: string) {
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123456' })
      .expect(201);
    const phone = `136${Date.now().toString().slice(-8)}`;
    const opened = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminLogin.body.data.accessToken}`)
      .send({
        name: `寄件报价${suffix}`,
        ownerName: '报价店长',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);
    const bossLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: phone, password: 'pw123456' })
      .expect(201);

    return {
      tenantId: opened.body.data.tenantId as string,
      token: bossLogin.body.data.accessToken as string,
    };
  }

  async function createLimitedUser(tenantId: string) {
    const username = `limited-${Date.now()}`;
    const password = 'pw123456';
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      const role = await tx.role.create({
        data: {
          tenantId,
          code: `limited-${Date.now()}`,
          name: '受限员工',
          scope: 'TENANT',
        },
      });
      const permission = await tx.permission.findUniqueOrThrow({
        where: { code: 'parcel:read' },
      });
      await tx.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id },
      });
      const user = await tx.user.create({
        data: {
          tenantId,
          type: 'STAFF',
          username,
          passwordHash: await argon2.hash(password),
        },
      });
      await tx.userRole.create({
        data: { userId: user.id, roleId: role.id },
      });
    });

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(201);
    return login.body.data.accessToken as string;
  }

  function makeQuoteBody() {
    return {
      sender: {
        name: '张三',
        phone: '13800000000',
        province: '浙江省',
        city: '杭州市',
        district: '西湖区',
        address: '文三路 1 号',
      },
      receiver: {
        name: '李四',
        phone: '13900000000',
        province: '广东省',
        city: '深圳市',
        district: '南山区',
        address: '科技园 2 号',
      },
      weightGram: 1200,
      preference: 'priceFirst',
    };
  }
});
