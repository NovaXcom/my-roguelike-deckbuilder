import { describe, expect, it } from 'vitest';
import { BGM_TARGET_DB, SFX_KINDS, SFX_TARGET_DB } from '../src/audio';

describe('音量設計（ラウドネス階層）', () => {
  it('全ての効果音に目標ラウドネスがあり、現実的な範囲(-40〜-5dBFS)にある', () => {
    expect(new Set(SFX_KINDS).size).toBe(SFX_KINDS.length);
    for (const k of SFX_KINDS) {
      expect(SFX_TARGET_DB[k], k).toBeDefined();
      expect(SFX_TARGET_DB[k]).toBeGreaterThanOrEqual(-40);
      expect(SFX_TARGET_DB[k]).toBeLessThanOrEqual(-5);
    }
    expect(Object.keys(SFX_TARGET_DB).sort()).toEqual([...SFX_KINDS].sort());
  });
  it('UI音 < 通常SE < 戦闘SE < ブレイク < チェイン の順に大きい', () => {
    const d = SFX_TARGET_DB;
    expect(d.hover).toBeLessThan(d.click);
    expect(d.click).toBeLessThan(d.skill);
    expect(d.skill).toBeLessThan(d.hit);
    expect(d.hit).toBeLessThan(d.break);
    expect(d.break).toBeLessThan(d.chain);
    expect(d.enemyHit).toBeGreaterThan(d.block);
  });
  it('BGMは戦闘SEを覆い隠さない（戦闘SEより10dB以上小さい）', () => {
    for (const k of ['skill', 'magic', 'enemyHit', 'hit', 'block', 'break', 'chain'] as const) {
      expect(SFX_TARGET_DB[k] - BGM_TARGET_DB, k).toBeGreaterThanOrEqual(10);
    }
  });
});
