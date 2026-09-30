import { describe, expect, it } from 'vitest';
import { damageTier, hitStopMs, popupFontSize, shakeFor, shouldFlashHurt, sparkCount, type ImpactKind } from '../src/ui/juice';

const kinds: ImpactKind[] = ['hit', 'hurt', 'break', 'chain'];

describe('Juice パラメータ', () => {
  it('ダメージ段階の境界', () => {
    expect([0, 7, 8, 14, 15, 24, 25, 99].map(damageTier)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
  it('ヒットストップは 50〜170ms に収まり、ダメージが大きいほど長い(飽和あり)', () => {
    for (const k of kinds) for (const a of [0, 1, 10, 30, 200]) {
      const ms = hitStopMs(a, k);
      expect(ms).toBeGreaterThanOrEqual(50);
      expect(ms).toBeLessThanOrEqual(170);
    }
    expect(hitStopMs(20, 'hit')).toBeGreaterThan(hitStopMs(3, 'hit'));
    expect(hitStopMs(20, 'hurt')).toBeGreaterThan(hitStopMs(3, 'hurt'));
    expect(hitStopMs(999, 'hit')).toBe(hitStopMs(100, 'hit')); // 上限で飽和
  });
  it('画面揺れは強さ・時間が単調増加で上限あり。チェイン>ブレイク>通常ヒット', () => {
    const small = shakeFor(3, 'hit'), big = shakeFor(30, 'hit');
    expect(big.intensity).toBeGreaterThan(small.intensity);
    expect(big.ms).toBeGreaterThan(small.ms);
    expect(shakeFor(999, 'hit').intensity).toBeLessThanOrEqual(0.016);
    expect(shakeFor(0, 'chain').intensity).toBeGreaterThan(shakeFor(0, 'break').intensity);
    expect(shakeFor(0, 'break').intensity).toBeGreaterThan(shakeFor(999, 'hit').intensity);
    expect(shakeFor(0, 'break').intensity).toBeGreaterThan(shakeFor(999, 'hurt').intensity);
    for (const k of kinds) expect(shakeFor(50, k).intensity).toBeLessThanOrEqual(0.035);
  });
  it('ダメージ数字はダメージ・弱点・チェインで大きくなる', () => {
    expect(popupFontSize(30)).toBeGreaterThan(popupFontSize(3));
    expect(popupFontSize(10, { weak: true })).toBeGreaterThan(popupFontSize(10));
    expect(popupFontSize(10, { chain: true })).toBeGreaterThan(popupFontSize(10, { weak: true }));
    expect(popupFontSize(9999)).toBeLessThanOrEqual(Math.round(66 * 1.5));
  });
  it('赤フラッシュは大ダメージのみ、火花はダメージで増える', () => {
    expect(shouldFlashHurt(5)).toBe(false);
    expect(shouldFlashHurt(15)).toBe(true);
    expect(sparkCount(30)).toBeGreaterThan(sparkCount(3));
  });
});
