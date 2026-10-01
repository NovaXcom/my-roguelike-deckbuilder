import { describe, expect, it } from 'vitest';
import { applyResult, betterRank, finalScore, formatTime, newSave, rankFor } from '../src/game/Progress';

describe('ranks', () => {
  it('thresholds relative to par', () => {
    expect(rankFor(1000, 1000)).toBe('S');
    expect(rankFor(800, 1000)).toBe('A');
    expect(rankFor(500, 1000)).toBe('B');
    expect(rankFor(100, 1000)).toBe('C');
  });
  it('damage subtracts from the score and never goes negative', () => {
    expect(finalScore(1000, 50)).toBe(800);
    expect(finalScore(100, 1000)).toBe(0);
  });
  it('betterRank keeps the higher one', () => {
    expect(betterRank('B', 'S')).toBe('S');
    expect(betterRank('A', 'C')).toBe('A');
  });
});

describe('results', () => {
  it('records the first clear, unlocks the next stage, and keeps the best score', () => {
    const s = newSave();
    const r1 = applyResult(s, 's1', 1, 900, 90, 1000);
    expect(r1.newBest).toBe(true);
    expect(s.unlocked).toBe(2);
    const r2 = applyResult(s, 's1', 1, 700, 80, 1000);
    expect(r2.newBest).toBe(false);
    expect(s.records.s1.bestScore).toBe(900);
    expect(s.records.s1.bestTime).toBe(80);
    expect(s.records.s1.clears).toBe(2);
    expect(applyResult(s, 's1', 1, 1200, 70, 1000).newBest).toBe(true);
    expect(s.records.s1.bestRank).toBe('S');
  });
  it('never unlocks beyond the last stage', () => {
    const s = newSave();
    applyResult(s, 's4', 4, 100, 100, 1000);
    expect(s.unlocked).toBe(4);
  });
});

describe('helpers', () => {
  it('formats times', () => {
    expect(formatTime(5.5)).toBe('0:05.5');
    expect(formatTime(125.04)).toBe('2:05.0');
  });
});
