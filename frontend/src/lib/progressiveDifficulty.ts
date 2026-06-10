/**
 * Returns the listening duration in seconds for a given round,
 * based on progressive difficulty tiers.
 *
 * - First third of rounds: 30s
 * - Second third: 20s
 * - Final third: 10s
 */
export function getListeningDuration(roundIndex: number, totalRounds: number): number {
  if (totalRounds <= 0) return 30

  const thirdSize = totalRounds / 3

  if (roundIndex < thirdSize) return 30
  if (roundIndex < thirdSize * 2) return 20
  return 10
}
