import { ApiCode, BizError } from '../../../core/http/api-code';

export interface OverdueConfig {
  remindDays: number;
  urgeDays: number;
  finalDays: number;
  returnDays: number;
}

export type OverdueDecision =
  | { kind: 'LEVEL'; level: 0 | 1 | 2 | 3 }
  | { kind: 'RETURN'; level: 3 };

export const OVERDUE_DEFAULT_CONFIG: OverdueConfig = {
  remindDays: 3,
  urgeDays: 7,
  finalDays: 11,
  returnDays: 15,
};

export function normalizeOverdueConfig(
  input: Partial<OverdueConfig> | null | undefined,
): OverdueConfig {
  const config = {
    ...OVERDUE_DEFAULT_CONFIG,
    ...(input ?? {}),
  };

  const values = [
    config.remindDays,
    config.urgeDays,
    config.finalDays,
    config.returnDays,
  ];
  if (!values.every((value) => Number.isInteger(value) && value >= 0)) {
    throw new BizError(ApiCode.BAD_REQUEST, '滞留阈值必须是非负整数');
  }
  if (
    !(
      config.remindDays < config.urgeDays &&
      config.urgeDays < config.finalDays &&
      config.finalDays < config.returnDays
    )
  ) {
    throw new BizError(ApiCode.BAD_REQUEST, '滞留阈值必须递增');
  }

  return config;
}

export function classifyOverdue(
  storedAt: Date,
  now = new Date(),
  configInput?: Partial<OverdueConfig>,
): OverdueDecision {
  const config = normalizeOverdueConfig(configInput);
  const storedDays = Math.floor(
    (now.getTime() - storedAt.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (storedDays >= config.returnDays) {
    return { kind: 'RETURN', level: 3 };
  }
  if (storedDays >= config.finalDays) {
    return { kind: 'LEVEL', level: 3 };
  }
  if (storedDays >= config.urgeDays) {
    return { kind: 'LEVEL', level: 2 };
  }
  if (storedDays >= config.remindDays) {
    return { kind: 'LEVEL', level: 1 };
  }
  return { kind: 'LEVEL', level: 0 };
}
