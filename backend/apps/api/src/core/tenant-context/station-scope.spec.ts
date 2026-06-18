import {
  computeStationScope,
  resolveStationFilter,
} from './station-scope';

describe('computeStationScope', () => {
  it('平台用户不受门店限制', () => {
    expect(computeStationScope({ isPlatform: true })).toEqual({
      allStations: true,
      stations: [],
    });
  });

  it('店长（角色）可见全租户门店', () => {
    expect(computeStationScope({ roles: ['店长'] })).toEqual({
      allStations: true,
      stations: [],
    });
  });

  it('拥有 station:manage 权限即视为全门店可见', () => {
    expect(
      computeStationScope({ roles: ['店员'], perms: ['station:manage'] }),
    ).toEqual({ allStations: true, stations: [] });
  });

  it('店员仅可见被分配门店并去重', () => {
    expect(
      computeStationScope({
        roles: ['店员'],
        perms: ['exception:read'],
        assignedStationIds: ['s1', 's2', 's1'],
      }),
    ).toEqual({ allStations: false, stations: ['s1', 's2'] });
  });

  it('未分配门店的店员可见集合为空', () => {
    expect(computeStationScope({ roles: ['店员'] })).toEqual({
      allStations: false,
      stations: [],
    });
  });
});

describe('resolveStationFilter', () => {
  it('全门店用户不带入参 → 不追加 stationId 过滤', () => {
    expect(resolveStationFilter({ allStations: true })).toBeUndefined();
  });

  it('全门店用户带入参 → 按入参过滤（店长可查任意本租户门店）', () => {
    expect(resolveStationFilter({ allStations: true }, 's9')).toEqual({
      stationId: 's9',
    });
  });

  it('平台用户视同全门店', () => {
    expect(resolveStationFilter({ isPlatform: true })).toBeUndefined();
    expect(resolveStationFilter({ isPlatform: true }, 's1')).toEqual({
      stationId: 's1',
    });
  });

  it('店员不带入参 → 收敛为可见门店集合', () => {
    expect(
      resolveStationFilter({ allStations: false, stations: ['s1', 's2'] }),
    ).toEqual({ stationId: { in: ['s1', 's2'] } });
  });

  it('店员带可见门店入参 → 仅该门店', () => {
    expect(
      resolveStationFilter(
        { allStations: false, stations: ['s1', 's2'] },
        's2',
      ),
    ).toEqual({ stationId: 's2' });
  });

  it('店员传非分配门店 → 拒绝（FORBIDDEN）', () => {
    expect(() =>
      resolveStationFilter(
        { allStations: false, stations: ['s1', 's2'] },
        's3',
      ),
    ).toThrow('无权访问该门店数据');
  });

  it('店员无任何可见门店 → 拒绝列全租户数据（FORBIDDEN）', () => {
    expect(() =>
      resolveStationFilter({ allStations: false, stations: [] }),
    ).toThrow('当前账号未分配可见门店');
  });
});
