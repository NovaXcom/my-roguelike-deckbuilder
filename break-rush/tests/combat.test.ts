import { describe, expect, it } from 'vitest';
import { ComboSystem, milestoneCrossed } from '../src/combat/ComboSystem';
import { applyBreakDamage, breakRatio, createBreak, isBroken, updateBreak } from '../src/combat/BreakSystem';
import { applyDamage, calcDamage, comboDamageMultiplier, rectsOverlap } from '../src/combat/DamageSystem';
import { MassKillTracker, multiKillTier } from '../src/combat/MassKill';
import { SlowMo } from '../src/combat/SlowMo';
import { HitStop } from '../src/combat/HitStop';
import { RushSystem, pickNearest } from '../src/combat/RushSystem';
import { COMBO, BREAK, RUSH, ATTACK_STEPS, CHAIN_WINDOW_MS, DODGE } from '../src/config';
import { canAttack, startAttack, newAttackState, isAttackActive } from '../src/player/PlayerAttack';
import { canDodge, consumeCounter, counterReady, isDodging, newDodgeState, startDodge } from '../src/player/Dodge';

describe('DamageSystem', () => {
  it('clamps damage at remaining hp', () => {
    const h = { hp: 5, maxHp: 10 };
    expect(applyDamage(h, 20)).toBe(5);
    expect(h.hp).toBe(0);
  });
  it('detects rect overlap', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
  });
  it('scales damage with combo, break and counter, with a combo cap', () => {
    expect(calcDamage(10, { comboHits: 0, broken: false, counter: false })).toBe(10);
    expect(calcDamage(10, { comboHits: 0, broken: true, counter: false })).toBe(10 * BREAK.damageMult);
    expect(calcDamage(10, { comboHits: 0, broken: false, counter: true })).toBe(10 * DODGE.counterMult);
    expect(comboDamageMultiplier(9999)).toBeCloseTo(1 + COMBO.maxDamageBonus);
  });
});

describe('ComboSystem', () => {
  it('counts hits inside the window and expires after it', () => {
    const c = new ComboSystem();
    c.add(0);
    c.add(1000);
    expect(c.current(1500)).toBe(2);
    expect(c.current(1000 + COMBO.windowMs)).toBe(0);
  });
  it('restarts at 1 after expiry and tracks max', () => {
    const c = new ComboSystem();
    c.add(0);
    c.add(100);
    c.add(100 + COMBO.windowMs + 1);
    expect(c.current(100 + COMBO.windowMs + 1)).toBe(1);
    expect(c.max).toBe(2);
  });
  it('reports remaining ratio', () => {
    const c = new ComboSystem();
    c.add(0);
    expect(c.remainingRatio(0)).toBe(1);
    expect(c.remainingRatio(COMBO.windowMs / 2)).toBeCloseTo(0.5);
    expect(c.remainingRatio(COMBO.windowMs)).toBe(0);
  });
});

describe('BreakSystem', () => {
  it('breaks exactly once when the gauge empties', () => {
    const b = createBreak(20);
    expect(applyBreakDamage(b, 10, 0)).toBe(false);
    expect(applyBreakDamage(b, 10, 10)).toBe(true);
    expect(isBroken(b, 11)).toBe(true);
    expect(applyBreakDamage(b, 10, 20)).toBe(false);
  });
  it('recovers and refills after the broken period', () => {
    const b = createBreak(10);
    applyBreakDamage(b, 10, 0);
    expect(breakRatio(b, 0)).toBe(1);
    updateBreak(b, BREAK.durationMs);
    expect(isBroken(b, BREAK.durationMs)).toBe(false);
    expect(b.gauge).toBe(10);
  });
  it('can break again after recovery', () => {
    const b = createBreak(10);
    applyBreakDamage(b, 10, 0);
    expect(applyBreakDamage(b, 10, BREAK.durationMs + 1)).toBe(true);
  });
});

describe('HitStop', () => {
  it('is active until the window ends and keeps the longest', () => {
    const h = new HitStop();
    h.trigger(0, 80);
    h.trigger(0, 30);
    expect(h.active(79)).toBe(true);
    expect(h.active(80)).toBe(false);
  });
});

describe('PlayerAttack chain', () => {
  it('advances steps inside the chain window and wraps', () => {
    const s = newAttackState();
    let t = 0;
    const steps: number[] = [];
    for (let i = 0; i < 4; i++) {
      startAttack(s, t);
      steps.push(s.step);
      t = s.readyAt + 10;
    }
    expect(steps).toEqual([0, 1, 2, 0]);
  });
  it('restarts at step 0 when the chain window lapses', () => {
    const s = newAttackState();
    startAttack(s, 0);
    startAttack(s, s.readyAt + 1);
    expect(s.step).toBe(1);
    startAttack(s, s.readyAt + CHAIN_WINDOW_MS + 1);
    expect(s.step).toBe(0);
  });
  it('enforces cooldown and active window, and clears hit ids', () => {
    const s = newAttackState();
    startAttack(s, 0);
    s.hitIds.add('x');
    expect(canAttack(s, 1)).toBe(false);
    expect(canAttack(s, ATTACK_STEPS[0].cooldownMs)).toBe(true);
    expect(isAttackActive(s, ATTACK_STEPS[0].durationMs - 1)).toBe(true);
    expect(isAttackActive(s, ATTACK_STEPS[0].durationMs)).toBe(false);
    startAttack(s, 1000);
    expect(s.hitIds.size).toBe(0);
  });
  it('flags counter attacks', () => {
    const s = newAttackState();
    startAttack(s, 0, true);
    expect(s.counter).toBe(true);
  });
});

describe('Dodge', () => {
  it('has duration, cooldown and a counter window', () => {
    const d = newDodgeState();
    startDodge(d, 0);
    expect(isDodging(d, DODGE.durationMs - 1)).toBe(true);
    expect(isDodging(d, DODGE.durationMs)).toBe(false);
    expect(counterReady(d, DODGE.durationMs + DODGE.counterWindowMs - 1)).toBe(true);
    expect(counterReady(d, DODGE.durationMs + DODGE.counterWindowMs)).toBe(false);
    expect(canDodge(d, DODGE.cooldownMs - 1)).toBe(false);
    expect(canDodge(d, DODGE.cooldownMs)).toBe(true);
  });
  it('consuming a counter ends the dodge and the window', () => {
    const d = newDodgeState();
    startDodge(d, 0);
    consumeCounter(d);
    expect(isDodging(d, 10)).toBe(false);
    expect(counterReady(d, 10)).toBe(false);
  });
});

describe('RushSystem', () => {
  it('offers a target only within the window', () => {
    const r = new RushSystem<string>();
    r.offer('a', 0);
    expect(r.available(RUSH.windowMs - 1)).toBe(true);
    expect(r.available(RUSH.windowMs)).toBe(false);
    r.offer('b', 0);
    r.clear();
    expect(r.available(1)).toBe(false);
  });
  it('picks the nearest enemy in range', () => {
    const a = { x: 100, y: 0 };
    const b = { x: 300, y: 0 };
    expect(pickNearest({ x: 0, y: 0 }, [b, a], 500)).toBe(a);
    expect(pickNearest({ x: 0, y: 0 }, [b, a], 50)).toBeNull();
    expect(pickNearest({ x: 0, y: 0 }, [], 500)).toBeNull();
  });
});

describe('milestones', () => {
  it('reports the highest milestone crossed', () => {
    expect(milestoneCrossed(9, 10)).toBe(10);
    expect(milestoneCrossed(10, 11)).toBeNull();
    expect(milestoneCrossed(24, 25)).toBe(25);
    expect(milestoneCrossed(0, 30)).toBe(25);
  });
});

describe('MassKillTracker', () => {
  it('maps counts to tiers', () => {
    expect([0, 2, 3, 5, 6, 9, 10, 30].map(multiKillTier)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
  it('flags tier-ups only once per tier within the window', () => {
    const k = new MassKillTracker();
    const r = [0, 100, 200, 300, 400, 500].map((t) => k.record(t));
    expect(r.map((x) => x.tierUp)).toEqual([false, false, true, false, false, true]);
    expect(r[5].count).toBe(6);
  });
  it('resets after the window empties', () => {
    const k = new MassKillTracker();
    [0, 100, 200].forEach((t) => k.record(t));
    const again = [5000, 5100, 5200].map((t) => k.record(t));
    expect(again[2].tierUp).toBe(true);
    expect(again[2].count).toBe(3);
  });
});

describe('SlowMo', () => {
  it('slows only inside the window and keeps the strongest scale', () => {
    const s = new SlowMo();
    expect(s.scale(0)).toBe(1);
    s.trigger(0, 500, 0.4);
    s.trigger(100, 500, 0.25);
    expect(s.scale(300)).toBe(0.25);
    expect(s.scale(599)).toBe(0.25);
    expect(s.scale(600)).toBe(1);
    s.trigger(1000, 100, 0.5);
    expect(s.scale(1050)).toBe(0.5);
  });
});
