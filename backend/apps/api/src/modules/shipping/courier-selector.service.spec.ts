import { CourierSelectorService } from './courier-selector.service';

describe('CourierSelectorService', () => {
  const quote = jest.fn();
  const makeService = () => new CourierSelectorService({ quote } as any);

  beforeEach(() => {
    quote.mockReset();
  });

  it('resolves shipping zones from sender and receiver addresses', () => {
    const service = makeService();

    expect(
      service.resolveZone(
        { province: '浙江省', city: '杭州市', district: '西湖区' },
        { province: '浙江省', city: '杭州市', district: '余杭区' },
      ),
    ).toBe('SAME_CITY');
    expect(
      service.resolveZone(
        { province: '浙江省', city: '杭州市', district: '西湖区' },
        { province: '浙江省', city: '宁波市', district: '鄞州区' },
      ),
    ).toBe('SAME_PROVINCE');
    expect(
      service.resolveZone(
        { province: '浙江省', city: '杭州市', district: '西湖区' },
        { province: '广东省', city: '深圳市', district: '南山区' },
      ),
    ).toBe('CROSS_PROVINCE');
    expect(
      service.resolveZone(
        { province: '浙江省', city: '杭州市', district: '西湖区' },
        {
          province: '新疆维吾尔自治区',
          city: '乌鲁木齐市',
          district: '天山区',
        },
      ),
    ).toBe('REMOTE');
  });

  it('ranks by blended price and speed by default and marks the first quote recommended', async () => {
    quote.mockImplementation(async (courierCode: string) => {
      const table: Record<string, any> = {
        SF: { amount: 2200, estHours: 12, courierName: '顺丰速运' },
        YTO: { amount: 1000, estHours: 72, courierName: '圆通速递' },
        ZTO: { amount: 1200, estHours: 36, courierName: '中通快递' },
      };
      return {
        courierCode,
        zone: 'CROSS_PROVINCE',
        breakdown: {},
        ruleId: `${courierCode}-rule`,
        ...table[courierCode],
      };
    });
    const service = makeService();

    const quotes = await service.rank({
      sender: { province: '浙江省', city: '杭州市', district: '西湖区' },
      receiver: { province: '广东省', city: '深圳市', district: '南山区' },
      weightGram: 1200,
    });

    expect(quotes.map((item) => item.courierCode)).toEqual([
      'ZTO',
      'YTO',
      'SF',
    ]);
    expect(quotes[0].recommended).toBe(true);
    expect(quotes.slice(1).every((item) => item.recommended === false)).toBe(
      true,
    );
  });

  it('supports price-first and speed-first sorting modes', async () => {
    quote.mockImplementation(async (courierCode: string) => {
      const table: Record<string, any> = {
        SF: { amount: 2300, estHours: 12, courierName: '顺丰速运' },
        YTO: { amount: 1000, estHours: 72, courierName: '圆通速递' },
        ZTO: { amount: 1300, estHours: 36, courierName: '中通快递' },
      };
      return {
        courierCode,
        zone: 'CROSS_PROVINCE',
        breakdown: {},
        ruleId: `${courierCode}-rule`,
        ...table[courierCode],
      };
    });
    const service = makeService();
    const input = {
      sender: { province: '浙江省', city: '杭州市', district: '西湖区' },
      receiver: { province: '广东省', city: '深圳市', district: '南山区' },
      weightGram: 1200,
    };

    await expect(
      service.rank({ ...input, preference: 'priceFirst' }),
    ).resolves.toMatchObject([
      { courierCode: 'YTO', recommended: true },
      { courierCode: 'ZTO' },
      { courierCode: 'SF' },
    ]);
    await expect(
      service.rank({ ...input, preference: 'speedFirst' }),
    ).resolves.toMatchObject([
      { courierCode: 'SF', recommended: true },
      { courierCode: 'ZTO' },
      { courierCode: 'YTO' },
    ]);
  });
});
