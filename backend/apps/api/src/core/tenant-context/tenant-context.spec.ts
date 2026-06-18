import { TenantContext } from './tenant-context';

describe('TenantContext', () => {
  it('runs callback with isolated store', () => {
    const ctx = {
      traceId: 'trace-1',
      userId: 'u1',
      tenantId: 't1',
      roles: ['店长'],
      isPlatform: false,
    };

    TenantContext.run(ctx, () => {
      expect(TenantContext.get()?.tenantId).toBe('t1');
      expect(TenantContext.get()?.traceId).toBe('trace-1');
    });

    expect(TenantContext.get()).toBeUndefined();
  });
});
