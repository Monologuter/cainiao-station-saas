import { PermissionGuard } from './permission.guard';

function ctxWithUser(user: any) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

describe('PermissionGuard', () => {
  it('allows when no perm required', () => {
    const reflector = { getAllAndOverride: () => undefined } as any;

    expect(
      new PermissionGuard(reflector).canActivate(ctxWithUser({ perms: [] })),
    ).toBe(true);
  });

  it('denies when missing required perm', () => {
    const reflector = { getAllAndOverride: () => ['staff:manage'] } as any;

    expect(() =>
      new PermissionGuard(reflector).canActivate(
        ctxWithUser({ perms: ['parcel:inbound'] }),
      ),
    ).toThrow('无权限执行该操作');
  });

  it('denies suspended tenants from business operations', () => {
    const reflector = { getAllAndOverride: () => ['parcel:inbound'] } as any;

    expect(() =>
      new PermissionGuard(reflector).canActivate(
        ctxWithUser({
          tenantStatus: 'SUSPENDED',
          perms: ['parcel:inbound'],
        }),
      ),
    ).toThrow('租户已欠费停用');
  });

  it('allows suspended tenants to read and pay invoices for recovery', () => {
    const reflector = { getAllAndOverride: () => ['invoice:pay'] } as any;

    expect(
      new PermissionGuard(reflector).canActivate(
        ctxWithUser({
          tenantStatus: 'SUSPENDED',
          perms: ['invoice:pay'],
        }),
      ),
    ).toBe(true);
  });
});
