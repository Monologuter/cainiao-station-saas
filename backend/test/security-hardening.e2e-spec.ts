import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { ApiCode } from '../apps/api/src/core/http/api-code';
import type { PrismaService } from '../apps/api/src/core/prisma/prisma.service';
import { getTestApp, getTestPrisma, closeTestApp } from './setup';

/**
 * SEC-13 (口令策略) + SEC-12 (平台操作审计) + 权限 nit (tenant:manage) 回归。
 */
describe('Security hardening e2e (SEC-12/SEC-13)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await getTestApp();
    prisma = getTestPrisma();
  });

  afterAll(() => closeTestApp());

  describe('SEC-13 口令策略', () => {
    it('rejects weak ownerPassword (<8) on tenant create', async () => {
      const admin = await login('admin', 'admin123456');
      const res = await request(app.getHttpServer())
        .post('/api/platform/tenants')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          name: '弱密码租户',
          ownerName: '老板',
          ownerPhone: phone(),
          ownerPassword: 'pw1234',
        })
        .expect(400);
      expect(res.body.message).toContain('密码至少 8 位');
    });

    it('rejects digit-only ownerPassword on tenant create', async () => {
      const admin = await login('admin', 'admin123456');
      const res = await request(app.getHttpServer())
        .post('/api/platform/tenants')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          name: '纯数字密码租户',
          ownerName: '老板',
          ownerPhone: phone(),
          ownerPassword: '123456789',
        })
        .expect(400);
      expect(res.body.message).toContain('密码必须同时包含字母和数字');
    });

    it('rejects weak password on platform-user create', async () => {
      const admin = await login('admin', 'admin123456');
      const res = await request(app.getHttpServer())
        .post('/api/admin/platform-users')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ username: `ops_${Date.now()}`, password: 'short1' })
        .expect(400);
      expect(res.body.message).toContain('密码至少 8 位');
    });

    it('accepts a compliant ownerPassword on tenant create', async () => {
      const admin = await login('admin', 'admin123456');
      await request(app.getHttpServer())
        .post('/api/platform/tenants')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          name: '合规密码租户',
          ownerName: '老板',
          ownerPhone: phone(),
          ownerPassword: 'strongpw1',
        })
        .expect(201);
    });

    it('rejects digit-only newPassword on change-password', async () => {
      const admin = await login('admin', 'admin123456');
      const boss = await openTenant(admin.token);
      const res = await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${boss.token}`)
        .send({ oldPassword: 'pw123456', newPassword: '99887766' })
        .expect(400);
      expect(res.body.message).toContain('密码必须同时包含字母和数字');
    });
  });

  describe('SEC-12 平台操作审计', () => {
    it('records an audit log for platform-user create', async () => {
      const admin = await login('admin', 'admin123456');
      const username = `ops_${Date.now()}`;
      const created = await request(app.getHttpServer())
        .post('/api/admin/platform-users')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ username, password: 'strongpw1' })
        .expect(201);
      expect(created.body.data.id).toBeDefined();

      const logged = await eventually(() =>
        findAudit('platform.user.create', created.body.data.id),
      );
      expect(logged).toBeTruthy();
      expect(logged?.actorType).toBe('PLATFORM');
      expect(logged?.result).toBe('SUCCESS');
    });

    it('records an audit log for tenant status change', async () => {
      const admin = await login('admin', 'admin123456');
      const boss = await openTenant(admin.token);
      await request(app.getHttpServer())
        .patch(`/api/platform/tenants/${boss.tenantId}/status`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ status: 'SUSPENDED' })
        .expect(200);

      const logged = await eventually(() =>
        findAudit('platform.tenant.status.update', boss.tenantId),
      );
      expect(logged).toBeTruthy();
      expect(logged?.actorType).toBe('PLATFORM');
    });
  });

  describe('权限 nit: tenant 状态变更需 tenant:manage', () => {
    it('forbids a tenant staff (only daily perms) from changing tenant status', async () => {
      const admin = await login('admin', 'admin123456');
      const boss = await openTenant(admin.token);
      const res = await request(app.getHttpServer())
        .patch(`/api/platform/tenants/${boss.tenantId}/status`)
        .set('Authorization', `Bearer ${boss.token}`)
        .send({ status: 'SUSPENDED' })
        .expect(200);
      expect(res.body.code).toBe(ApiCode.FORBIDDEN);
    });
  });

  // ---- helpers ----
  function phone() {
    return `137${Math.floor(Math.random() * 1e8)
      .toString()
      .padStart(8, '0')}`;
  }

  async function login(username: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(201);
    return {
      token: res.body.data.accessToken as string,
      userId: res.body.data.user.id as string,
    };
  }

  async function openTenant(adminToken: string) {
    const p = phone();
    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `安全测试租户${p}`,
        ownerName: '店长',
        ownerPhone: p,
        ownerPassword: 'pw123456',
      })
      .expect(201);
    const boss = await login(p, 'pw123456');
    return { tenantId: open.body.data.tenantId as string, token: boss.token };
  }

  function findAudit(action: string, resourceHint: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      const rows = await tx.auditLog.findMany({
        where: { action },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      // resourceHint 用于把测试数据与并行用例区分开（按 resourceId 或时间近似）
      return (
        rows.find((r) => r.resourceId === resourceHint) ?? rows[0] ?? null
      );
    });
  }

  async function eventually<T>(fn: () => Promise<T>): Promise<T> {
    let last: T = await fn();
    for (let i = 0; i < 10 && !last; i += 1) {
      await new Promise((r) => setTimeout(r, 100));
      last = await fn();
    }
    return last;
  }
});
