import { TenantContext } from '../../core/tenant-context/tenant-context';
import { StationService } from './station.service';

describe('StationService', () => {
  it('creates shelf under current tenant and station', async () => {
    const created: any = {};
    const tx = {
      shelf: {
        create: async ({ data }: any) =>
          (created.shelf = { id: 'sh1', ...data }),
      },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const service = new StationService(tenantPrisma);

    const result: any = await TenantContext.run(
      { userId: 'u1', tenantId: 't1', roles: ['店长'], isPlatform: false },
      () =>
        service.createShelf('s1', {
          code: 'A',
          name: 'A 区货架',
          zone: 'A',
        }),
    );

    expect(result.id).toBe('sh1');
    expect(created.shelf).toMatchObject({
      tenantId: 't1',
      stationId: 's1',
      code: 'A',
      name: 'A 区货架',
      zone: 'A',
      createdBy: 'u1',
    });
  });

  it('lists shelves with slot usage', async () => {
    const tx = {
      shelf: {
        findMany: async () => [
          {
            id: 'sh1',
            code: 'A',
            name: 'A 区货架',
            slots: [{ status: 'FREE' }, { status: 'OCCUPIED' }],
          },
        ],
      },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const service = new StationService(tenantPrisma);

    const result = await service.listShelves('s1');

    expect(result[0]).toMatchObject({
      id: 'sh1',
      totalSlots: 2,
      occupiedSlots: 1,
      usageRate: 0.5,
    });
  });
});
