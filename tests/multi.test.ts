import { describe, expect, it } from 'vitest';
import {
  createBattle, defaultTarget, endPlayerTurn, livingEnemies, previewSkill, protectionMult, startPlayerTurn, useSkill,
} from '../src/core/battle';
import { ENEMIES, SKILLS } from '../src/core/data';
import { WAIT_ID, appendStep, simulatePlan, summarizePlan } from '../src/core/plan';
import { GROUP_SCALE, enemyScale, newRun, pickEncounter } from '../src/core/run';
import { newMeta } from '../src/core/meta';
import { recommend } from '../src/core/hint';
import type { MapNode } from '../src/core/map';

const K = 0, E = 1;
const fresh = (ids: string[]) => { const s = createBattle(ids); startPlayerTurn(s); return s; };
const node = (type: MapNode['type'], row: number): MapNode => ({ id: 0, row, col: 0, type, next: [] });

describe('敵の複数編成', () => {
  it('複数の敵を持ち、enemy は先頭と同一', () => {
    const s = fresh(['golem', 'bat', 'skeleton']);
    expect(s.enemies).toHaveLength(3);
    expect(s.enemy).toBe(s.enemies[0]);
    expect(livingEnemies(s)).toEqual([0, 1, 2]);
  });
  it('スキルは指定した敵だけにダメージを与える', () => {
    const s = fresh(['slime', 'bat']);
    const hp = s.enemies.map((e) => e.hp);
    const ev = useSkill(s, E, 'firebolt', 1)!;
    expect(s.enemies[0].hp).toBe(hp[0]);
    expect(s.enemies[1].hp).toBeLessThan(hp[1]);
    expect(ev.find((e) => e.type === 'damage')).toMatchObject({ enemy: 1 });
  });
  it('倒れた敵を指定したら、先頭の生存者に切り替わる', () => {
    const s = fresh(['slime', 'bat']);
    s.enemies[1].hp = 0;
    useSkill(s, E, 'firebolt', 1);
    expect(s.enemies[0].hp).toBeLessThan(s.enemies[0].maxHp);
    expect(defaultTarget(s)).toBe(0);
  });
  it('全員が倒れるまで勝利にならず、倒れた敵は行動しない', () => {
    const s = fresh(['slime', 'bat']);
    s.enemies[0].hp = 1;
    const ev = useSkill(s, E, 'firebolt', 0)!;
    expect(ev.some((e) => e.type === 'enemyDown' && e.enemy === 0)).toBe(true);
    expect(s.phase).toBe('player');
    const hp = s.party[K].hp + s.party[E].hp;
    const evs = endPlayerTurn(s);
    expect(evs.filter((e) => e.type === 'enemyAttack').every((e) => e.type === 'enemyAttack' && e.enemy === 1)).toBe(true);
    expect(s.party[K].hp + s.party[E].hp).toBeLessThan(hp);
    s.enemies[1].hp = 1;
    useSkill(s, E, 'firebolt', 1);
    expect(s.phase).toBe('won');
  });
  it('敵は編成の順に全員が行動する', () => {
    const s = fresh(['slime', 'slime']);
    const ev = endPlayerTurn(s);
    expect(ev.filter((e) => e.type === 'enemyAttack').map((e) => e.type === 'enemyAttack' && e.enemy)).toEqual([0, 1]);
  });
  it('編成ごとに敵が別々にブレイクし、行動不能になる', () => {
    const s = fresh(['skeleton', 'slime']);
    s.enemies[0].broken = true; s.enemies[0].shield = 0;
    const ev = endPlayerTurn(s);
    expect(ev.some((e) => e.type === 'stunned' && e.enemy === 0)).toBe(true);
    expect(ev.some((e) => e.type === 'enemyAttack' && e.enemy === 1)).toBe(true);
  });
});

describe('敵同士のシナジー', () => {
  it('ゴーレムが健在な間、仲間の被ダメージが25%減り、ブレイクで解除される', () => {
    const s = fresh(['golem', 'bat']);
    expect(protectionMult(s, 1)).toBe(0.75);
    expect(protectionMult(s, 0)).toBe(1);
    const guarded = previewSkill(s, SKILLS.firebolt, E, 1);
    expect(guarded.protectedBy).toBe(true);
    s.enemies[0].broken = true;
    expect(protectionMult(s, 1)).toBe(1);
    expect(previewSkill(s, SKILLS.firebolt, E, 1).hp).toBeGreaterThan(guarded.hp);
  });
  it('ゴーレムを倒すと守護が消える', () => {
    const s = fresh(['golem', 'bat']);
    s.enemies[0].hp = 0;
    expect(protectionMult(s, 1)).toBe(1);
  });
  it('ゴーレムの構えは仲間にも防御を分ける', () => {
    const s = fresh(['golem', 'bat']);
    s.enemies[0].patternIndex = 1;
    endPlayerTurn(s);
    expect(s.enemies[0].guard).toBe(22);
    expect(s.enemies[1].guard).toBe(11);
  });
  it('スケルトンは仲間が倒れると攻撃力が上がる(奮起)', () => {
    const s = fresh(['skeleton', 'slime']);
    const before = s.enemies[0].atkMult;
    s.enemies[1].hp = 1;
    useSkill(s, E, 'firebolt', 1);
    expect(s.enemies[0].atkMult).toBeGreaterThan(before);
  });
});

describe('作戦と編成', () => {
  it('作戦の手ごとに狙う敵を指定でき、予想は全敵の合計', () => {
    const s = fresh(['slime', 'bat']);
    const plan = appendStep(s, appendStep(s, [], { member: E, skillId: 'firebolt', target: 1 }), { member: K, skillId: 'slash', target: 0 });
    const r = simulatePlan(s, plan);
    expect(r.state.enemies[0].hp).toBeLessThan(s.enemies[0].hp);
    expect(r.state.enemies[1].hp).toBeLessThan(s.enemies[1].hp);
    expect(summarizePlan(s, plan).damage).toBe(s.enemies[0].hp - r.state.enemies[0].hp + s.enemies[1].hp - r.state.enemies[1].hp);
    expect(s.enemies[0].hp).toBe(s.enemies[0].maxHp);
  });
  it('待機は編成に関係なく使える', () => {
    const s = fresh(['slime', 'bat']);
    expect(simulatePlan(s, [{ member: K, skillId: WAIT_ID }]).steps).toHaveLength(1);
  });
  it('ヒントは編成の中の脅威を名指しする', () => {
    const s = fresh(['skeleton', 'bat']);
    s.enemies[0].patternIndex = 3;
    expect(recommend(s)).toContain('スケルトン');
  });
});

describe('編成の生成', () => {
  it('全ノードで、定義済みの敵だけの1〜3体の編成になる', () => {
    const run = newRun(newMeta(), 21);
    for (let i = 0; i < 200; i++) {
      for (const n of [node('battle', i % 8), node('elite', 4), node('boss', 8)]) {
        const ids = pickEncounter(run, n);
        expect(ids.length).toBeGreaterThanOrEqual(1);
        expect(ids.length).toBeLessThanOrEqual(3);
        for (const id of ids) expect(ENEMIES[id]).toBeDefined();
        if (n.type === 'boss') expect(ids).toEqual(['dragon']);
      }
    }
  });
  it('体数が多いほど1体は弱いが、合計HPは単体戦と同程度(極端に増減しない)', () => {
    const n = node('battle', 4);
    const one = enemyScale(n, null, 1);
    const three = enemyScale(n, null, 3);
    expect(three.hp).toBeLessThan(one.hp);
    expect(three.hp * 3).toBeGreaterThan(one.hp * 0.7);
    expect(three.hp * 3).toBeLessThan(one.hp * 1.5);
    expect(GROUP_SCALE[2].atk * 2).toBeGreaterThan(0.6);
  });
});
