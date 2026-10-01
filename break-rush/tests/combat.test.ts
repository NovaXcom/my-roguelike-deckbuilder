import { describe, expect, it } from 'vitest';
import { ComboSystem, milestoneCrossed } from '../src/combat/ComboSystem';
import { applyBreakDamage, breakRatio, createBreak, isBroken, updateBreak } from '../src/combat/BreakSystem';
import { applyDamage, calcDamage, comboDamageMultiplier, rectsOverlap } from '../src/combat/DamageSystem';
import { MassKillTracker, multiKillTier } from '../src/combat/MassKill';
import { SlowMo } from '../src/combat/SlowMo';
import { HitStop } from '../src/combat/HitStop';
import { RushSystem, pickNearest } from '../src/combat/RushSystem';
import { COMBO, BREAK, RUSH, ATTACK_STEPS, CHAIN_WINDOW_MS, DODGE } from '../src/config';
import { BossAI, isEnraged } from '../src/enemies/BossAI';
import { StageRunner, buildStage, bossHpScale, waveTotal } from '../src/systems/StageScript';
import { MAX_COMBO_BONUS_MS, BASE_UPGRADE_IDS, UPGRADE_IDS, activeSynergies, completesSynergy, rollChoices, statsFrom } from '../src/systems/UpgradeSystem';
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../src/systems/Difficulty';
import { SAVE_KEY, emptySave, loadSave, recordRun, sanitizeSave, writeSave } from '../src/systems/SaveSystem';
import { UNLOCK_RULES, evaluateUnlocks, isDifficultyUnlocked, unlockedUpgrades, usableDifficulty } from '../src/systems/Unlocks';
import { ROUTES } from '../src/systems/StageScript';
import { newRun, nextStage } from '../src/systems/RunState';
import { ScoreSystem, calcRank, scoreMultiplier } from '../src/systems/ScoreSystem';
import { MeleeBrain } from '../src/combat/MeleeBrain';
import { AttackTokens } from '../src/combat/AttackTokens';
import { isBlocked } from '../src/combat/Blocking';
import { ENEMY_STATS, MAX_ATTACKERS } from '../src/config';
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

describe('UpgradeSystem', () => {
  it('stacks upgrades additively', () => {
    const st = statsFrom(['power', 'power', 'speed', 'breaker', 'rush', 'critical', 'combo']);
    expect(st.damageMult).toBeCloseTo(1.4);
    expect(st.speedMult).toBeCloseTo(1.15);
    expect(st.breakMult).toBeCloseTo(1.3);
    expect(st.rushMult).toBeCloseTo(1.5);
    // rush + critical + speed also completes the BLITZ RUSHER synergy (+10% crit)
    expect(st.critChance).toBeCloseTo(0.2);
    expect(st.comboBonusMs).toBe(1000);
  });
  it('caps the combo time bonus and crit chance', () => {
    expect(statsFrom(Array(10).fill('combo')).comboBonusMs).toBe(MAX_COMBO_BONUS_MS);
    expect(statsFrom(Array(20).fill('critical')).critChance).toBe(1);
  });
  it('rolls distinct choices', () => {
    const c = rollChoices(Math.random, 3);
    expect(new Set(c).size).toBe(3);
    expect(rollChoices(() => 0, 3)).toEqual(BASE_UPGRADE_IDS.slice(0, 3));
    expect(rollChoices(Math.random, 99).length).toBe(BASE_UPGRADE_IDS.length);
  });
});

describe('ScoreSystem', () => {
  it('uses the combo multiplier table', () => {
    expect([0, 9, 10, 25, 50, 100, 200, 999].map(scoreMultiplier)).toEqual([1, 1, 1.2, 1.5, 2, 3, 5, 5]);
    const s = new ScoreSystem();
    expect(s.add(100, 50)).toBe(200);
    s.addFlat(50);
    expect(s.total).toBe(250);
  });
  it('ranks from score, combo, damage and time', () => {
    expect(calcRank({ score: 30000, maxCombo: 120, damageTaken: 0, timeSec: 60 })).toBe('S');
    expect(calcRank({ score: 0, maxCombo: 0, damageTaken: 500, timeSec: 999 })).toBe('D');
    expect(calcRank({ score: 9000, maxCombo: 30, damageTaken: 40, timeSec: 150 })).toBe('B');
  });
});

describe('StageScript', () => {
  it('ends with the boss and has an upgrade step before it', () => {
    const steps = buildStage(1);
    expect(steps[steps.length - 1].type).toBe('boss');
    expect(steps.findIndex((s) => s.type === 'upgrade')).toBeGreaterThan(0);
  });
  it('scales enemy counts and boss hp with the stage', () => {
    const count = (n: number) => buildStage(n).reduce((a, s) => a + waveTotal(s), 0);
    expect(count(2)).toBeGreaterThan(count(1));
    expect(bossHpScale(3)).toBeGreaterThan(bossHpScale(1));
  });
  it('walks steps and reports wave progress', () => {
    const r = new StageRunner(buildStage(1));
    expect(r.waveProgress()).toEqual({ n: 1, total: 7 });
    for (let i = 0; i < 4; i++) r.advance();
    expect(r.current.type).toBe('upgrade');
    expect(r.waveProgress().n).toBe(4);
    const boss = new StageRunner(buildStage(1), 99);
    expect(boss.current.type).toBe('boss');
  });
});

describe('BossAI', () => {
  it('cycles idle -> windup -> attack -> recover -> idle', () => {
    const ai = new BossAI(() => 0, 0);
    expect(ai.update(100, 1)).toBeNull();
    const phases: string[] = [];
    let t = 1400;
    for (let i = 0; i < 4; i++) {
      const ev = ai.update(t, 1)!;
      phases.push(ev.type);
      t += ev.durationMs;
    }
    expect(phases).toEqual(['windup', 'attack', 'recover', 'idle']);
  });
  it('never repeats the same attack twice in a row', () => {
    const ai = new BossAI(() => 0, 0);
    let t = 0;
    const attacks: string[] = [];
    for (let i = 0; i < 40; i++) {
      t += 5000;
      const ev = ai.update(t, 1);
      if (ev?.type === 'windup') attacks.push(ev.attack);
    }
    for (let i = 1; i < attacks.length; i++) expect(attacks[i]).not.toBe(attacks[i - 1]);
  });
  it('winds up faster when enraged, and interrupt resets to idle', () => {
    const calm = new BossAI(() => 0, 0).update(1400, 1)!;
    const angry = new BossAI(() => 0, 0).update(1400, 0.3)!;
    expect(angry.durationMs).toBeLessThan(calm.durationMs);
    expect(isEnraged(0.5)).toBe(true);
    expect(isEnraged(0.51)).toBe(false);
    const ai = new BossAI(() => 0, 0);
    ai.update(1400, 1);
    ai.interrupt(2000);
    expect(ai.phase).toBe('idle');
    expect(ai.update(2500, 1)).toBeNull();
  });
});

describe('upgrade rolling variety', () => {
  it('avoids last offer when the pool allows, and falls back when it does not', () => {
    for (let i = 0; i < 50; i++) {
      const c = rollChoices(Math.random, 3, BASE_UPGRADE_IDS, ['power', 'speed', 'breaker']);
      expect(c.some((x) => ['power', 'speed', 'breaker'].includes(x))).toBe(false);
    }
    const tight = rollChoices(Math.random, 3, ['power', 'speed', 'breaker', 'combo'], ['power', 'speed', 'breaker']);
    expect(new Set(tight).size).toBe(3);
    expect(tight).toContain('combo');
  });
  it('can include unlocked upgrades', () => {
    const pool = [...BASE_UPGRADE_IDS, 'vampire' as const];
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) rollChoices(Math.random, 3, pool).forEach((c) => seen.add(c));
    expect(seen.has('vampire')).toBe(true);
  });
  it('has all ids defined', () => {
    expect(UPGRADE_IDS.length).toBe(8);
  });
});

describe('synergies', () => {
  it('activates only when every required upgrade is owned', () => {
    expect(activeSynergies(['rush', 'critical']).length).toBe(0);
    expect(activeSynergies(['rush', 'critical', 'speed']).map((s) => s.id)).toEqual(['blitz']);
  });
  it('reports which synergy a pick completes', () => {
    expect(completesSynergy(['rush', 'critical'], 'speed')?.id).toBe('blitz');
    expect(completesSynergy(['rush', 'critical'], 'power')).toBeNull();
    expect(completesSynergy(['rush', 'critical', 'speed'], 'speed')).toBeNull();
  });
  it('applies synergy bonuses on top of the base upgrades', () => {
    const st = statsFrom(['rush', 'critical', 'speed']);
    expect(st.rushWindowBonusMs).toBe(1000);
    expect(st.critChance).toBeCloseTo(0.2);
    expect(statsFrom(['breaker', 'power', 'combo']).brokenDamageMult).toBeCloseTo(1.5);
    const j = statsFrom(['armor', 'vampire', 'power']);
    expect(j.killHeal).toBe(4);
    expect(j.damageTakenMult).toBeCloseTo(0.7);
  });
  it('vampire and armor stack and armor is floored', () => {
    expect(statsFrom(['vampire', 'vampire']).killHeal).toBe(4);
    expect(statsFrom(Array(10).fill('armor')).damageTakenMult).toBeGreaterThanOrEqual(0.3);
  });
});

describe('combo window', () => {
  it('uses the upgrade bonus, difficulty penalty and a minimum', () => {
    const c = new ComboSystem();
    c.windowBonusMs = 1000;
    c.add(0);
    expect(c.current(COMBO.windowMs + 999)).toBe(1);
    expect(c.current(COMBO.windowMs + 1000)).toBe(0);
    const hard = new ComboSystem();
    hard.windowBonusMs = -5000;
    expect(hard.window).toBe(COMBO.minWindowMs);
  });
});

describe('Difficulty', () => {
  it('RUSH has more but weaker enemies and a shorter combo window', () => {
    const n = DIFFICULTIES.normal;
    const r = DIFFICULTIES.rush;
    expect(r.countMult).toBeGreaterThan(n.countMult);
    expect(r.enemyDmgMult).toBeLessThan(n.enemyDmgMult);
    expect(r.comboWindowDelta).toBeLessThan(0);
    expect(DIFFICULTIES.hard.enemyDmgMult).toBeGreaterThan(1);
    expect(DIFFICULTY_ORDER.every((d) => DIFFICULTIES[d].scoreMult >= 1)).toBe(true);
  });
  it('multiplies score', () => {
    const s = new ScoreSystem(1.5);
    expect(s.add(100, 0)).toBe(150);
    s.addFlat(100);
    expect(s.total).toBe(300);
  });
});

function memoryStore(initial?: string) {
  const m = new Map<string, string>();
  if (initial !== undefined) m.set(SAVE_KEY, initial);
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('SaveSystem', () => {
  it('round-trips through storage', () => {
    const store = memoryStore();
    const save = emptySave();
    save.bestScore.hard = 1234;
    save.unlocked = ['difficulty:hard'];
    save.settings.muted = true;
    expect(writeSave(save, store)).toBe(true);
    expect(loadSave(store)).toEqual(save);
  });
  it('falls back to defaults on missing, corrupt or hostile data', () => {
    expect(loadSave(memoryStore())).toEqual(emptySave());
    expect(loadSave(memoryStore('{not json'))).toEqual(emptySave());
    const odd = sanitizeSave({ bestScore: { normal: -5, hard: 'x', rush: 77.9 }, bestCombo: NaN, difficulty: 'impossible', unlocked: ['a', 3, 'a'], settings: { muted: 'yes' } });
    expect(odd.bestScore).toEqual({ normal: 0, hard: 0, rush: 77 });
    expect(odd.bestCombo).toBe(0);
    expect(odd.difficulty).toBe('normal');
    expect(odd.unlocked).toEqual(['a']);
    expect(odd.settings.muted).toBe(false);
  });
  it('survives unavailable storage', () => {
    expect(loadSave(null)).toEqual(emptySave());
    expect(writeSave(emptySave(), null)).toBe(false);
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(loadSave(broken)).toEqual(emptySave());
    expect(writeSave(emptySave(), broken)).toBe(false);
  });
  it('records bests per difficulty without mutating the input', () => {
    const save = emptySave();
    const r1 = recordRun(save, { difficulty: 'normal', runScore: 5000, maxCombo: 20, clearedStage: 1 });
    expect(r1.newRecord).toBe(true);
    expect(r1.bestBefore).toBe(0);
    expect(save.bestScore.normal).toBe(0);
    const r2 = recordRun(r1.save, { difficulty: 'normal', runScore: 3000, maxCombo: 50, clearedStage: 0 });
    expect(r2.newRecord).toBe(false);
    expect(r2.bestBefore).toBe(5000);
    expect(r2.save.bestScore.normal).toBe(5000);
    expect(r2.save.bestCombo).toBe(50);
    expect(r2.save.clearedStage).toBe(1);
    expect(recordRun(r2.save, { difficulty: 'hard', runScore: 100, maxCombo: 0, clearedStage: 0 }).save.bestScore.hard).toBe(100);
  });
});

describe('Unlocks', () => {
  it('starts with only NORMAL', () => {
    const s = emptySave();
    expect(isDifficultyUnlocked(s, 'normal')).toBe(true);
    expect(isDifficultyUnlocked(s, 'hard')).toBe(false);
    expect(evaluateUnlocks(s).newly).toEqual([]);
  });
  it('unlocks on conditions exactly once', () => {
    let s = emptySave();
    s.clearedStage = 1;
    s.bestCombo = 30;
    const first = evaluateUnlocks(s);
    expect(first.newly.map((r) => r.id).sort()).toEqual(['difficulty:hard', 'upgrade:vampire']);
    s = first.save;
    expect(evaluateUnlocks(s).newly).toEqual([]);
    expect(isDifficultyUnlocked(s, 'hard')).toBe(true);
    expect(unlockedUpgrades(s)).toEqual(['vampire']);
  });
  it('unlocks every rule eventually', () => {
    const s = emptySave();
    s.clearedStage = 5;
    s.bestCombo = 100;
    s.bestScore.normal = 99999;
    expect(evaluateUnlocks(s).save.unlocked.length).toBe(UNLOCK_RULES.length);
  });
  it('falls back to NORMAL when the saved difficulty is locked', () => {
    const s = emptySave();
    s.difficulty = 'rush';
    expect(usableDifficulty(s)).toBe('normal');
    s.unlocked = ['difficulty:rush'];
    expect(usableDifficulty(s)).toBe('rush');
  });
});

describe('Routes and run state', () => {
  it('swarm adds enemies, fortress removes some but adds an upgrade and a tougher boss', () => {
    const waves = (r: 'standard' | 'swarm' | 'fortress') => buildStage(2, r).reduce((a, s) => a + waveTotal(s), 0);
    expect(waves('swarm')).toBeGreaterThan(waves('standard'));
    expect(waves('fortress')).toBeLessThan(waves('standard'));
    const up = (r: 'standard' | 'fortress') => buildStage(2, r).filter((s) => s.type === 'upgrade').length;
    expect(up('fortress')).toBe(up('standard') + 1);
    const f = buildStage(2, 'fortress');
    expect(f[f.length - 1].type).toBe('boss');
    expect(f[f.length - 2].type).toBe('upgrade');
    expect(ROUTES.fortress.bossHpMult).toBeGreaterThan(1);
  });
  it('carries owned upgrades and difficulty into the next stage without sharing arrays', () => {
    const run = newRun('hard');
    run.owned.push('power');
    const next = nextStage(run, 'swarm');
    expect(next.stage).toBe(2);
    expect(next.difficulty).toBe('hard');
    expect(next.route).toBe('swarm');
    next.owned.push('speed');
    expect(run.owned).toEqual(['power']);
  });
});

describe('MeleeBrain', () => {
  const t = { windupMs: 400, activeMs: 200, recoverMs: 500, cooldownMs: [300, 300] as [number, number] };
  it('runs approach -> windup -> active -> recover -> approach with a cooldown', () => {
    const b = new MeleeBrain(t, () => 0, 0);
    expect(b.ready(0)).toBe(true);
    expect(b.start(0)).toBe(true);
    expect(b.start(1)).toBe(false);
    expect(b.update(399)).toBeNull();
    expect(b.update(400)).toBe('active');
    expect(b.update(600)).toBe('recover');
    expect(b.update(1100)).toBe('approach');
    expect(b.ready(1100)).toBe(false);
    expect(b.ready(1400)).toBe(true);
  });
  it('a hit cancels the attack in any phase and delays the next one', () => {
    const b = new MeleeBrain(t, () => 0, 0);
    b.start(0);
    expect(b.interrupt(100, 600)).toBe(true);
    expect(b.phase).toBe('approach');
    expect(b.ready(699)).toBe(false);
    expect(b.ready(700)).toBe(true);
    b.start(700);
    b.update(1100);
    expect(b.phase).toBe('active');
    expect(b.interrupt(1150, 300)).toBe(true);
    expect(b.phase).toBe('approach');
    expect(b.interrupt(1160)).toBe(false);
    expect(b.ready(1449)).toBe(false);
    expect(b.ready(1450)).toBe(true);
  });
  it('honours the initial delay', () => {
    const b = new MeleeBrain(t, () => 0, 1000, 500);
    expect(b.ready(1499)).toBe(false);
    expect(b.ready(1500)).toBe(true);
  });
  it('every enemy kind telegraphs for at least 350ms (fair to react to)', () => {
    for (const s of Object.values(ENEMY_STATS)) expect(s.windupMs).toBeGreaterThanOrEqual(350);
  });
});

describe('AttackTokens', () => {
  it('caps simultaneous attackers and frees slots on release', () => {
    const tk = new AttackTokens(MAX_ATTACKERS);
    const hs = Array.from({ length: MAX_ATTACKERS + 2 }, (_, i) => ({ i }));
    const got = hs.map((h) => tk.acquire(h));
    expect(got.filter(Boolean).length).toBe(MAX_ATTACKERS);
    expect(tk.acquire(hs[0])).toBe(true);
    expect(tk.acquire(hs[MAX_ATTACKERS])).toBe(false);
    tk.release(hs[0]);
    expect(tk.acquire(hs[MAX_ATTACKERS])).toBe(true);
    expect(tk.count).toBe(MAX_ATTACKERS);
  });
});

describe('Blocking', () => {
  const base = { guardFacing: 1 as const, guardX: 100, attackerX: 200, step: 0, counter: false, rush: false, broken: false };
  it('blocks light hits from the front only', () => {
    expect(isBlocked(base)).toBe(true);
    expect(isBlocked({ ...base, step: 1 })).toBe(true);
    expect(isBlocked({ ...base, attackerX: 0 })).toBe(false);
  });
  it('does not block the finisher, counters, RUSH or a broken guard', () => {
    expect(isBlocked({ ...base, step: 2 })).toBe(false);
    expect(isBlocked({ ...base, counter: true })).toBe(false);
    expect(isBlocked({ ...base, rush: true })).toBe(false);
    expect(isBlocked({ ...base, broken: true })).toBe(false);
  });
  it('works when facing left', () => {
    expect(isBlocked({ ...base, guardFacing: -1, attackerX: 0 })).toBe(true);
    expect(isBlocked({ ...base, guardFacing: -1, attackerX: 200 })).toBe(false);
  });
});

describe('Stage enemy mix', () => {
  it('introduces rushers and guards in the first stage and a big final horde', () => {
    const waves = buildStage(1).filter((s) => s.type === 'wave') as Array<Extract<ReturnType<typeof buildStage>[number], { type: 'wave' }>>;
    const kinds = new Set(waves.flatMap((w) => w.spawns.map((g) => g.kind)));
    expect(kinds.has('rusher')).toBe(true);
    expect(kinds.has('guard')).toBe(true);
    expect(waves[0].spawns.every((g) => g.kind === 'grunt')).toBe(true);
    expect(Math.max(...waves.map(waveTotal))).toBeGreaterThanOrEqual(12);
  });
});
