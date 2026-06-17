import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('records audit entries in a bypass transaction', async () => {
    const tx = {
      $executeRawUnsafe: jest.fn(),
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const service = new AuditService(prisma as any);

    await service.record({
      tenantId: 'tenant-1',
      actorId: 'user-1',
      actorType: 'STAFF',
      action: 'parcel.inbound',
      resourceType: 'parcel',
      resourceId: 'parcel-1',
      result: 'SUCCESS',
      summary: '入库',
      diff: { status: { before: 'PENDING', after: 'STORED' } },
      ip: '127.0.0.1',
      userAgent: 'jest',
      requestId: 'req-1',
    });

    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      `SELECT set_config('app.bypass_rls', 'on', true)`,
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        actorId: 'user-1',
        actorType: 'STAFF',
        action: 'parcel.inbound',
        result: 'SUCCESS',
      }),
    });
  });
});
