import { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import * as request from 'supertest';
import type { PrismaService } from '../apps/api/src/core/prisma/prisma.service';
import { closeTestApp, getTestApp, getTestPrisma, uniqueSuffix } from './setup';

/**
 * DM-1 真实 SEE/DENY（补强弱测试）。
 *
 * 既有测试只覆盖「数据库 RLS 层的租户隔离」与「店长全店可见」，没有任何用例
 * 真正验证「店员被分配门店后只能看本门店、传非分配 stationId 被拒」这条产品规则。
 *
 * 本用例端到端走 HTTP：
 *  - 在同一租户下建两座门店 A/B，各放一张寄件单。
 *  - 建一个「店员」用户：自定义角色（code 非「店长」，权限只含 shipping:read，
 *    不含 station:manage），仅被分配到门店 A（staffStation）。
 *  - 登录店员后请求 GET /api/shipping/orders（该端点会把入参 stationId 经
 *    resolveStationFilter 收敛到可见门店集合）：
 *      · 不带 stationId           → 只看到门店 A 的单（收敛到可见集合）。
 *      · stationId = 门店 A        → SEE：看到门店 A 的单。
 *      · stationId = 门店 B（未分配）→ DENY：FORBIDDEN（业务码 1003）。
 */
describe('Clerk station scope SEE/DENY e2e (DM-1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await getTestApp();
    prisma = getTestPrisma();
  });

  afterAll(() => closeTestApp());

  it('店员分配门店后只能看本门店寄件单，传非分配 stationId 被拒', async () => {
    const seeded = await seedClerkWithTwoStations();

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: seeded.clerkUsername, password: 'pw123456' })
      .expect(201);
    const token = loginRes.body.data.accessToken as string;

    // 不带 stationId：收敛到可见门店集合 → 仅门店 A 的单。
    const scoped = await request(app.getHttpServer())
      .get('/api/shipping/orders')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const scopedIds = scoped.body.data.list.map((o: any) => o.id);
    expect(scopedIds).toContain(seeded.orderAId);
    expect(scopedIds).not.toContain(seeded.orderBId);

    // SEE：显式传被分配门店 A → 看到门店 A 的单。
    const allowed = await request(app.getHttpServer())
      .get('/api/shipping/orders')
      .query({ stationId: seeded.stationAId })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const allowedIds = allowed.body.data.list.map((o: any) => o.id);
    expect(allowedIds).toContain(seeded.orderAId);
    expect(allowedIds).not.toContain(seeded.orderBId);

    // DENY：传未分配门店 B → FORBIDDEN（业务码 1003）。
    const denied = await request(app.getHttpServer())
      .get('/api/shipping/orders')
      .query({ stationId: seeded.stationBId })
      .set('Authorization', `Bearer ${token}`);
    expect(denied.body.code).toBe(1003);
    expect(denied.body.data ?? null).toBeNull();
  }, 20000);

  async function seedClerkWithTwoStations() {
    return prisma.$transaction<any>(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );

      const tenant = await tx.tenant.create({
        data: {
          name: `店员作用域租户${uniqueSuffix()}`,
          ownerName: '老板',
          contactPhone: `139${uniqueSuffix()}`,
          status: 'ACTIVE',
        },
      });

      const stationA = await tx.station.create({
        data: {
          tenantId: tenant.id,
          name: '门店A',
          code: `SCA-${uniqueSuffix()}`,
        },
      });
      const stationB = await tx.station.create({
        data: {
          tenantId: tenant.id,
          name: '门店B',
          code: `SCB-${uniqueSuffix()}`,
        },
      });

      // 自定义店员角色：code 非「店长」，仅 shipping:read，不含 station:manage。
      const clerkRole = await tx.role.create({
        data: {
          tenantId: tenant.id,
          code: `clerk-${uniqueSuffix()}`,
          name: '门店店员',
          scope: 'TENANT',
        },
      });
      const shippingRead = await tx.permission.findUniqueOrThrow({
        where: { code: 'shipping:read' },
      });
      await tx.rolePermission.create({
        data: { roleId: clerkRole.id, permissionId: shippingRead.id },
      });

      const clerkUsername = `clerk-${uniqueSuffix()}`;
      const clerk = await tx.user.create({
        data: {
          tenantId: tenant.id,
          type: 'STAFF',
          username: clerkUsername,
          passwordHash: await argon2.hash('pw123456'),
          status: 'active',
        },
      });
      await tx.userRole.create({
        data: { userId: clerk.id, roleId: clerkRole.id },
      });
      // 仅分配门店 A。
      await tx.staffStation.create({
        data: {
          tenantId: tenant.id,
          userId: clerk.id,
          stationId: stationA.id,
        },
      });

      const orderA = await tx.shipOrder.create({
        data: shipOrderData(tenant.id, stationA.id, 'A'),
      });
      const orderB = await tx.shipOrder.create({
        data: shipOrderData(tenant.id, stationB.id, 'B'),
      });

      return {
        tenantId: tenant.id,
        stationAId: stationA.id,
        stationBId: stationB.id,
        clerkUsername,
        orderAId: orderA.id,
        orderBId: orderB.id,
      };
    });
  }

  function shipOrderData(tenantId: string, stationId: string, tag: string) {
    return {
      tenantId,
      stationId,
      orderNo: `SCO-${tag}-${uniqueSuffix()}`,
      channel: 'STATION' as const,
      status: 'CREATED' as const,
      senderJson: {
        name: '张三',
        phone: '13800000000',
        province: '浙江省',
        city: '杭州市',
        district: '西湖区',
        address: '文三路 1 号',
      },
      receiverJson: {
        name: '李四',
        phone: '13900000000',
        province: '广东省',
        city: '深圳市',
        district: '南山区',
        address: '科技园 2 号',
      },
      itemJson: { type: '文件', weightGram: 1200 },
      weightGram: 1200,
      courierCode: 'YTO',
      courierName: '圆通速递',
      quoteAmount: 800,
      quoteSnapshotJson: {
        zone: 'CROSS_PROVINCE',
        amount: 800,
        estHours: 48,
        courierCode: 'YTO',
        courierName: '圆通速递',
        ruleId: 'seed-rule',
        breakdown: {},
      },
    };
  }
});
