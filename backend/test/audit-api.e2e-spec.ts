import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import type { PrismaService } from '../apps/api/src/core/prisma/prisma.service';
import { getTestApp, getTestPrisma, closeTestApp } from './setup';

describe('Audit API e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await getTestApp();
    prisma = getTestPrisma();
  });

  afterAll(() => closeTestApp());

  it('lets platform operators filter audit logs and open redacted details', async () => {
    const admin = await login('admin', 'admin123456');
    const boss = await openTenant(admin.token);
    const action = `config.channel.update.${Date.now()}`;
    const detail = await seedAuditLog({
      tenantId: boss.tenantId,
      actorId: admin.userId,
      actorType: 'PLATFORM',
      action,
      resourceType: 'channel_config',
      resourceId: 'sms',
      result: 'SUCCESS',
      summary: '短信渠道切换为 tencent',
      diff: {
        provider: {
          type: 'changed',
          before: 'mock',
          after: 'tencent',
        },
        'config.secret': {
          type: 'changed',
          before: '[REDACTED]',
          after: '[REDACTED]',
        },
      },
    });
    await seedAuditLog({
      tenantId: null,
      actorId: admin.userId,
      actorType: 'PLATFORM',
      action: `${action}.other`,
      resourceType: 'system_config',
      result: 'FAILURE',
      summary: '其他审计',
    });

    const list = await request(app.getHttpServer())
      .get('/api/admin/audit-logs')
      .query({
        tenantId: boss.tenantId,
        action,
        result: 'SUCCESS',
        resourceType: 'channel_config',
      })
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(list.body.data).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(list.body.data.items).toEqual([
      expect.objectContaining({
        id: detail.id,
        tenantId: boss.tenantId,
        actorType: 'PLATFORM',
        action,
        resourceType: 'channel_config',
        result: 'SUCCESS',
        summary: '短信渠道切换为 tencent',
      }),
    ]);

    const one = await request(app.getHttpServer())
      .get(`/api/admin/audit-logs/${detail.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);
    expect(one.body.data).toMatchObject({
      id: detail.id,
      diff: {
        'config.secret': {
          before: '[REDACTED]',
          after: '[REDACTED]',
        },
      },
      ip: '127.0.0.1',
      userAgent: 'jest',
      requestId: detail.requestId,
    });

    const actions = await request(app.getHttpServer())
      .get('/api/admin/audit-logs/actions')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);
    expect(actions.body.data).toContain(action);
  });

  it('rejects tenant users from platform audit endpoints', async () => {
    const admin = await login('admin', 'admin123456');
    const boss = await openTenant(admin.token);

    const denied = await request(app.getHttpServer())
      .get('/api/admin/audit-logs')
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);
    expect(denied.body.code).toBe(1003);
  });

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
    const phone = `136${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `审计租户${phone}`,
        ownerName: '审计店长',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);
    const boss = await login(phone, 'pw123456');
    return {
      tenantId: open.body.data.tenantId as string,
      token: boss.token,
    };
  }

  async function seedAuditLog(input: {
    tenantId: string | null;
    actorId: string;
    actorType: 'PLATFORM' | 'STAFF' | 'SYSTEM';
    action: string;
    resourceType: string;
    resourceId?: string;
    result: 'SUCCESS' | 'FAILURE';
    summary: string;
    diff?: any;
  }) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorId: input.actorId,
          actorType: input.actorType,
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          result: input.result,
          summary: input.summary,
          diff: input.diff,
          ip: '127.0.0.1',
          userAgent: 'jest',
          requestId: `req-${Date.now()}-${Math.random()}`,
        },
      });
    });
  }
});
