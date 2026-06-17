export const MEMBER_LEVELS = [
  { level: 0, minPoints: 0 },
  { level: 1, minPoints: 100 },
  { level: 2, minPoints: 500 },
  { level: 3, minPoints: 2000 },
] as const;

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
