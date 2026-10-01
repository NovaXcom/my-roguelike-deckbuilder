import { describe, expect, it } from 'vitest';
import { applyResult, betterRank, dailySeed, formatTime, newSave, rankFor } from '../src/game/Progress';

describe('ranks', () => {
  it('thresholds relative to par, with a 2s penalty per death', () => {
    expect(rankFor(50, 0, 60)).toBe('S');
    expect(rankFor(60, 0, 60)).toBe('S');
    expect(rankFor(70, 0, 60)).toBe('A');
    expect(rankFor(90, 0, 60)).toBe('B');
    expect(rankFor(120, 0, 60)).toBe('C');
    expect(rankFor(58, 2, 60)).toBe('A'); // 58 + 4 > 60
  });
  it('betterRank keeps the higher one', () => {
    expect(betterRank('B', 'S')).toBe('S');
    expect(betterRank('A', 'C')).toBe('A');
  });
});

describe('results', () => {
  it('records the first clear, unlocks the next stage, and keeps the best time', () => {
    const s = newSave();
    const r1 = applyResult(s, 's1', 1, 80, 0, 60);
    expect(r1.newBest).toBe(true);
    expect(r1.previousBest).toBeNull();
    expect(s.unlocked).toBe(2);
    const r2 = applyResult(s, 's1', 1, 90, 0, 60);
    expect(r2.newBest).toBe(false);
    expect(s.records.s1.bestTime).toBe(80);
    expect(s.records.s1.clears).toBe(2);
    const r3 = applyResult(s, 's1', 1, 55, 0, 60);
    expect(r3.newBest).toBe(true);
    expect(s.records.s1.bestRank).toBe('S');
  });
  it('never unlocks beyond the last stage, and daily runs unlock nothing', () => {
    const s = newSave();
    applyResult(s, 's5', 5, 100, 0, 60);
    expect(s.unlocked).toBe(5);
    const t = newSave();
    applyResult(t, 'daily', 0, 100, 0, 60);
    expect(t.unlocked).toBe(1);
  });
});

describe('helpers', () => {
  it('formats times', () => {
    expect(formatTime(5.5)).toBe('0:05.50');
    expect(formatTime(125.04)).toBe('2:05.04');
  });
  it('daily seed is the date', () => {
    expect(dailySeed(new Date(Date.UTC(2026, 9, 1)))).toBe(20261001);
  });
});
