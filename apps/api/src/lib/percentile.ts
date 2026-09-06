/**
 * Nearest-rank percentile over an ascending-sorted array.
 *
 * Reply latencies are heavily right-skewed — a single reply three weeks later
 * drags a mean past anything the conversation actually felt like — so the
 * report layer quotes p50/p90 instead of an average.
 */
export function percentile(sortedAscending: number[], p: number): number {
  if (sortedAscending.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedAscending.length);
  const index = Math.min(sortedAscending.length - 1, Math.max(0, rank - 1));
  return sortedAscending[index];
}

/** Arithmetic mean, 0 for an empty array. */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}
