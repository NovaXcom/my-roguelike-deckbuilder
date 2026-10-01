import { describe, expect, it } from 'vitest';
import {
  LINK, LINK_HAND, canUse, createBattle, defaultSetup, endPlayerTurn, nextConvert, previewSkill, startPlayerTurn, useSkill,
  type BattleSetup, type BattleState,
} from '../src/core/battle';
import { MEMBERS, SKILLS, START_LINK_DECK } from '../src/core/data';
import { canAppend, simulatePlan, summarizePlan, type PlanStep } from '../src/core/plan';
import { addCard, buildSetup, newRun } from '../src/core/run';
import { newMeta } from '../src/core/meta';
import { fullHand } from './helpers/hand';

const K = 0, E = 1;
const setupWith = (link: string[], seed = 1): BattleSetup => {
  const st = defaultSetup();
  st.seed = seed;
  st.link = link;
  st.members.forEach((m) => { m.deck = [...MEMBERS[m.role].deck]; });
  return st;
};
const fresh = (link = START_LINK_DECK, ids: string | string[] = 'skeleton', seed = 1): BattleState => {
  const s = createBattle(ids, setupWith(link, seed));
  startPlayerTurn(s);
  fullHand(s);
  return s;
};
/** 指定した連携カードを手札に持たせる */
const giveLink = (s: BattleState, ...ids: string[]): void => {
  s.link.hand = ids.map((defId, i) => ({ uid: 700 + i, defId, sealed: 0 }));
};
const st = (member: number, skillId: string, target?: number): PlanStep => ({ member, skillId, target });

describe('連携デッキ', () => {
  it('初期は4枚で、1ターン目は2枚引き、以後毎ターン1枚引く(手札は最大2枚)', () => {
    const s = createBattle('skeleton', setupWith(START_LINK_DECK));
    startPlayerTurn(s);
    expect(s.link.hand).toHaveLength(LINK_HAND);
    expect(s.link.hand.length + s.link.draw.length + s.link.discard.length + s.link.fatigued.length).toBe(4);
    endPlayerTurn(s);
    expect(s.link.hand.length).toBeLessThanOrEqual(LINK_HAND);
  });
  it('連携カードは定義済みで、通常のデッキには含まれない', () => {
    for (const id of START_LINK_DECK) expect(SKILLS[id].link, id).toBeDefined();
    for (const r of ['knight', 'elementalist'] as const) for (const id of MEMBERS[r].deck) expect(SKILLS[id].link).toBeUndefined();
  });
  it('連携デッキが空なら連携カードは出ない(旧方式)', () => {
    const s = createBattle('skeleton');
    startPlayerTurn(s);
    expect(s.link.hand).toHaveLength(0);
  });
  it('ランに連携デッキがあり、報酬の連携カードはそこへ入る', () => {
    const run = newRun(newMeta(), 3);
    expect(run.linkDeck).toEqual(START_LINK_DECK);
    expect(addCard(run, 'barrier')).toBe(true);
    expect(run.linkDeck).toContain('barrier');
    expect(buildSetup(run).link).toContain('barrier');
  });
});

describe('追撃', () => {
  it('直前の攻撃と同じ敵に、そのダメージの50%を与える。攻撃の前は使えない', () => {
    const s = fresh();
    giveLink(s, 'chase');
    expect(canUse(s, LINK, 'chase')).toBe(false);
    const hp0 = s.enemies[0].hp;
    const p = previewSkill(s, SKILLS.firebolt, E, 0);
    useSkill(s, E, 'firebolt', 0);
    const hp1 = s.enemies[0].hp;
    expect(hp0 - hp1).toBe(p.hp - p.absorbed);
    expect(canUse(s, LINK, 'chase')).toBe(true);
    useSkill(s, LINK, 'chase');
    expect(hp1 - s.enemies[0].hp).toBeGreaterThan(0);
    expect(hp1 - s.enemies[0].hp).toBeLessThanOrEqual(Math.ceil(p.hp * 0.5));
  });
  it('複数編成では、直前に攻撃した敵に当たる', () => {
    const s = fresh(START_LINK_DECK, ['slime', 'bat']);
    giveLink(s, 'chase');
    useSkill(s, E, 'firebolt', 1);
    const hp0 = s.enemies[0].hp;
    useSkill(s, LINK, 'chase');
    expect(s.enemies[0].hp).toBe(hp0);
    expect(s.enemies[1].hp).toBeLessThan(s.enemies[1].maxHp - 0);
  });
  it('追撃で敵を倒せる', () => {
    const s = fresh(START_LINK_DECK, ['slime']);
    giveLink(s, 'chase');
    s.enemies[0].hp = 40;
    useSkill(s, K, 'slash', 0);
    s.enemies[0].hp = 1;
    const ev = useSkill(s, LINK, 'chase')!;
    expect(ev.some((e) => e.type === 'enemyDown')).toBe(true);
    expect(s.phase).toBe('won');
  });
});

describe('魔力付与', () => {
  it('魔法の後に使うと、次の物理攻撃に属性が付き、反応の起点になる', () => {
    const s = fresh(START_LINK_DECK, 'golem');
    giveLink(s, 'enchant');
    expect(canUse(s, LINK, 'enchant')).toBe(false); // 魔法を撃つ前は使えない
    useSkill(s, E, 'thunder', 0);
    useSkill(s, LINK, 'enchant');
    expect(s.enchant).toBe('thunder');
    // ゴーレム(弱点: 氷)に氷の魔法→付与された雷の物理は弱点でも耐性でもない。属性なしと比べて lastElement が変わる
    useSkill(s, K, 'slash', 0);
    expect(s.enemies[0].lastElement).toBe('thunder');
    expect(s.enchant).toBeNull();
  });
  it('付与された属性は弱点を突ける', () => {
    const s = fresh(START_LINK_DECK, 'skeleton'); // 弱点: 雷
    giveLink(s, 'enchant');
    useSkill(s, E, 'thunder', 0);
    const plain = previewSkill(s, SKILLS.slash, K, 0).hp;
    useSkill(s, LINK, 'enchant');
    expect(previewSkill(s, SKILLS.slash, K, 0).hp).toBeGreaterThan(plain);
  });
  it('付与された物理攻撃のあと、ブレイク中に魔法を撃つと属性反応が起きる', () => {
    const s = fresh(START_LINK_DECK, 'skeleton');
    giveLink(s, 'enchant');
    useSkill(s, E, 'firebolt', 0); // lastMagic=火
    useSkill(s, LINK, 'enchant');
    useSkill(s, K, 'shield_bash', 0); // 火属性の物理 → lastElement=火、ブレイク
    expect(s.enemies[0].broken).toBe(true);
    expect(s.enemies[0].lastElement).toBe('fire');
    expect(previewSkill(s, SKILLS.thunder, E, 0).reaction?.id).toBe('shock');
  });
});

describe('属性変換', () => {
  it('敵の最後の属性を 火→雷→氷→火 に進める(AP0)', () => {
    expect(nextConvert(null)).toBe('fire');
    expect(nextConvert('fire')).toBe('thunder');
    expect(nextConvert('thunder')).toBe('ice');
    expect(nextConvert('ice')).toBe('fire');
    const s = fresh();
    giveLink(s, 'convert');
    s.enemies[0].lastElement = 'fire';
    const ap = s.ap;
    useSkill(s, LINK, 'convert', 0);
    expect(s.enemies[0].lastElement).toBe('thunder');
    expect(s.ap).toBe(ap); // AP0
  });
  it('変換で狙った反応を起こせる(氷の後に雷→凍結粉砕、火に変換して雷→感電爆発)', () => {
    const s = fresh(START_LINK_DECK, 'skeleton');
    giveLink(s, 'convert');
    s.enemies[0].broken = true; s.enemies[0].shield = 0;
    s.enemies[0].lastElement = 'ice';
    expect(previewSkill(s, SKILLS.thunder, E, 0).reaction?.id).toBe('shatter');
    useSkill(s, LINK, 'convert', 0); // ice → fire
    expect(previewSkill(s, SKILLS.thunder, E, 0).reaction?.id).toBe('shock');
  });
});

describe('反撃指令', () => {
  it('ナイトが攻撃を受けると、受ける前のガードに応じて反撃する', () => {
    const s = fresh(START_LINK_DECK, 'skeleton');
    giveLink(s, 'counter');
    useSkill(s, K, 'provoke'); // ガード10
    useSkill(s, LINK, 'counter');
    const hp0 = s.enemies[0].hp;
    const ev = endPlayerTurn(s);
    const c = ev.find((e) => e.type === 'counter');
    expect(c).toMatchObject({ enemy: 0, amount: 9 }); // 4 + 10/2
    expect(s.enemies[0].hp).toBe(hp0 - 9);
  });
  it('後衛だけが狙われたときは反撃しない。ターンをまたがない', () => {
    const s = fresh(START_LINK_DECK, 'bat');
    giveLink(s, 'counter');
    useSkill(s, LINK, 'counter');
    s.enemies[0].patternIndex = 0; // 急降下(後衛)
    expect(endPlayerTurn(s).some((e) => e.type === 'counter')).toBe(false);
    expect(s.counterOn).toBe(false);
  });
  it('反撃で敵が倒れたら、吸血で復活しない', () => {
    const s = fresh(START_LINK_DECK, 'bat');
    giveLink(s, 'counter');
    useSkill(s, LINK, 'counter');
    s.enemies[0].hp = 1;
    s.enemies[0].patternIndex = 3; // 体当たり(前衛)
    endPlayerTurn(s);
    expect(s.enemies[0].hp).toBe(0);
    expect(s.phase).toBe('won');
  });
});

describe('魔法障壁・協調', () => {
  it('魔法障壁はAP2で全員にガード10', () => {
    const s = fresh();
    giveLink(s, 'barrier');
    useSkill(s, LINK, 'barrier');
    expect(s.party.map((m) => m.guard)).toEqual([10, 10]);
    expect(s.ap).toBe(1);
  });
  it('協調は2人とも次の攻撃を強化する', () => {
    const s = fresh();
    giveLink(s, 'unison');
    const base = previewSkill(s, SKILLS.slash, K).shield;
    useSkill(s, LINK, 'unison');
    expect(s.party.every((m) => m.focus)).toBe(true);
    expect(previewSkill(s, SKILLS.slash, K).shield).toBe(base + 5);
  });
});

describe('作戦と連携カード', () => {
  it('追撃は、攻撃を予約した後にだけ予約できる(順序依存)', () => {
    const s = fresh();
    giveLink(s, 'chase');
    expect(canAppend(s, [], st(LINK, 'chase'))).toBe(false);
    expect(canAppend(s, [st(E, 'firebolt', 0)], st(LINK, 'chase'))).toBe(true);
  });
  it('順序で結果が変わる: 魔力付与→物理 と 物理→魔力付与', () => {
    const s = fresh(START_LINK_DECK, 'skeleton');
    giveLink(s, 'enchant');
    const a = simulatePlan(s, [st(E, 'thunder', 0), st(LINK, 'enchant'), st(K, 'slash', 0)]);
    const b = simulatePlan(s, [st(E, 'thunder', 0), st(K, 'slash', 0), st(LINK, 'enchant')]);
    expect(a.steps).toHaveLength(3);
    expect(b.steps).toHaveLength(3);
    expect(a.state.enemies[0].hp).toBeLessThan(b.state.enemies[0].hp); // 弱点属性が乗る
  });
  it('予想に連携カードの効果(追撃のダメージ)が含まれ、実際の戦闘状態は変わらない', () => {
    const s = fresh();
    giveLink(s, 'chase');
    const hp = s.enemies[0].hp;
    const plain = summarizePlan(s, [st(E, 'firebolt', 0)]).damage;
    const withChase = summarizePlan(s, [st(E, 'firebolt', 0), st(LINK, 'chase')]).damage;
    expect(withChase).toBeGreaterThan(plain);
    expect(s.enemies[0].hp).toBe(hp);
    expect(s.link.hand).toHaveLength(1);
  });
  it('手札に無い連携カードは予約できない', () => {
    const s = fresh();
    giveLink(s, 'counter');
    expect(canAppend(s, [], st(LINK, 'barrier'))).toBe(false);
  });
});
