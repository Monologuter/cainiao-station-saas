export const MEMBER_LEVELS = [
  { level: 0, minPoints: 0 },
  { level: 1, minPoints: 100 },
  { level: 2, minPoints: 500 },
  { level: 3, minPoints: 2000 },
] as const;

/**
 * 积分加分规则集中配置（FUNC-8c）。
 *
 * 原先散落在各处的硬编码加分统一收口到这里，listener / checkin.service 改读本配置，
 * 便于后续按运营策略调整，且避免「同样的规则在多处各写一份」。
 * 各字段可经环境变量覆盖，默认值与历史行为完全一致。
 */
export const POINT_RULES = {
  /** 取件固定加分（原 parcel-picked-up.listener 硬编码 2）。 */
  pickup: Number(process.env.POINT_RULE_PICKUP ?? 2),

  /** 寄件按金额折算：每满 amountPerPoint 分（=金额单位）得 1 分，至少 minPoints 分。 */
  ship: {
    /** 多少金额单位折算 1 分（原 ship-order-paid.listener 的 amount/100）。 */
    amountPerPoint: Number(process.env.POINT_RULE_SHIP_AMOUNT_PER_POINT ?? 100),
    /** 寄件最少加分（原 Math.max(1, ...)）。 */
    minPoints: Number(process.env.POINT_RULE_SHIP_MIN ?? 1),
  },

  /** 每日签到：基础分 + 连续天数奖励（封顶）。原 checkin.service 的 1 + min(连续-1, 6)。 */
  checkin: {
    /** 当日基础分。 */
    basePoints: Number(process.env.POINT_RULE_CHECKIN_BASE ?? 1),
    /** 连续签到每多 1 天的额外加分。 */
    continuousBonusPerDay: Number(
      process.env.POINT_RULE_CHECKIN_BONUS_PER_DAY ?? 1,
    ),
    /** 连续奖励封顶（额外加分上限）。 */
    continuousBonusCap: Number(process.env.POINT_RULE_CHECKIN_BONUS_CAP ?? 6),
  },
} as const;

/** 取件加分。 */
export function pickupPoints() {
  return POINT_RULES.pickup;
}

/** 寄件加分：按金额折算，向下取整，并兜底到最小值。 */
export function shipPoints(amount: number) {
  return Math.max(
    POINT_RULES.ship.minPoints,
    Math.floor(amount / POINT_RULES.ship.amountPerPoint),
  );
}

/** 签到加分：基础分 + 连续天数奖励（封顶）。continuousDays 从 1 起算。 */
export function checkinPoints(continuousDays: number) {
  const bonus =
    Math.min(
      Math.max(continuousDays - 1, 0),
      POINT_RULES.checkin.continuousBonusCap,
    ) * POINT_RULES.checkin.continuousBonusPerDay;
  return POINT_RULES.checkin.basePoints + bonus;
}

export function levelForTotalPoints(totalPoints: number) {
  return MEMBER_LEVELS.reduce(
    (current, item) => (totalPoints >= item.minPoints ? item.level : current),
    0,
  );
}

export function nextLevelProgress(totalPoints: number) {
  const level = levelForTotalPoints(totalPoints);
  const next = MEMBER_LEVELS.find((item) => item.level > level);
  return {
    level,
    nextLevel: next?.level ?? null,
    nextLevelMinPoints: next?.minPoints ?? null,
    pointsToNextLevel: next ? Math.max(0, next.minPoints - totalPoints) : 0,
  };
}
