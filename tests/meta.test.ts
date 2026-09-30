import { describe, expect, it } from 'vitest';
import { createBattle, startPlayerTurn, previewSkill } from '../src/core/battle';
import { SKILLS } from '../src/core/data';
import {
  MAX_LEVEL, PASSIVES, parseMeta, UPGRADE_COST, newMeta, passivesFor, startGearQuality, startingPotions, upgrade, upgradeCost,
} from '../src/core/meta';
import { bankRun, buildSetup, memberMaxHp, newRun } from '../src/core/run';
import { MEMBERS } from '../src/core/data';

describe('拠点の永続成長', () => {
  it('魔導石が足りないと強化できず、足りれば消費してレベルアップ', () => {
    const m = newMeta();
    expect(upgrade(m, 'smith')).toBe(false);
    m.stones = 100;
    expect(upgrade(m, 'smith')).toBe(true);
    expect(m.smith).toBe(1);
    expect(m.stones).toBe(100 - UPGRADE_COST.smith[0]);
    expect(upgradeCost(m, 'smith')).toBe(UPGRADE_COST.smith[1]);
  });
  it('最大レベルで打ち止め', () => {
    const m = newMeta();
    m.stones = 99999;
    for (let i = 0; i < 10; i++) upgrade(m, 'training');
    expect(m.training).toBe(MAX_LEVEL);
    expect(upgradeCost(m, 'training')).toBeNull();
    expect(upgrade(m, 'training')).toBe(false);
  });
  it('錬金所: ポーション所持数が増える', () => {
    expect(startingPotions(0)).toBe(1);
    expect(startingPotions(5)).toBe(6);
    const m = newMeta(); m.alchemy = 3;
    expect(newRun(m, 1).potions).toBe(4);
  });
  it('鍛冶屋: 初期装備の品質が上がる', () => {
    expect(startGearQuality(0)).toEqual({ rarity: 'common', scale: 1 });
    expect(startGearQuality(3).rarity).toBe('rare');
    expect(startGearQuality(5).rarity).toBe('legendary');
    const lv = (smith: number) => {
      const m = newMeta(); m.smith = smith;
      return newRun(m, 1).party[0].gear;
    };
    expect(lv(0).weapon!.rarity).toBe('common');
    expect(lv(3).weapon!.rarity).toBe('rare');
    expect(lv(3).weapon!.skill).toBeTruthy(); // Rare武器は固有スキル付き
    expect(lv(5).weapon!.rarity).toBe('legendary');
    expect(lv(2).armor!.stats.hp).toBeGreaterThan(lv(0).armor!.stats.hp);
  });
  it('訓練所: レベルごとにパッシブが解放される', () => {
    expect(PASSIVES).toHaveLength(MAX_LEVEL);
    expect(passivesFor(0)).toEqual({ hp: 0, power: 0, breakBonus: 0, chainBonus: 0, knightOpeningGuard: 0 });
    expect(passivesFor(1).hp).toBe(8);
    expect(passivesFor(2).knightOpeningGuard).toBe(8);
    expect(passivesFor(3).chainBonus).toBe(0.25);
    expect(passivesFor(4).breakBonus).toBe(3);
    expect(passivesFor(5).power).toBe(2);
  });
  it('パッシブが戦闘に反映される（最大HP・開始ガード・チェイン倍率・攻撃）', () => {
    const base = newMeta();
    const trained = newMeta(); trained.training = 5;
    const r0 = newRun(base, 1), r5 = newRun(trained, 1);
    expect(memberMaxHp(r5, 0)).toBe(memberMaxHp(r0, 0) + 8);
    const s = createBattle('slime', buildSetup(r5));
    startPlayerTurn(s);
    expect(s.party[0].guard).toBe(8); // ナイトのみ
    expect(s.party[1].guard).toBe(0);
    expect(s.chainMult).toBe(2.25);
    s.enemy.broken = true; s.enemy.shield = 0;
    // 見習いの杖+2 と英雄の器+2 → (7+4)*1.5*2.25
    expect(previewSkill(s, SKILLS.firebolt, 1).hp).toBe(Math.floor(11 * 1.5 * 2.25));
    expect(MEMBERS.knight.maxHp + 8 + 10).toBe(memberMaxHp(r5, 0));
  });
  it('ラン終了時に魔導石を1度だけ持ち帰る', () => {
    const meta = newMeta();
    const run = newRun(meta, 1);
    run.stones = 37;
    run.finished = 'victory';
    expect(bankRun(meta, run)).toBe(37);
    expect(bankRun(meta, run)).toBe(0);
    expect(meta.stones).toBe(37);
    expect(meta.runs).toBe(1);
    expect(meta.clears).toBe(1);
  });
  it('保存データの復元: 正常値はそのまま、壊れた値は安全な値に', () => {
    expect(parseMeta(JSON.stringify({ stones: 12, smith: 2, alchemy: 1, training: 3, runs: 4, clears: 1 })))
      .toEqual({ stones: 12, smith: 2, alchemy: 1, training: 3, runs: 4, clears: 1 });
    expect(parseMeta(null)).toEqual(newMeta());
    expect(parseMeta('{oops')).toEqual(newMeta());
    const bad = parseMeta(JSON.stringify({ stones: -5, smith: 99, alchemy: 'x', training: 2.7 }));
    expect(bad).toMatchObject({ stones: 0, smith: 5, alchemy: 0, training: 2 });
  });
});
