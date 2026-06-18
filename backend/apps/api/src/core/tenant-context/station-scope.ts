import { ApiCode, BizError } from '../http/api-code';

/**
 * 拥有「全店权限」的角色编码。命中其一即视为店长/拥有全租户门店可见性。
 */
export const ALL_STATIONS_ROLES = ['店长'];

/**
 * 拥有该权限的用户视为可见本租户全部门店（店长一定具备 station:manage）。
 */
export const ALL_STATIONS_PERM = 'station:manage';

export interface StationScope {
  /** 是否不受门店限制（平台用户 / 店长）。 */
  allStations: boolean;
  /** 当 allStations 为 false 时，可见门店 id 列表（店员被分配的门店）。 */
  stations: string[];
}

/**
 * 根据登录用户的身份计算「可见门店集合」。
 *
 * - 平台用户（isPlatform）：不受门店限制。
 * - 店长（角色含 ALL_STATIONS_ROLES，或权限含 station:manage）：本租户全部门店。
 * - 店员：仅被分配的门店（assignedStationIds）。
 */
export function computeStationScope(input: {
  isPlatform?: boolean;
  roles?: string[];
  perms?: string[];
  assignedStationIds?: string[];
}): StationScope {
  if (input.isPlatform) {
    return { allStations: true, stations: [] };
  }
  const roles = input.roles ?? [];
  const perms = input.perms ?? [];
  const isBoss =
    roles.some((role) => ALL_STATIONS_ROLES.includes(role)) ||
    perms.includes(ALL_STATIONS_PERM);
  if (isBoss) {
    return { allStations: true, stations: [] };
  }
  return {
    allStations: false,
    stations: [...new Set(input.assignedStationIds ?? [])],
  };
}

export interface StationScopeSource {
  isPlatform?: boolean;
  allStations?: boolean;
  stations?: string[];
}

/**
 * 把请求入参 stationId 收敛到登录用户的「可见门店集合」，返回可直接拼进 Prisma where 的过滤条件。
 *
 * 规则：
 * - 平台用户 / 店长（allStations）：不限制门店；带入参时按入参过滤，不带则全部可见门店。
 * - 店员：
 *   - 未分配任何门店 → 抛 FORBIDDEN（无可见门店，禁止越权列全租户）。
 *   - 带入参 stationId 但不在可见集合 → 抛 FORBIDDEN（拒绝越权读其它门店）。
 *   - 带入参且合法 → 仅该门店。
 *   - 不带入参 → 收敛为可见门店集合（stationId in [...]）。
 *
 * 返回 undefined 表示「不需要追加 stationId 过滤」（allStations 且无入参）。
 */
export function resolveStationFilter(
  user: StationScopeSource | undefined,
  requestedStationId?: string,
): { stationId: string } | { stationId: { in: string[] } } | undefined {
  const allStations = !!user?.isPlatform || !!user?.allStations;

  if (allStations) {
    return requestedStationId ? { stationId: requestedStationId } : undefined;
  }

  const visible = user?.stations ?? [];
  if (visible.length === 0) {
    throw new BizError(ApiCode.FORBIDDEN, '当前账号未分配可见门店');
  }

  if (requestedStationId) {
    if (!visible.includes(requestedStationId)) {
      throw new BizError(ApiCode.FORBIDDEN, '无权访问该门店数据');
    }
    return { stationId: requestedStationId };
  }

  return { stationId: { in: visible } };
}
