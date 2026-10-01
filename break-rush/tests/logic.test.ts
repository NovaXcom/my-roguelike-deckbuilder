import { describe, expect, it } from 'vitest';
import { SpatialHash } from '../src/logic/SpatialHash';
import { BOSS_TIMES, Director, GAME_LENGTH, kindWeights, spawnRate } from '../src/logic/Director';
import { ENEMY_DEFS, bossHp, dmgScale, hpScale, speedScale } from '../src/logic/Enemies';
import {
  MAX_PASSIVE_LEVEL, MAX_WEAPONS, MAX_WEAPON_LEVEL, PASSIVE_IDS, WEAPON_IDS, applyCard, modsFrom, newLoadout, rollCards, rollRarity, weaponStats,
  Card, Loadout, RARITY_ORDER,
} from '../src/logic/Upgrades';
import { CALLOUTS, KillStreak, UltCharge, addXp, xpToNext } from '../src/logic/Progression';
import { HEROES, HERO_IDS, META_DEFS, META_IDS, bankedCoins, buyMeta, canBuyMeta, metaBonuses, metaCost, metaLevel } from '../src/logic/Meta';
import { SAVE_KEY, emptySave, loadSave, recordRun, sanitizeSave, writeSave } from '../src/logic/Save';
import { DIFFICULTIES, DIFFICULTY_IDS, isDifficulty, ramped } from '../src/logic/Difficulty';
import { HitStop } from '../src/combat/HitStop';
import { SlowMo } from '../src/combat/SlowMo';

/** Deterministic RNG (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('SpatialHash', () => {
  it('finds every point within the radius (and may return extras)', () => {
    const rand = seeded(1);
    const h = new SpatialHash(64, 2, 600);
    h.reset(0, 0);
    const pts = Array.from({ length: 500 }, () => ({ x: (rand() - 0.5) * 120, z: (rand() - 0.5) * 120 }));
    pts.forEach((p, i) => h.insert(i, p.x, p.z));
    for (let q = 0; q < 40; q++) {
      const cx = (rand() - 0.5) * 100;
      const cz = (rand() - 0.5) * 100;
      const r = 1 + rand() * 8;
      const found = new Set<number>();
      h.query(cx, cz, r, (id) => found.add(id));
      pts.forEach((p, i) => {
        if (Math.hypot(p.x - cx, p.z - cz) <= r) expect(found.has(i)).toBe(true);
      });
    }
  });
  it('reset clears the grid and recentres it', () => {
    const h = new SpatialHash(16, 2, 10);
    h.reset(100, 100);
    h.insert(0, 100, 100);
    h.reset(100, 100);
    let n = 0;
    h.query(100, 100, 5, () => n++);
    expect(n).toBe(0);
    h.reset(500, -500);
    h.insert(3, 501, -499);
    h.query(500, -500, 3, () => n++);
    expect(n).toBe(1);
  });
  it('ignores ids beyond capacity instead of crashing', () => {
    const h = new SpatialHash(8, 2, 4);
    h.reset(0, 0);
    h.insert(99, 0, 0);
    let n = 0;
    h.query(0, 0, 4, () => n++);
    expect(n).toBe(0);
  });
});

describe('Enemy scaling', () => {
  it('gets tougher with time and bosses scale up', () => {
    expect(hpScale(0)).toBe(1);
    expect(hpScale(300)).toBeGreaterThan(hpScale(60));
    expect(hpScale(480)).toBeGreaterThan(12);
    expect(dmgScale(480)).toBeGreaterThan(2.5);
    expect(speedScale(0)).toBe(1);
    expect(speedScale(480)).toBeGreaterThan(1.5);
    expect(speedScale(99999)).toBeLessThanOrEqual(1.65);
    // by the end, plain imps outrun the hero's base speed: kiting alone stops working
    expect(ENEMY_DEFS.imp.speed * speedScale(480)).toBeGreaterThan(7.5);
    expect(dmgScale(300)).toBeGreaterThan(dmgScale(0));
    for (let i = 1; i < BOSS_TIMES.length; i++) expect(bossHp(i)).toBeGreaterThan(bossHp(i - 1));
  });
  it('every kind has sane stats', () => {
    for (const d of Object.values(ENEMY_DEFS)) {
      expect(d.hp).toBeGreaterThan(0);
      expect(d.speed).toBeGreaterThan(0);
      expect(d.radius).toBeGreaterThan(0);
    }
    expect(ENEMY_DEFS.runner.speed).toBeGreaterThan(ENEMY_DEFS.imp.speed);
    expect(ENEMY_DEFS.brute.hp).toBeGreaterThan(ENEMY_DEFS.imp.hp);
  });
});

describe('Director', () => {
  const run = (seconds: number, alive = 0, cap = 400, seed = 1) => {
    const d = new Director(seeded(seed));
    const orders: Array<{ t: number; o: ReturnType<Director['update']>[number] }> = [];
    for (let t = 0; t <= seconds; t += 1 / 30) d.update(t, 1 / 30, alive, cap).forEach((o) => orders.push({ t, o }));
    return orders;
  };
  it('throws enemies at the player immediately: an opening burst inside the first second', () => {
    const early = run(1).filter((x) => x.o.type === 'edge');
    expect(early.length).toBeGreaterThanOrEqual(16);
    expect(early.some((x) => x.o.type === 'edge' && x.o.near)).toBe(true);
  });
  it('ramps the spawn rate up', () => {
    expect(spawnRate(0)).toBeGreaterThan(2);
    expect(spawnRate(300)).toBeGreaterThan(spawnRate(60) * 2);
    const count = (a: number, b: number) => run(b).filter((x) => x.t >= a && x.o.type === 'edge').length;
    expect(count(100, 130)).toBeGreaterThan(count(10, 40));
  });
  it('respects the enemy cap', () => {
    const capped = run(60, 400, 400).filter((x) => x.o.type === 'edge' && !x.o.elite && !x.o.near);
    expect(capped.length).toBe(0);
  });
  it('introduces runners and brutes over time, never early', () => {
    expect(kindWeights(10).runner).toBe(0);
    expect(kindWeights(10).brute).toBe(0);
    expect(kindWeights(60).runner).toBeGreaterThan(0);
    expect(kindWeights(60).brute).toBe(0);
    expect(kindWeights(300).brute).toBeGreaterThan(0);
    expect(run(60).some((x) => x.o.type === 'edge' && x.o.kind === 'brute' && !x.o.elite)).toBe(false);
  });
  it('sends elites and horde rings on a schedule', () => {
    const o = run(200);
    expect(o.filter((x) => x.o.type === 'edge' && x.o.elite).length).toBeGreaterThanOrEqual(4);
    const rings = o.filter((x) => x.o.type === 'ring');
    expect(rings.length).toBeGreaterThanOrEqual(2);
    expect(rings[0].t).toBeGreaterThanOrEqual(50);
    expect(rings[0].t).toBeLessThan(52);
  });
  it('bosses come once each, in order, on time', () => {
    const d = new Director();
    expect(d.bossDue(10)).toBe(-1);
    expect(d.bossDue(BOSS_TIMES[0])).toBe(0);
    expect(d.bossDue(BOSS_TIMES[0] + 1)).toBe(-1);
    expect(d.bossDue(BOSS_TIMES[1] + 5)).toBe(1);
    expect(d.bossDue(GAME_LENGTH + 5)).toBe(2);
    expect(d.bossDue(GAME_LENGTH + 6)).toBe(3);
    expect(d.bossDue(9999)).toBe(-1);
    expect(d.bossesSpawned).toBe(4);
  });
});

describe('Upgrades', () => {
  it('weapon stats improve with level for every weapon', () => {
    const mods = modsFrom(newLoadout('slash'));
    for (const w of WEAPON_IDS) {
      const a = weaponStats(w, 1, mods);
      const b = weaponStats(w, MAX_WEAPON_LEVEL, mods);
      expect(b.damage).toBeGreaterThan(a.damage);
      expect(b.count + b.radius).toBeGreaterThan(a.count + a.radius);
      expect(b.cooldown).toBeLessThanOrEqual(a.cooldown);
    }
  });
  it('passives change the modifiers', () => {
    const l: Loadout = { weapons: { slash: 1 }, passives: { power: 2, haste: 3, area: 1, speed: 1, magnet: 2, vitality: 2, regen: 1, crit: 2, greed: 1, luck: 1 } };
    const m = modsFrom(l);
    expect(m.damageMult).toBeCloseTo(1.3);
    expect(m.cooldownMult).toBeCloseTo(0.76);
    expect(m.maxHpBonus).toBe(40);
    expect(m.critChance).toBeCloseTo(0.14);
    expect(modsFrom({ weapons: {}, passives: { haste: 6 } }).cooldownMult).toBeGreaterThanOrEqual(0.4);
    const buffed = weaponStats('slash', 3, m);
    const base = weaponStats('slash', 3, modsFrom(newLoadout('slash')));
    expect(buffed.damage).toBeGreaterThan(base.damage);
    expect(buffed.cooldown).toBeLessThan(base.cooldown);
    expect(buffed.radius).toBeGreaterThan(base.radius);
  });
  it('rolls three distinct cards from what is available', () => {
    for (let s = 1; s <= 100; s++) {
      const cards = rollCards(seeded(s), newLoadout('slash'));
      expect(cards.length).toBe(3);
      expect(new Set(cards.map((c) => `${c.kind}:${c.id}`)).size).toBe(3);
    }
  });
  it('never offers a maxed item, or a 6th weapon', () => {
    const full: Loadout = { weapons: { slash: MAX_WEAPON_LEVEL, orbit: 3, lightning: 2, missile: 1, stomp: 4 }, passives: {} };
    PASSIVE_IDS.slice(0, 4).forEach((p) => (full.passives[p] = MAX_PASSIVE_LEVEL));
    for (let s = 1; s <= 100; s++) {
      for (const c of rollCards(seeded(s), full)) {
        if (c.kind === 'weapon') expect((full.weapons[c.id as 'slash'] ?? 0)).toBeGreaterThan(0);
        expect(c.id).not.toBe('slash');
        if (c.kind === 'passive') expect((full.passives[c.id as 'power'] ?? 0)).toBeLessThan(MAX_PASSIVE_LEVEL);
      }
    }
    const five: Loadout = { weapons: { slash: 1, orbit: 1, lightning: 1, missile: 1, stomp: 1 }, passives: {} };
    expect(Object.keys(five.weapons).length).toBe(MAX_WEAPONS);
    for (let s = 1; s <= 50; s++) rollCards(seeded(s), five).forEach((c) => c.kind === 'weapon' && expect(c.isNew).toBe(false));
  });
  it('returns fewer cards when almost everything is maxed instead of crashing', () => {
    const l: Loadout = { weapons: { slash: MAX_WEAPON_LEVEL }, passives: {} };
    WEAPON_IDS.forEach((w) => (l.weapons[w] = MAX_WEAPON_LEVEL));
    PASSIVE_IDS.forEach((p) => (l.passives[p] = MAX_PASSIVE_LEVEL));
    expect(rollCards(seeded(1), l)).toEqual([]);
    l.passives.power = 5;
    expect(rollCards(seeded(1), l).length).toBe(1);
  });
  it('applying cards raises levels, caps them, and rarity grants more levels', () => {
    const l = newLoadout('slash');
    applyCard(l, { kind: 'weapon', id: 'slash', rarity: 'epic', levels: 2, isNew: false });
    expect(l.weapons.slash).toBe(3);
    applyCard(l, { kind: 'weapon', id: 'slash', rarity: 'legendary', levels: 3, isNew: false } as Card);
    applyCard(l, { kind: 'weapon', id: 'slash', rarity: 'legendary', levels: 3, isNew: false } as Card);
    expect(l.weapons.slash).toBe(MAX_WEAPON_LEVEL);
    applyCard(l, { kind: 'passive', id: 'power', rarity: 'common', levels: 1, isNew: true });
    expect(l.passives.power).toBe(1);
    const cards = Array.from({ length: 400 }, (_, i) => rollCards(seeded(i), newLoadout('slash'))).flat();
    for (const c of cards) expect(c.levels).toBeGreaterThanOrEqual(1);
    expect(cards.filter((c) => c.rarity === 'legendary').every((c) => c.levels === 3)).toBe(true);
  });
  it('rarity: mostly common, but the rare tiers do show up, and luck shifts it', () => {
    const rand = seeded(7);
    const tally = (luck: number) => {
      const t: Record<string, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
      for (let i = 0; i < 5000; i++) t[rollRarity(rand, luck)]++;
      return t;
    };
    const base = tally(0);
    expect(base.common).toBeGreaterThan(base.rare);
    expect(base.rare).toBeGreaterThan(base.epic);
    expect(base.epic).toBeGreaterThan(base.legendary);
    expect(base.legendary).toBeGreaterThan(0);
    const lucky = tally(0.9);
    expect(lucky.common).toBeLessThan(base.common);
    expect(lucky.epic + lucky.legendary).toBeGreaterThan(base.epic + base.legendary);
    expect(RARITY_ORDER.length).toBe(4);
  });
});

describe('Progression', () => {
  it('the first level-up is a handful of kills, and it keeps getting a bit harder', () => {
    expect(xpToNext(1)).toBeLessThanOrEqual(4);
    for (let l = 1; l < 60; l++) expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
  });
  it('levels up, carries xp, handles multi-level gains', () => {
    const s = { level: 1, xp: 0 };
    expect(addXp(s, xpToNext(1) - 1)).toBe(0);
    expect(addXp(s, 1)).toBe(1);
    expect(s).toEqual({ level: 2, xp: 0 });
    const t = { level: 1, xp: 0 };
    expect(addXp(t, xpToNext(1) + xpToNext(2) + 2)).toBe(2);
    expect(t).toEqual({ level: 3, xp: 2 });
    expect(addXp(t, -10)).toBe(0);
  });
  it('kill streak calls out milestones once and resets after a pause', () => {
    const k = new KillStreak(2000);
    const calls: string[] = [];
    for (let i = 0; i < 60; i++) {
      const c = k.kill(i * 50);
      if (c) calls.push(c.text);
    }
    expect(calls).toEqual(['NICE!', 'GREAT!', 'AWESOME!']);
    expect(k.current(60 * 50)).toBe(60);
    expect(k.current(60 * 50 + 3000)).toBe(0);
    expect(k.kill(10000)).toBeNull();
    expect(k.count).toBe(1);
    expect(k.best).toBe(60);
    expect(k.remaining(10000)).toBe(1);
    expect(CALLOUTS.map((c) => c.at)).toEqual([...CALLOUTS.map((c) => c.at)].sort((a, b) => a - b));
  });
  it('ultimate charges from kills and time, caps at 100, spends fully', () => {
    const u = new UltCharge();
    expect(u.consume()).toBe(false);
    for (let i = 0; i < 200; i++) u.addKill();
    expect(u.value).toBe(100);
    expect(u.ready).toBe(true);
    expect(u.consume()).toBe(true);
    expect(u.value).toBe(0);
    expect(u.ready).toBe(false);
    u.addTime(10);
    expect(u.value).toBeCloseTo(4.5);
  });
  it('each cast makes the next ultimate cost more, up to a cap', () => {
    const u = new UltCharge();
    const needs: number[] = [];
    for (let i = 0; i < 12; i++) {
      needs.push(u.need);
      u.value = u.need;
      expect(u.consume()).toBe(true);
    }
    expect(needs[0]).toBe(100);
    expect(needs[1]).toBeGreaterThan(needs[0]);
    expect(needs[5]).toBeGreaterThan(needs[2]);
    expect(Math.max(...needs)).toBe(300);
    const v = new UltCharge();
    v.value = 50;
    expect(v.percent).toBe(50);
    for (let i = 0; i < 400; i++) v.addKill();
    expect(v.percent).toBe(100);
  });
  it('the first ultimate is reachable within about 45 seconds of normal play', () => {
    // ~3 kills/s early on plus the time trickle
    const u = new UltCharge();
    let t = 0;
    while (!u.ready && t < 120) {
      t += 1;
      u.addTime(1);
      for (let k = 0; k < 3; k++) u.addKill();
    }
    expect(t).toBeLessThanOrEqual(45);
  });
});

describe('Meta progression', () => {
  it('costs rise per level and purchases are bounded', () => {
    expect(metaCost({}, 'hp')).toBe(META_DEFS.hp.baseCost);
    expect(metaCost({ hp: 2 }, 'hp')).toBe(META_DEFS.hp.baseCost * 3);
    expect(canBuyMeta(10, {}, 'hp')).toBe(false);
    const r = buyMeta(500, {}, 'hp')!;
    expect(r.levels.hp).toBe(1);
    expect(r.coins).toBe(500 - META_DEFS.hp.baseCost);
    expect(buyMeta(99999, { hp: META_DEFS.hp.max }, 'hp')).toBeNull();
    expect(metaLevel({ hp: 99 }, 'hp')).toBe(META_DEFS.hp.max);
    expect(metaLevel({ hp: -3 }, 'hp')).toBe(0);
  });
  it('bonuses reflect levels', () => {
    const b = metaBonuses({ hp: 2, power: 1, speed: 5, magnet: 1, xp: 2, greed: 3, luck: 1 });
    expect(b.hpMult).toBeCloseTo(1.2);
    expect(b.damageMult).toBeCloseTo(1.06);
    expect(b.speedMult).toBeCloseTo(1.2);
    expect(b.xpMult).toBeCloseTo(1.16);
    expect(b.goldMult).toBeCloseTo(1.3);
    expect(b.luck).toBeCloseTo(0.1);
    expect(metaBonuses({}).hpMult).toBe(1);
  });
  it('heroes: the starter is free, others cost more, each starts with a different weapon', () => {
    expect(HEROES.blaze.cost).toBe(0);
    expect(new Set(HERO_IDS.map((h) => HEROES[h].startWeapon)).size).toBe(HERO_IDS.length);
    expect(HEROES.tank.hp).toBeGreaterThan(HEROES.sparky.hp);
    expect(HEROES.sparky.speed).toBeGreaterThan(HEROES.tank.speed);
  });
  it('every run pays something; winning and surviving pay more', () => {
    const short = bankedCoins({ timeSec: 40, kills: 60, coins: 30, level: 4, victory: false });
    const long = bankedCoins({ timeSec: 400, kills: 3000, coins: 400, level: 30, victory: false });
    const win = bankedCoins({ timeSec: 480, kills: 4000, coins: 500, level: 35, victory: true });
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short);
    expect(win).toBeGreaterThan(long);
    expect(META_IDS.every((id) => META_DEFS[id].max > 0)).toBe(true);
  });
});

describe('Save', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { m, st: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } };
  };
  it('round-trips', () => {
    const { st } = memory();
    const s = emptySave();
    s.coins = 321;
    s.meta = { hp: 2, luck: 1 };
    s.heroes = ['blaze', 'tank'];
    s.hero = 'tank';
    s.settings.lowFx = true;
    expect(writeSave(s, st)).toBe(true);
    expect(loadSave(st)).toEqual(s);
  });
  it('falls back safely on corrupt or hostile data', () => {
    const { m, st } = memory();
    expect(loadSave(st)).toEqual(emptySave());
    m.set(SAVE_KEY, '{nope');
    expect(loadSave(st)).toEqual(emptySave());
    const odd = sanitizeSave({ coins: -4, meta: { hp: 99, power: 'x', fake: 3 }, heroes: ['tank', 'bogus', 'tank'], hero: 'sparky', settings: { muted: 'yes' } });
    expect(odd.coins).toBe(0);
    expect(odd.meta).toEqual({ hp: 5 });
    expect(odd.heroes).toEqual(['blaze', 'tank']);
    expect(odd.hero).toBe('blaze'); // sparky is not unlocked
    expect(odd.settings.muted).toBe(false);
  });
  it('survives unavailable storage', () => {
    expect(loadSave(null)).toEqual(emptySave());
    expect(writeSave(emptySave(), null)).toBe(false);
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(loadSave(broken)).toEqual(emptySave());
    expect(writeSave(emptySave(), broken)).toBe(false);
  });
  it('records bests and counts runs without mutating the input', () => {
    const s = emptySave();
    const r1 = recordRun(s, { timeSec: 100, kills: 500, level: 12, victory: false });
    expect(r1.newBestTime).toBe(true);
    expect(s.runs).toBe(0);
    expect(r1.save.bestTime).toBe(100);
    const r2 = recordRun(r1.save, { timeSec: 60, kills: 900, level: 10, victory: true });
    expect(r2.newBestTime).toBe(false);
    expect(r2.newBestKills).toBe(true);
    expect(r2.save.bestTime).toBe(100);
    expect(r2.save.bestKills).toBe(900);
    expect(r2.save.bestLevel).toBe(12);
    expect(r2.save.wins).toBe(1);
    expect(r2.save.runs).toBe(2);
  });
});

describe('time helpers', () => {
  it('hit stop keeps the longest window', () => {
    const h = new HitStop();
    h.trigger(0, 80);
    h.trigger(0, 30);
    expect(h.active(79)).toBe(true);
    expect(h.active(80)).toBe(false);
  });
  it('slow motion applies only inside its window and keeps the strongest scale', () => {
    const s = new SlowMo();
    expect(s.scale(0)).toBe(1);
    s.trigger(0, 500, 0.4);
    s.trigger(100, 500, 0.25);
    expect(s.scale(300)).toBe(0.25);
    expect(s.scale(600)).toBe(1);
  });
});

describe('Difficulty', () => {
  it('easy is gentler, hard is meaner but pays more', () => {
    const e = DIFFICULTIES.easy;
    const n = DIFFICULTIES.normal;
    const h = DIFFICULTIES.hard;
    expect(n).toMatchObject({ hp: 1, dmg: 1, spawn: 1, speed: 1, reward: 1 });
    expect(e.dmg).toBeLessThan(n.dmg);
    expect(e.hp).toBeLessThan(n.hp);
    expect(h.dmg).toBeGreaterThan(n.dmg);
    expect(h.spawn).toBeGreaterThan(n.spawn);
    expect(h.reward).toBeGreaterThan(n.reward);
    expect(e.reward).toBeLessThan(n.reward);
    expect(DIFFICULTY_IDS).toEqual(['easy', 'normal', 'hard']);
  });
  it('multipliers fade in so the start is always easy', () => {
    expect(ramped(1.5, 0)).toBe(1);
    expect(ramped(1.5, 90)).toBeCloseTo(1.25);
    expect(ramped(1.5, 180)).toBe(1.5);
    expect(ramped(1.5, 9999)).toBe(1.5);
    expect(ramped(0.6, 0)).toBe(1);
    expect(ramped(0.6, 180)).toBeCloseTo(0.6);
    expect(ramped(1.5, -5)).toBe(1);
  });
  it('validates ids and the save keeps the chosen one', () => {
    expect(isDifficulty('hard')).toBe(true);
    expect(isDifficulty('nightmare')).toBe(false);
    expect(isDifficulty(3)).toBe(false);
    expect(sanitizeSave({ difficulty: 'hard' }).difficulty).toBe('hard');
    expect(sanitizeSave({ difficulty: 'nope' }).difficulty).toBe('normal');
    expect(emptySave().difficulty).toBe('normal');
  });
});
