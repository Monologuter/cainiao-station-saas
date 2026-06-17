import { PickupCodeService } from './pickup-code.service';

describe('PickupCodeService', () => {
  it('generates numeric station-scoped code and reserves it in Redis', async () => {
    const client = { set: jest.fn().mockResolvedValue('OK'), del: jest.fn() };
    const redis = { getClient: () => client } as any;
    const service = new PickupCodeService(redis, {
      nextInt: () => 1234,
    } as any);

    const code = await service.generate('station1');

    expect(code).toBe('1234');
    expect(client.set).toHaveBeenCalledWith(
      'pcode:station1:1234',
      '1',
      'EX',
      60 * 60 * 24 * 14,
      'NX',
    );
  });

  it('retries when Redis reports candidate code is occupied', async () => {
    const client = {
      set: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce('OK'),
      del: jest.fn(),
    };
    const redis = { getClient: () => client } as any;
    const service = new PickupCodeService(redis, {
      nextInt: jest.fn().mockReturnValueOnce(1111).mockReturnValueOnce(2222),
    } as any);

    await expect(service.generate('station1')).resolves.toBe('2222');
    expect(client.set).toHaveBeenCalledTimes(2);
  });

  it('release removes the station-scoped Redis reservation', async () => {
    const client = { set: jest.fn(), del: jest.fn().mockResolvedValue(1) };
    const redis = { getClient: () => client } as any;
    const service = new PickupCodeService(redis);

    await service.release('station1', '1234');

    expect(client.del).toHaveBeenCalledWith('pcode:station1:1234');
  });
});
