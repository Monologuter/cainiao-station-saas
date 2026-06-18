import { TenantContext } from '../../core/tenant-context/tenant-context';
import { SlotService } from './slot.service';

function runAsTenant<T>(fn: () => T) {
  return TenantContext.run(
    { userId: 'u1', tenantId: 't1', roles: ['店长'], isPlatform: false },
    fn,
  );
}

describe('SlotService', () => {
  it('batch creates slots from rows, levels and cols using shelf zone code', async () => {
    const created: any[] = [];
    const tx = {
      shelf: {
        findFirstOrThrow: async () => ({
          id: 'sh1',
          tenantId: 't1',
          stationId: 's1',
          code: 'A',
          zone: 'A',
        }),
      },
      slot: {
        createMany: async ({ data }: any) => {
          created.push(...data);
          return { count: data.length };
        },
      },
    };
    const svc = new SlotService({
      withTenant: async (fn: any) => fn(tx),
    } as any);

    const result = await runAsTenant(() =>
      svc.batchCreate('sh1', { rows: 1, levels: 2, cols: 2 }),
    );

    expect(result.created).toBe(4);
    expect(created.map((slot) => slot.code)).toEqual([
      'A-01-01-01',
      'A-01-01-02',
      'A-01-02-01',
      'A-01-02-02',
    ]);
    expect(created[0]).toMatchObject({
      tenantId: 't1',
      stationId: 's1',
      shelfId: 'sh1',
      rowNo: 1,
      levelNo: 1,
      colNo: 1,
      createdBy: 'u1',
    });
  });

  it('batch creates explicit slot codes', async () => {
    const created: any[] = [];
    const tx = {
      shelf: {
        findFirstOrThrow: async () => ({
          id: 'sh1',
          tenantId: 't1',
          stationId: 's1',
          code: 'A',
        }),
      },
      slot: {
        createMany: async ({ data }: any) => {
          created.push(...data);
          return { count: data.length };
        },
      },
    };
    const svc = new SlotService({
      withTenant: async (fn: any) => fn(tx),
    } as any);

    const result = await runAsTenant(() =>
      svc.batchCreate('sh1', { codes: ['A-01', 'A-02'] }),
    );

    expect(result.created).toBe(2);
    expect(created.map((slot) => slot.code)).toEqual(['A-01', 'A-02']);
  });

  it('reports createMany count so duplicate station codes are deterministic', async () => {
    const tx = {
      shelf: {
        findFirstOrThrow: async () => ({
          id: 'sh1',
          tenantId: 't1',
          stationId: 's1',
          code: 'A',
        }),
      },
      slot: {
        createMany: async () => ({ count: 1 }),
      },
    };
    const svc = new SlotService({
      withTenant: async (fn: any) => fn(tx),
    } as any);

    await expect(
      runAsTenant(() => svc.batchCreate('sh1', { codes: ['A-01', 'A-01'] })),
    ).resolves.toEqual({ created: 1 });
  });

  it('lists slots by shelf and status', async () => {
    const tx = {
      slot: {
        findMany: async ({ where, orderBy }: any) => {
          expect(where).toMatchObject({
            shelfId: 'sh1',
            status: 'FREE',
            deletedAt: null,
          });
          expect(orderBy).toEqual([
            { rowNo: 'asc' },
            { levelNo: 'asc' },
            { colNo: 'asc' },
            { code: 'asc' },
          ]);
          return [{ id: 'slot1', code: 'A-01', status: 'FREE' }];
        },
      },
    };
    const svc = new SlotService({
      withTenant: async (fn: any) => fn(tx),
    } as any);

    await expect(svc.listByShelf('sh1', 'FREE')).resolves.toEqual([
      { id: 'slot1', code: 'A-01', status: 'FREE' },
    ]);
  });

  it('lists free slots by station with limit', async () => {
    const tx = {
      slot: {
        findMany: async ({ where, take }: any) => {
          expect(where).toMatchObject({
            stationId: 's1',
            status: 'FREE',
            deletedAt: null,
            shelf: { status: 'ACTIVE', deletedAt: null },
          });
          expect(take).toBe(5);
          return [{ id: 'slot1', code: 'A-01', status: 'FREE' }];
        },
      },
    };
    const svc = new SlotService({
      withTenant: async (fn: any) => fn(tx),
    } as any);

    await expect(svc.listFree('s1', 5)).resolves.toHaveLength(1);
  });

  it('caps an oversized listFree limit at 100', async () => {
    let observedTake: number | undefined;
    const tx = {
      slot: {
        findMany: async ({ take }: any) => {
          observedTake = take;
          return [];
        },
      },
    };
    const svc = new SlotService({
      withTenant: async (fn: any) => fn(tx),
    } as any);

    await svc.listFree('s1', 100000);
    expect(observedTake).toBe(100);
  });

  it('floors a non-positive listFree limit at 1', async () => {
    let observedTake: number | undefined;
    const tx = {
      slot: {
        findMany: async ({ take }: any) => {
          observedTake = take;
          return [];
        },
      },
    };
    const svc = new SlotService({
      withTenant: async (fn: any) => fn(tx),
    } as any);

    await svc.listFree('s1', 0);
    expect(observedTake).toBe(1);
  });
});
