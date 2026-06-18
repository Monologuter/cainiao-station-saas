import { AssistantToolRegistry } from './assistant-tool-registry';

describe('AssistantToolRegistry', () => {
  it('executes only registered assistant tools by name', async () => {
    const queryMyParcels = {
      name: 'query_my_parcels' as const,
      execute: jest.fn().mockResolvedValue({ isError: false, items: [] }),
    };
    const queryLogistics = {
      name: 'query_logistics' as const,
      execute: jest.fn().mockResolvedValue({ isError: false, tracks: [] }),
    };
    const registry = new AssistantToolRegistry(
      queryMyParcels as any,
      queryLogistics as any,
    );

    const ctx = {
      tenantId: 'tenant-1',
      actorType: 'CONSUMER' as const,
      channel: 'USER_APP' as const,
      consumerId: 'consumer-1',
      verifiedPhone: '13800001234',
    };
    await expect(
      registry.execute('query_my_parcels', { phone: '13999999999' }, ctx),
    ).resolves.toEqual({ isError: false, items: [] });
    await expect(
      registry.execute('delete_everything' as any, {}, ctx),
    ).resolves.toMatchObject({
      isError: true,
      code: 'TOOL_NOT_ALLOWED',
    });

    expect(queryMyParcels.execute).toHaveBeenCalledWith(
      { phone: '13999999999' },
      ctx,
    );
    expect(queryLogistics.execute).not.toHaveBeenCalled();
  });
});
