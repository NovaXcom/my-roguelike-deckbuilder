import { describe, expect, it } from 'vitest';
import { createBattle, startPlayerTurn } from '../src/core/battle';
import { WAIT_ID, appendStep, canAppend, removeStep, simulatePlan, summarizePlan, type PlanStep } from '../src/core/plan';

const fresh = (id = 'skeleton') => { const s = createBattle(id); startPlayerTurn(s); return s; };
const K = 0, E = 1;
const st = (member: number, skillId: string): PlanStep => ({ member, skillId });

describe('作戦予約', () => {
  it('予約しても実際の戦闘状態は変わらない', () => {
    const s = fresh();
    const hp = s.enemy.hp;
    const plan = appendStep(s, appendStep(s, [], st(K, 'shield_bash')), st(E, 'thunder'));
    expect(plan).toHaveLength(2);
    simulatePlan(s, plan);
    expect(s.enemy.hp).toBe(hp);
    expect(s.ap).toBe(3);
  });
  it('行動ポイント3を超える予約はできない', () => {
    const s = fresh();
    let plan: PlanStep[] = [];
    for (const x of [st(K, 'slash'), st(E, 'firebolt'), st(E, 'ice_lance'), st(K, 'provoke')]) plan = appendStep(s, plan, x);
    expect(plan).toHaveLength(3);
    expect(canAppend(s, plan, st(K, 'provoke'))).toBe(false);
  });
  it('同じスキルを2回予約できない', () => {
    const s = fresh();
    const plan = appendStep(s, [], st(K, 'slash'));
    expect(canAppend(s, plan, st(K, 'slash'))).toBe(false);
  });
  it('順序で結果が変わる: バッシュ→魔法はチェイン、魔法→バッシュはチェインしない', () => {
    const s = fresh('slime');
    s.enemy.shield = 12;
    const a = summarizePlan(s, [st(K, 'shield_bash'), st(E, 'thunder')]);
    const b = summarizePlan(s, [st(E, 'thunder'), st(K, 'shield_bash')]);
    expect(a.breakAt).toBe(1);
    expect(a.chains).toBe(1);
    expect(b.chains).toBe(0);
    expect(a.damage).toBeGreaterThan(b.damage);
  });
  it('待機→バッシュ: 待機の強化が次のスキルに乗る', () => {
    const s = fresh('golem');
    const plain = summarizePlan(s, [st(K, 'shield_bash')]);
    const waited = simulatePlan(s, [st(K, WAIT_ID), st(K, 'shield_bash')]);
    expect(waited.steps).toHaveLength(2);
    expect(waited.state.enemy.shield).toBeLessThan(s.enemy.shield - 0);
    expect(plain.apLeft).toBe(2);
  });
  it('待機でCDを短縮すれば、同ターンにCD中のスキルを予約できる', () => {
    const s = fresh();
    s.party[K].cooldowns.shield_bash = 1;
    expect(canAppend(s, [], st(K, 'shield_bash'))).toBe(false);
    expect(canAppend(s, [st(K, WAIT_ID)], st(K, 'shield_bash'))).toBe(true);
  });
  it('途中の手を取り消すと、成立しなくなった後続の手も外れる', () => {
    const s = fresh();
    s.party[K].cooldowns.shield_bash = 1;
    const plan = [st(K, WAIT_ID), st(K, 'shield_bash')];
    expect(removeStep(s, plan, 0)).toEqual([]);
  });
});
