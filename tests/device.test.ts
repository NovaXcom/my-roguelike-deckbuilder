import { describe, expect, it } from 'vitest';
import { COMPACT_SCALE, decideCompact, fitScale } from '../src/ui/device';
import { SKILLS } from '../src/core/data';
import { skillSummary } from '../src/ui/skillText';

describe('端末判定（コンパクトUI）', () => {
  it('FIT倍率は幅・高さの小さい方で決まる', () => {
    expect(fitScale(1280, 720)).toBe(1);
    expect(fitScale(844, 390)).toBeCloseTo(390 / 720, 5);
    expect(fitScale(2560, 720)).toBe(1);
  });
  it('スマホ横向き(844x390, 932x430)はコンパクト、PC/大型タブレットは通常', () => {
    expect(decideCompact(844, 390, true)).toBe(true);
    expect(decideCompact(932, 430, true)).toBe(true);
    expect(decideCompact(1280, 720, false)).toBe(false);
    expect(decideCompact(1024, 768, true)).toBe(false); // iPad横向き: 倍率0.8 → 通常UI
    expect(fitScale(1024, 768)).toBeGreaterThanOrEqual(COMPACT_SCALE);
  });
  it('タッチでないPCの小さなウィンドウはコンパクトにしない', () => {
    expect(decideCompact(640, 360, false)).toBe(false);
  });
});

describe('スキル要点表示', () => {
  it('威力・ゲージ・ガード・回復・挑発を短く表す', () => {
    expect(skillSummary(SKILLS.slash)).toEqual(['威力 8', 'ゲージ -8']);
    expect(skillSummary(SKILLS.provoke)).toEqual(['ガード 10', '挑発']);
    expect(skillSummary(SKILLS.guardian)).toEqual(['ガード 6/10']);
    expect(skillSummary(SKILLS.heal)).toEqual(['全体回復 12']);
    expect(skillSummary(SKILLS.holy_strike)).toContain('全体回復 6');
  });
  it('全スキルに1行以上の要点がある', () => {
    for (const sk of Object.values(SKILLS)) expect(skillSummary(sk).length, sk.id).toBeGreaterThan(0);
  });
});
