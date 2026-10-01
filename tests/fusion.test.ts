import { describe, expect, it } from 'vitest';
import { FUSIONS, MEMBERS, SKILLS, fusionResult } from '../src/core/data';
import { newMeta } from '../src/core/meta';
import {
  FUSION_SHOP_COST, MIN_DECK, buyFusion, canFuse, cardPool, fuseCards, fusionPartners, memberBaseDeck, memberSkills, newRun, upgradeSkill,
} from '../src/core/run';
import { createBattle, startPlayerTurn } from '../src/core/battle';
import { buildSetup } from '../src/core/run';

const K = 0, E = 1;

describe('融合のレシピ', () => {
  it('全てのレシピの素材と結果が定義済みで、結果は融合カード・報酬には出ない', () => {
    for (const f of FUSIONS) {
      expect(SKILLS[f.a], f.a).toBeDefined();
      expect(SKILLS[f.b], f.b).toBeDefined();
      expect(SKILLS[f.result].fusion, f.result).toBe(true);
    }
    for (const id of cardPool()) expect(SKILLS[id].fusion).toBeUndefined();
  });
  it('順不同で引け、同じ組み合わせが重複しない', () => {
    expect(fusionResult('slash', 'shield_bash')).toBe('crush_slash');
    expect(fusionResult('shield_bash', 'slash')).toBe('crush_slash');
    expect(fusionResult('slash', 'firebolt')).toBeNull();
    const keys = FUSIONS.map((f) => [f.a, f.b].sort().join('+'));
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('レシピは各キャラの初期デッキだけで作れるものが揃っている(ナイト5・エレメンタリスト以上)', () => {
    const can = (role: 'knight' | 'elementalist') => FUSIONS.filter((f) => {
      const d = MEMBERS[role].deck;
      return f.a === f.b ? d.filter((c) => c === f.a).length >= 2 : d.includes(f.a) && d.includes(f.b);
    }).length;
    expect(can('knight')).toBeGreaterThanOrEqual(4);
    expect(can('elementalist')).toBeGreaterThanOrEqual(5);
  });
  it('融合カードは強い(素材2枚分より、1枚としての威力が高い)', () => {
    expect(SKILLS.thunderbolt.damage!).toBeGreaterThan(SKILLS.thunder.damage!);
    expect(SKILLS.blaze.damage!).toBeGreaterThan(SKILLS.firebolt.damage!);
    expect(SKILLS.twin_slash.damage!).toBeGreaterThan(SKILLS.slash.damage!);
  });
});

describe('融合の実行', () => {
  it('2枚が1枚になり、デッキが1枚減る', () => {
    const run = newRun(newMeta(), 41);
    const n = run.party[K].deck.length;
    expect(fuseCards(run, K, 'slash', 'shield_bash')).toBe('crush_slash');
    const d = run.party[K].deck;
    expect(d).toHaveLength(n - 1);
    expect(d.filter((c) => c === 'slash')).toHaveLength(2);
    expect(d.filter((c) => c === 'shield_bash')).toHaveLength(1);
    expect(d).toContain('crush_slash');
  });
  it('同じカード同士は2枚持っているときだけ。1枚しかなければ失敗', () => {
    const run = newRun(newMeta(), 42);
    expect(canFuse(run, K, 'slash', 'slash')).toBe(true); // 斬撃は3枚
    expect(canFuse(run, E, 'thunder', 'thunder')).toBe(false); // サンダーは1枚
    expect(fuseCards(run, E, 'thunder', 'thunder')).toBeNull();
    expect(canFuse(run, E, 'firebolt', 'firebolt')).toBe(true);
  });
  it('持っていない/レシピが無い組み合わせは失敗し、デッキは変わらない', () => {
    const run = newRun(newMeta(), 43);
    const before = [...run.party[E].deck];
    expect(fuseCards(run, E, 'firebolt', 'slash')).toBeNull();
    expect(fuseCards(run, E, 'blaze', 'firebolt')).toBeNull();
    expect(run.party[E].deck).toEqual(before);
  });
  it('最小枚数(6)を下回るような融合はできない', () => {
    const run = newRun(newMeta(), 44);
    run.party[K].deck = ['slash', 'slash', 'shield_bash', 'defend', 'guardian', 'wait'];
    expect(run.party[K].deck).toHaveLength(MIN_DECK);
    expect(canFuse(run, K, 'slash', 'shield_bash')).toBe(false);
  });
  it('融合相手の候補を列挙できる', () => {
    const run = newRun(newMeta(), 45);
    expect(fusionPartners(run, K, 'slash').sort()).toEqual(['shield_bash', 'slash']);
    expect(fusionPartners(run, E, 'wait')).toEqual([]);
  });
  it('ショップの融合は有料(ゴールド不足なら失敗)', () => {
    const run = newRun(newMeta(), 46);
    run.gold = FUSION_SHOP_COST - 1;
    expect(buyFusion(run, K, 'slash', 'shield_bash')).toBeNull();
    run.gold = FUSION_SHOP_COST + 5;
    expect(buyFusion(run, K, 'slash', 'shield_bash')).toBe('crush_slash');
    expect(run.gold).toBe(5);
  });
  it('融合カードは強化の対象になり、戦闘のデッキに入って使える', () => {
    const run = newRun(newMeta(), 47);
    fuseCards(run, E, 'firebolt', 'firebolt');
    expect(memberSkills(run, E)).toContain('blaze');
    expect(memberBaseDeck(run, E)).toContain('blaze');
    run.skillPoints = 5;
    expect(upgradeSkill(run, E, 'blaze')).toBe(true);
    const s = createBattle('slime', buildSetup(run));
    startPlayerTurn(s);
    const all = [...s.party[E].deck.draw, ...s.party[E].deck.hand].map((c) => c.defId);
    expect(all).toContain('blaze');
    expect(all).toHaveLength(MEMBERS.elementalist.deck.length - 1);
    expect(s.party[E].levels.blaze).toBe(2);
  });
  it('連続で融合できる(融合カードと別のカード)', () => {
    const run = newRun(newMeta(), 48);
    fuseCards(run, K, 'slash', 'slash');
    expect(fuseCards(run, K, 'slash', 'shield_bash')).toBe('crush_slash');
    expect(run.party[K].deck).toHaveLength(MEMBERS.knight.deck.length - 2);
  });
});
