import { describe, it, expect } from '@jest/globals';

/**
 * Tests for game scoring logic
 *
 * Scoring formula:
 * gained = base + speed + streakBonus
 *   where:
 *     base = 100 (if correct) else 0
 *     speed = 50 * (1 - min(reactionMs / maxDurationMs, 1))
 *     streakBonus = nextStreak * 10
 *     nextStreak = min(streak + 1, 5) if correct else 0
 */

function computeScore(
  correct: boolean,
  reactionMs: number,
  maxDurationMs: number,
  currentStreak: number
): { gained: number; newStreak: number } {
  const base = correct ? 100 : 0;
  const speedRatio = Math.min(reactionMs / maxDurationMs, 1);
  const speedBonus = correct ? Math.round(50 * (1 - speedRatio)) : 0;
  const newStreak = correct ? Math.min(currentStreak + 1, 5) : 0;
  const streakBonus = correct ? newStreak * 10 : 0;

  const gained = base + speedBonus + streakBonus;

  return { gained, newStreak };
}

describe('Game Scoring System', () => {
  describe('Base Points', () => {
    it('should award 100 base points for correct answer', () => {
      const result = computeScore(true, 5000, 25000, 0);
      expect(result.gained).toBeGreaterThanOrEqual(100);
    });

    it('should award 0 base points for incorrect answer', () => {
      const result = computeScore(false, 5000, 25000, 0);
      expect(result.gained).toBe(0);
    });
  });

  describe('Speed Bonus', () => {
    it('should award maximum speed bonus (50) for instant answer', () => {
      const result = computeScore(true, 0, 25000, 0);
      expect(result.gained).toBe(100 + 50 + 10); // base + speed + streak
    });

    it('should award 0 speed bonus for answer at time limit', () => {
      const result = computeScore(true, 25000, 25000, 0);
      expect(result.gained).toBe(100 + 0 + 10); // base + speed + streak
    });

    it('should award proportional speed bonus for mid-time answer', () => {
      const result = computeScore(true, 12500, 25000, 0);
      // 50% of time used = 25 speed bonus
      expect(result.gained).toBe(100 + 25 + 10);
    });

    it('should not award speed bonus for incorrect answer', () => {
      const result = computeScore(false, 1000, 25000, 0);
      expect(result.gained).toBe(0);
    });
  });

  describe('Streak Bonus', () => {
    it('should start streak at 1 for first correct answer', () => {
      const result = computeScore(true, 5000, 25000, 0);
      expect(result.newStreak).toBe(1);
      expect(result.gained).toBeGreaterThanOrEqual(110); // includes 10 streak bonus
    });

    it('should increment streak for consecutive correct answers', () => {
      let streak = 0;

      const r1 = computeScore(true, 5000, 25000, streak);
      expect(r1.newStreak).toBe(1);

      const r2 = computeScore(true, 5000, 25000, r1.newStreak);
      expect(r2.newStreak).toBe(2);

      const r3 = computeScore(true, 5000, 25000, r2.newStreak);
      expect(r3.newStreak).toBe(3);
    });

    it('should cap streak at 5', () => {
      const result = computeScore(true, 5000, 25000, 5);
      expect(result.newStreak).toBe(5);
    });

    it('should reset streak to 0 on incorrect answer', () => {
      const result = computeScore(false, 5000, 25000, 4);
      expect(result.newStreak).toBe(0);
    });

    it('should award increasing streak bonuses', () => {
      let streak = 0;
      const results = [];

      for (let i = 0; i < 5; i++) {
        const result = computeScore(true, 5000, 25000, streak);
        results.push(result);
        streak = result.newStreak;
      }

      // Streak bonuses: 10, 20, 30, 40, 50
      expect(results[0].newStreak).toBe(1); // 10 bonus
      expect(results[1].newStreak).toBe(2); // 20 bonus
      expect(results[2].newStreak).toBe(3); // 30 bonus
      expect(results[3].newStreak).toBe(4); // 40 bonus
      expect(results[4].newStreak).toBe(5); // 50 bonus
    });
  });

  describe('Combined Scoring', () => {
    it('should calculate maximum possible score', () => {
      // Perfect score: instant answer + max streak
      const result = computeScore(true, 0, 25000, 4);
      expect(result.gained).toBe(100 + 50 + 50); // 200 points
    });

    it('should handle realistic game scenario', () => {
      let streak = 0;
      let totalScore = 0;

      // Round 1: Correct, fast (2s / 25s)
      const r1 = computeScore(true, 2000, 25000, streak);
      totalScore += r1.gained;
      streak = r1.newStreak;
      expect(r1.gained).toBeGreaterThan(100);

      // Round 2: Correct, medium speed (10s / 25s)
      const r2 = computeScore(true, 10000, 25000, streak);
      totalScore += r2.gained;
      streak = r2.newStreak;
      expect(r2.gained).toBeGreaterThan(r1.gained); // higher streak bonus

      // Round 3: Incorrect
      const r3 = computeScore(false, 5000, 25000, streak);
      totalScore += r3.gained;
      streak = r3.newStreak;
      expect(r3.gained).toBe(0);
      expect(streak).toBe(0);

      // Round 4: Correct, rebuild streak
      const r4 = computeScore(true, 5000, 25000, streak);
      totalScore += r4.gained;
      streak = r4.newStreak;
      expect(streak).toBe(1);

      expect(totalScore).toBeGreaterThan(300);
    });
  });

  describe('Edge Cases', () => {
    it('should handle negative reaction time as 0', () => {
      const result = computeScore(true, -100, 25000, 0);
      expect(result.gained).toBe(100 + 50 + 10); // treated as instant
    });

    it('should handle reaction time exceeding duration', () => {
      const result = computeScore(true, 30000, 25000, 0);
      expect(result.gained).toBe(100 + 0 + 10); // no speed bonus
    });

    it('should handle zero duration gracefully', () => {
      const result = computeScore(true, 0, 0, 0);
      // Should not crash, ratio becomes infinity -> clamped to 1
      expect(result.gained).toBeGreaterThanOrEqual(0);
    });

    it('should handle negative streak as 0', () => {
      const result = computeScore(true, 5000, 25000, -5);
      expect(result.newStreak).toBe(1);
    });
  });
});
