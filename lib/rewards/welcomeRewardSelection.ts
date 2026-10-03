export interface WeightedRewardCandidate {
  id: string;
  remaining: number;
}

/** Selects one reward candidate from integer weighted intervals. */
export function selectWeightedReward<T extends WeightedRewardCandidate>(
  candidates: readonly T[],
  roll: number,
): T {
  const total = candidates.reduce((sum, candidate) => sum + Math.max(0, candidate.remaining), 0);
  if (!Number.isInteger(roll) || roll < 0 || roll >= total) {
    throw new RangeError("Reward roll is outside available stock");
  }
  let upperBound = 0;
  for (const candidate of candidates) {
    upperBound += Math.max(0, candidate.remaining);
    if (roll < upperBound) return candidate;
  }
  throw new RangeError("No reward stock is available");
}
