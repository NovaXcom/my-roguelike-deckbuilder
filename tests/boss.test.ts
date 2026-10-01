import { describe, expect, it } from 'vitest';
import {
  createBattle, currentIntent, currentPhase, endPlayerTurn, enemyPattern, enemyResist, enemyWeak, intentValue, isEnraged,
  previewSkill, startPlayerTurn, useSkill, type BattleState,
} from '../src/core/battle';
import { ENEMIES, SKILLS } from '../src/core/data';
import { simulatePlan } from '../src/core/plan';
import { fullHand } from './helpers/hand';

const K = 0, E = 1;
const boss = (): BattleState => { const s = createBattle('dragon'); startPlayerTurn(s); return fullHand(s); };
const hit = (s: BattleState, ratio: number): void => { s.enemy.hp = Math.ceil(s.enemy.maxHp * ratio) + 1; };

describe('ボスの多段階化(竜)', () => {
  it('3つの形態があり、閾値は高い順・パターンは全形態にある', () => {
    const ph = ENEMIES.dragon.phases!;
    expect(ph).toHaveLength(2);
    expect(ph[0].below).toBeGreaterThan(ph[1].below);
    for (const p of ph) { expect(p.pattern!.length).toBeGreaterThan(2); expect(p.text).toBeTruthy(); }
    for (const e of Object.values(ENEMIES)) if (e.id !== 'dragon') expect(e.phases).toBeUndefined();
  });
  it('第1形態: 弱点は氷・火に耐性。HPが60%を超えている間は変化しない', () => {
    const s = boss();
    expect(s.enemy.phase).toBe(0);
    expect(currentPhase(s.enemy)).toBeNull();
    expect(enemyWeak(s.enemy)).toBe('ice');
    expect(enemyResist(s.enemy)).toBe('fire');
    hit(s, 0.7);
    useSkill(s, K, 'slash');
    expect(s.enemy.phase).toBe(0);
  });
  it('HP60%以下で第2形態: シールド全回復・ブレイク解除・弱点が雷へ・パターンが変わる', () => {
    const s = boss();
    s.enemy.broken = true; s.enemy.shield = 0;
    s.enemy.patternIndex = 3;
    hit(s, 0.6);
    const ev = useSkill(s, K, 'slash')!;
    expect(ev.find((e) => e.type === 'phase')).toMatchObject({ enemy: 0, index: 1, name: '翼を広げる' });
    expect(s.enemy.phase).toBe(1);
    expect(s.enemy.broken).toBe(false);
    expect(s.enemy.shield).toBe(s.enemy.maxShield);
    expect(s.enemy.patternIndex).toBe(0);
    expect(enemyWeak(s.enemy)).toBe('thunder');
    expect(enemyResist(s.enemy)).toBe('ice');
    expect(currentIntent(s).name).toBe('急降下');
    expect(currentIntent(s).target).toBe('back');
  });
  it('弱点・耐性の変化がダメージ計算に反映される(氷は第1形態で弱点、第2形態で耐性)', () => {
    const s = boss();
    expect(previewSkill(s, SKILLS.ice_lance, E).weak).toBe(true);
    hit(s, 0.6);
    useSkill(s, K, 'slash');
    const p = previewSkill(s, SKILLS.ice_lance, E);
    expect(p.weak).toBe(false);
    expect(p.resist).toBe(true);
    expect(previewSkill(s, SKILLS.thunder, E).weak).toBe(true);
    expect(previewSkill(s, SKILLS.firebolt, E).resist).toBe(false); // 火への耐性は第2形態で無くなる
  });
  it('HP25%以下で最終形態: 攻撃力上昇・大技の連発。激昂スプライト用の判定が立つ', () => {
    const s = boss();
    const v0 = intentValue(s, { name: 'x', value: 10, target: 'front' });
    hit(s, 0.25);
    const ev = useSkill(s, K, 'slash')!;
    expect(ev.filter((e) => e.type === 'phase').map((e) => e.type === 'phase' && e.index)).toEqual([1, 2]); // 一気に2段階
    expect(s.enemy.phase).toBe(2);
    expect(isEnraged(s.enemy)).toBe(true);
    expect(intentValue(s, { name: 'x', value: 10, target: 'front' })).toBeGreaterThan(v0 * 1.3);
    const heavy = enemyPattern(s.enemy).filter((p) => p.kind === 'heavy').length;
    expect(heavy).toBeGreaterThanOrEqual(2);
    expect(enemyResist(s.enemy)).toBe('none');
  });
  it('形態変化は1度だけ。HPが回復しても戻らない', () => {
    const s = boss();
    hit(s, 0.5);
    useSkill(s, K, 'slash');
    expect(s.enemy.phase).toBe(1);
    s.enemy.hp = s.enemy.maxHp;
    useSkill(s, E, 'firebolt');
    expect(s.enemy.phase).toBe(1);
  });
  it('継続ダメージ・追撃・作戦の予想でも形態が変わる', () => {
    const s = boss();
    hit(s, 0.6);
    s.enemy.burn = { turns: 2, dmg: 30 };
    const ev = endPlayerTurn(s);
    expect(ev.some((e) => e.type === 'phase')).toBe(true);
    expect(s.enemy.phase).toBe(1);
    const t = boss();
    hit(t, 0.62);
    const r = simulatePlan(t, [{ member: E, skillId: 'thunder', target: 0 }]);
    expect(r.state.enemy.phase).toBe(1);
    expect(t.enemy.phase).toBe(0); // 予想は実際の状態を変えない
  });
  it('倒せば形態変化せずに勝利する', () => {
    const s = boss();
    s.enemy.hp = 1;
    const ev = useSkill(s, K, 'slash')!;
    expect(ev.some((e) => e.type === 'phase')).toBe(false);
    expect(s.phase).toBe('won');
  });
  it('形態移行で大技の予告も更新され、ブレイクで阻止できる', () => {
    const s = boss();
    hit(s, 0.6);
    useSkill(s, K, 'slash');
    s.enemy.patternIndex = 3;
    expect(currentIntent(s).kind).toBe('heavy');
    s.enemy.broken = true; s.enemy.shield = 0;
    const hp = s.party.map((m) => m.hp);
    endPlayerTurn(s);
    expect(s.party.map((m) => m.hp)).toEqual(hp);
  });
});

import { recommend } from '../src/core/hint';
describe('ボス戦のヒント', () => {
  it('形態変化が近いと、ブレイクの温存を促す(任意ヒント)', () => {
    const s = boss();
    expect(recommend(s)).not.toContain('形態変化');
    hit(s, 0.65);
    expect(recommend(s)).toContain('形態変化');
  });
});
