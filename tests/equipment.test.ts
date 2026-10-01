import { fullHand } from './helpers/hand';
import { describe, expect, it } from 'vitest';
import { createBattle, previewSkill, startPlayerTurn, useSkill } from '../src/core/battle';
import { SKILLS } from '../src/core/data';
import {
  EQUIP_TEMPLATES, makeItem, rollItem, rollRarity, statLines, templatesFor, type Rarity, type Slot,
} from '../src/core/equipment';
import { newMeta } from '../src/core/meta';
import { Rng } from '../src/core/rng';
import { buildSetup, canEquip, equip, gearStats, memberMaxHp, memberSkills, newRun } from '../src/core/run';

const tpl = (id: string) => EQUIP_TEMPLATES.find((t) => t.id === id)!;

describe('装備データ', () => {
  it('装備固有スキルは全て実在する', () => {
    for (const t of EQUIP_TEMPLATES) if (t.skill) expect(SKILLS[t.skill], t.id).toBeDefined();
  });
  it('全ロール×スロット×レア度で候補が1つ以上ある', () => {
    for (const rarity of ['common', 'rare', 'legendary'] as Rarity[])
      for (const slot of ['weapon', 'armor', 'accessory'] as Slot[])
        for (const role of ['knight', 'elementalist'] as const)
          expect(templatesFor(rarity, { slot, role }).length, `${rarity}/${slot}/${role}`).toBeGreaterThan(0);
  });
  it('Legendary武器は必ず固有スキルを持つ', () => {
    for (const t of EQUIP_TEMPLATES.filter((e) => e.rarity === 'legendary' && e.slot === 'weapon')) expect(t.skill).toBeTruthy();
  });
  it('竜のツメを装備するとドラゴンスラッシュが使える', () => {
    expect(tpl('dragon_claw').skill).toBe('dragon_slash');
    expect(SKILLS.dragon_slash.name).toBe('ドラゴンスラッシュ');
  });
});

describe('ドロップ', () => {
  it('ボス報酬は必ずLegendary', () => {
    const rng = new Rng(5);
    for (let i = 0; i < 30; i++) expect(rollItem(rng, 'boss', i).rarity).toBe('legendary');
  });
  it('レア度の出現分布: 戦闘はCommon中心、宝箱はRare以上が多い', () => {
    const rng = new Rng(11);
    const count = (src: 'battle' | 'chest') => {
      const c = { common: 0, rare: 0, legendary: 0 };
      for (let i = 0; i < 2000; i++) c[rollRarity(rng, src)]++;
      return c;
    };
    const b = count('battle'), c = count('chest');
    expect(b.common).toBeGreaterThan(b.rare);
    expect(b.rare).toBeGreaterThan(b.legendary);
    expect(b.legendary).toBeGreaterThan(0);
    expect(c.rare + c.legendary).toBeGreaterThan(c.common);
  });
  it('数値には揺らぎがあり常に1以上、同じシードなら再現する', () => {
    const vals = new Set<number>();
    for (let s = 0; s < 40; s++) vals.add(makeItem(tpl('knight_armor'), 1, new Rng(s)).stats.hp);
    expect(vals.size).toBeGreaterThan(3);
    for (const v of vals) expect(v).toBeGreaterThanOrEqual(1);
    expect(rollItem(new Rng(9), 'chest', 1)).toEqual(rollItem(new Rng(9), 'chest', 1));
  });
  it('ステータス説明文を生成する', () => {
    expect(statLines(makeItem(tpl('dragon_heart'), 1, null).stats)).toEqual(['最大HP +30', '攻撃 +3', 'ブレイク +2']);
  });
});

describe('装備の効果', () => {
  const setup = () => newRun(newMeta(), 1);

  it('職業制限: 騎士の武器はエレメンタリストに装備できず、装飾は誰でも装備できる', () => {
    const run = setup();
    const sword = makeItem(tpl('knight_greatsword'), 100, null);
    expect(canEquip(run, 0, sword)).toBe(true);
    expect(canEquip(run, 1, sword)).toBe(false);
    expect(() => equip(run, 1, sword)).toThrow();
    const ring = makeItem(tpl('copper_ring'), 101, null);
    expect(canEquip(run, 0, ring) && canEquip(run, 1, ring)).toBe(true);
  });
  it('防具で最大HPと現在HPが増え、旧装備は売却される', () => {
    const run = setup();
    const max0 = memberMaxHp(run, 0);
    const gold0 = run.gold;
    const armor = makeItem(tpl('dragon_scale'), 100, null);
    const { replaced, sold } = equip(run, 0, armor);
    expect(replaced?.templateId).toBe('leather_armor');
    expect(sold).toBeGreaterThan(0);
    expect(run.gold).toBe(gold0 + sold);
    expect(memberMaxHp(run, 0)).toBe(max0 - 10 + 40);
    expect(run.party[0].hp).toBe(memberMaxHp(run, 0)); // 増加分だけ現在HPも増える
  });
  it('武器の固有スキルが使用可能になり、外すと消える', () => {
    const run = setup();
    expect(memberSkills(run, 0)).toHaveLength(6); // 基本4＋防御＋待機
    equip(run, 0, makeItem(tpl('dragon_claw'), 100, null));
    expect(memberSkills(run, 0)).toContain('dragon_slash');
    const s = fullHand(createBattle('slime', buildSetup(run)));
    startPlayerTurn(s);
    fullHand(s);
    expect(useSkill(s, 0, 'dragon_slash')).not.toBeNull();
    equip(run, 0, makeItem(tpl('iron_sword'), 101, null));
    expect(memberSkills(run, 0)).not.toContain('dragon_slash');
  });
  it('攻撃+ガード+ブレイク補正が戦闘計算に反映される', () => {
    const run = setup();
    equip(run, 0, makeItem(tpl('crusher_bangle'), 100, null)); // ブレイク+3, HP+8
    equip(run, 0, makeItem(tpl('guard_charm'), 101, null)); // 装飾は1枠 → 上書き: ガード+1
    const g = gearStats(run.party[0]);
    expect(g.guard).toBe(1);
    const s = createBattle('slime', buildSetup(run));
    startPlayerTurn(s);
    fullHand(s);
    const bare = createBattle('slime');
    startPlayerTurn(bare);
    // 鉄の剣(攻撃+2): 斬撃 8→10。シールド軽減: floor(10*0.5625)=5 (素は floor(8*0.5625)=4)
    expect(previewSkill(s, SKILLS.slash, 0).hp).toBe(5);
    expect(previewSkill(bare, SKILLS.slash, 0).hp).toBe(4);
    useSkill(s, 0, 'provoke'); // ガード10 + 装備ガード1
    expect(s.party[0].guard).toBe(11);
  });
  it('攻撃+はチェインダメージにも乗る', () => {
    const run = setup();
    const s = createBattle('slime', buildSetup(run)); // 見習いの杖: 攻撃+2
    startPlayerTurn(s);
    s.enemy.broken = true; s.enemy.shield = 0;
    expect(previewSkill(s, SKILLS.firebolt, 1).hp).toBe(Math.floor((7 + 2) * 1.5 * 2));
  });
});
