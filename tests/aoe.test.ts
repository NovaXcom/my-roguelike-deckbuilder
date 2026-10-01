import { describe, expect, it } from 'vitest';
import { createBattle, endPlayerTurn, previewSkill, resolveTarget, currentIntent, startPlayerTurn, useSkill } from '../src/core/battle';
import { ENEMIES, SKILLS } from '../src/core/data';
import { WAIT_ID, simulatePlan, summarizePlan } from '../src/core/plan';
import { recommend } from '../src/core/hint';

const K = 0, E = 1;
const fresh = (ids: string[]) => { const s = createBattle(ids); startPlayerTurn(s); return s; };
const withSkill = (s: ReturnType<typeof fresh>, member: number, id: string) => { s.party[member].skills.push(id); s.party[member].cooldowns[id] = 0; };

describe('全体攻撃', () => {
  it('敵全員にダメージとゲージ削りが入る(倍率つき)', () => {
    const s = fresh(['slime', 'slime', 'bat']);
    withSkill(s, E, 'blizzard');
    const before = s.enemies.map((e) => ({ hp: e.hp, sh: e.shield }));
    const ev = useSkill(s, E, 'blizzard')!;
    s.enemies.forEach((e, i) => { expect(e.hp).toBeLessThan(before[i].hp); expect(e.shield).toBeLessThan(before[i].sh); });
    expect(ev.filter((x) => x.type === 'damage').map((x) => x.type === 'damage' && x.enemy)).toEqual([0, 1, 2]);
    expect(s.ap).toBe(1); // 全体攻撃はAP2
  });
  it('単体より1体あたりの威力は低い(×0.7)', () => {
    const s = fresh(['bat']);
    withSkill(s, E, 'blizzard');
    const aoe = previewSkill(s, SKILLS.blizzard, E, 0);
    const single = previewSkill(s, { ...SKILLS.blizzard, aoe: undefined }, E, 0);
    expect(aoe.hp).toBeLessThan(single.hp);
    expect(aoe.shield).toBeLessThan(single.shield);
  });
  it('倒れている敵には当たらず、ゲージを削り切った敵だけブレイクする', () => {
    const s = fresh(['slime', 'bat', 'skeleton']);
    withSkill(s, K, 'cleave');
    s.enemies[1].hp = 0;
    s.enemies[0].shield = 5;
    const ev = useSkill(s, K, 'cleave')!;
    expect(ev.some((x) => x.type === 'damage' && x.enemy === 1)).toBe(false);
    expect(s.enemies[0].broken).toBe(true);
    expect(s.enemies[2].broken).toBe(false);
  });
  it('属性反応・チェインは、ブレイク中の敵ごとに発生する', () => {
    const s = fresh(['skeleton', 'skeleton']);
    withSkill(s, E, 'thunderstorm');
    for (const e of s.enemies) { e.broken = true; e.shield = 0; e.lastElement = 'fire'; }
    const ev = useSkill(s, E, 'thunderstorm')!;
    expect(ev.filter((x) => x.type === 'chain')).toHaveLength(2);
    expect(ev.filter((x) => x.type === 'reaction')).toHaveLength(2);
  });
  it('待機の強化(集中)は全体攻撃1回で消費される', () => {
    const s = fresh(['slime', 'slime']);
    withSkill(s, E, 'blizzard');
    s.party[E].focus = true;
    useSkill(s, E, 'blizzard');
    expect(s.party[E].focus).toBe(false);
  });
  it('全体攻撃で全員を倒すと勝利し、作戦の予想に撃破数が出る', () => {
    const s = fresh(['slime', 'slime']);
    withSkill(s, E, 'meteor');
    s.enemies.forEach((e) => { e.hp = 1; });
    const sm = summarizePlan(s, [{ member: E, skillId: 'meteor' }]);
    expect(sm.killed).toBe(2);
    expect(sm.kills).toBe(true);
    expect(simulatePlan(s, [{ member: E, skillId: 'meteor' }]).state.phase).toBe('won');
  });
  it('全体攻撃は装備スキル・レア報酬カード・融合カードのみ(基本スキルには無い)', () => {
    const aoeIds = Object.values(SKILLS).filter((x) => x.aoe).map((x) => x.id).sort();
    expect(aoeIds).toEqual(['blizzard', 'cleave', 'frost_nova', 'ice_storm', 'meteor', 'thunderstorm', 'whirlwind']);
    for (const id of ['slash', 'shield_bash', 'firebolt', 'ice_lance', 'thunder']) expect(SKILLS[id].aoe).toBeUndefined();
  });
});

describe('コウモリの妨害(超音波)', () => {
  it('コウモリの行動に妨害が含まれ、特性説明に載っている', () => {
    expect(ENEMIES.bat.pattern.some((p) => p.kind === 'disrupt')).toBe(true);
    expect(ENEMIES.bat.traits!.text.join('')).toContain('封印');
  });
  it('標的の最も強力な使用可能スキルが封印される(CD2)', () => {
    const s = fresh(['bat']);
    s.enemies[0].patternIndex = 1;
    expect(currentIntent(s).kind).toBe('disrupt');
    const ev = endPlayerTurn(s);
    const d = ev.find((x) => x.type === 'disrupt');
    expect(d).toMatchObject({ enemy: 0, member: E, skillId: 'heal' }); // CDが最も長い(=最も強力な)スキル
    // 次ターン開始で1つ減り、まだ使えない
    expect(s.party[E].cooldowns.heal).toBe(1);
    expect(useSkill(s, E, 'heal')).toBeNull();
  });
  it('封印はダメージを与えない', () => {
    const s = fresh(['bat']);
    s.enemies[0].patternIndex = 1;
    const hp = s.party.map((m) => m.hp);
    endPlayerTurn(s);
    expect(s.party.map((m) => m.hp)).toEqual(hp);
  });
  it('ナイトの挑発で後衛狙いの妨害はナイトに逸れる', () => {
    const s = fresh(['bat']);
    useSkill(s, K, 'provoke');
    s.enemies[0].patternIndex = 1;
    expect(resolveTarget(s, currentIntent(s))).toBe(K);
    const ev = endPlayerTurn(s);
    expect(ev.find((x) => x.type === 'disrupt')).toMatchObject({ member: K });
  });
  it('使えるスキルが無ければ何も封印されない', () => {
    const s = fresh(['bat']);
    for (const id of s.party[E].skills) s.party[E].cooldowns[id] = 3;
    s.enemies[0].patternIndex = 1;
    const ev = endPlayerTurn(s);
    expect(ev.some((x) => x.type === 'disrupt')).toBe(false);
  });
  it('ブレイクして行動不能にすれば妨害は先送りされる', () => {
    const s = fresh(['bat']);
    s.enemies[0].patternIndex = 1;
    s.enemies[0].broken = true; s.enemies[0].shield = 0;
    const ev = endPlayerTurn(s);
    expect(ev.some((x) => x.type === 'disrupt')).toBe(false);
    expect(s.enemies[0].patternIndex).toBe(1);
  });
  it('待機でCD-1しても、封印直後のスキルは次ターン使えない', () => {
    const s = fresh(['bat']);
    s.enemies[0].patternIndex = 1;
    endPlayerTurn(s);
    const r = simulatePlan(s, [{ member: E, skillId: WAIT_ID }, { member: E, skillId: 'heal' }]);
    expect(r.steps).toHaveLength(2); // 待機でCDが0になり使える
  });
  it('ヒントは妨害を警告する', () => {
    const s = fresh(['bat']);
    s.enemies[0].patternIndex = 1;
    expect(recommend(s)).toContain('封印');
  });
});
