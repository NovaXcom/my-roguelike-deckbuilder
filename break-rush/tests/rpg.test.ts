import { describe, expect, it } from 'vitest';
import { addXp, xpToNext } from '../src/systems/Leveling';
import { crateDrops, dropsFor, splitValue, sumDrops, zoneRewardMult } from '../src/systems/Loot';
import { ROOMS_PER_ZONE, ZONES, depthMods, doorChoices, isBossRoom, isFinalBoss, nextProgress, roomsClearedBefore, RoomType } from '../src/systems/RunMap';
import { encounterRegion, planEnemyTotal, planRoom, START_X } from '../src/systems/RoomPlan';
import { Cooldown, UltGauge, ULT_MAX } from '../src/systems/Skills';
import { META_DEFS, META_IDS, buyMeta, canBuyMeta, metaBonuses, metaCost, metaLevel, shardsEarned } from '../src/systems/Meta';
import { RELIC_IDS, applyRelics, rollRelics } from '../src/systems/Relics';
import { BASE_STATS, statsFrom } from '../src/systems/UpgradeSystem';
import { newRun, BASE_MAX_HP } from '../src/systems/RunState';
import { emptySave, loadSave, sanitizeSave, writeSave, SAVE_KEY } from '../src/systems/SaveSystem';

/** Deterministic RNG (mulberry32) so generated-content tests are stable. */
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

describe('Leveling', () => {
  it('needs more xp each level', () => {
    for (let l = 1; l < 30; l++) expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
  });
  it('levels up, carries leftover xp, and can gain several levels at once', () => {
    const s = { level: 1, xp: 0 };
    expect(addXp(s, xpToNext(1) - 1)).toBe(0);
    expect(addXp(s, 1)).toBe(1);
    expect(s).toEqual({ level: 2, xp: 0 });
    const t = { level: 1, xp: 0 };
    expect(addXp(t, xpToNext(1) + xpToNext(2) + 5)).toBe(2);
    expect(t).toEqual({ level: 3, xp: 5 });
    expect(addXp(t, -50)).toBe(0);
  });
  it('the first level comes quickly (a few kills)', () => {
    expect(xpToNext(1)).toBeLessThanOrEqual(30);
  });
});

describe('Loot', () => {
  it('splits values exactly', () => {
    expect(splitValue(10, 3)).toEqual([4, 3, 3]);
    expect(splitValue(2, 5)).toEqual([1, 1]);
    expect(splitValue(0, 3)).toEqual([]);
    for (const [t, n] of [[37, 4], [1, 1], [100, 14]] as const) expect(splitValue(t, n).reduce((a, b) => a + b, 0)).toBe(t);
  });
  it('rewards: elite > normal > fodder, and zones pay more', () => {
    const r = () => 0.99; // never rolls a heart
    const gold = (tier: 'fodder' | 'normal' | 'elite', zone = 1) => sumDrops(dropsFor('grunt', tier, zone, r), 'gold');
    expect(gold('elite')).toBeGreaterThan(gold('normal'));
    expect(gold('normal')).toBeGreaterThan(gold('fodder'));
    expect(gold('normal', 3)).toBeGreaterThan(gold('normal', 1));
    expect(zoneRewardMult(3)).toBeGreaterThan(zoneRewardMult(1));
  });
  it('a normal kill drops several pickups (a shower), fodder just one coin', () => {
    const r = () => 0.99;
    expect(dropsFor('grunt', 'normal', 1, r).filter((d) => d.type === 'gold').length).toBeGreaterThanOrEqual(3);
    expect(dropsFor('grunt', 'fodder', 1, r).filter((d) => d.type === 'gold').length).toBe(1);
  });
  it('elites and bosses always drop a heart; others only sometimes', () => {
    expect(dropsFor('guard', 'elite', 1, () => 0.99).some((d) => d.type === 'heal')).toBe(true);
    expect(dropsFor('boss', 'normal', 1, () => 0.99).some((d) => d.type === 'heal')).toBe(true);
    expect(dropsFor('grunt', 'normal', 1, () => 0.99).some((d) => d.type === 'heal')).toBe(false);
    expect(dropsFor('grunt', 'normal', 1, () => 0).some((d) => d.type === 'heal')).toBe(true);
  });
  it('gold multiplier applies to gold only', () => {
    const r = () => 0.99;
    expect(sumDrops(dropsFor('grunt', 'normal', 1, r, 2), 'gold')).toBe(sumDrops(dropsFor('grunt', 'normal', 1, r), 'gold') * 2);
    expect(sumDrops(dropsFor('grunt', 'normal', 1, r, 2), 'xp')).toBe(sumDrops(dropsFor('grunt', 'normal', 1, r), 'xp'));
  });
  it('crates give gold', () => {
    expect(sumDrops(crateDrops(1, () => 0.99), 'gold')).toBeGreaterThan(0);
  });
});

describe('RunMap', () => {
  it('progresses through rooms, then zones, and ends at the final boss', () => {
    let p = { zone: 1, room: 0 };
    let steps = 0;
    while (!isFinalBoss(p)) {
      p = nextProgress(p);
      steps++;
      expect(steps).toBeLessThan(100);
    }
    expect(steps).toBe(ZONES * ROOMS_PER_ZONE - 1);
    expect(isBossRoom({ zone: 1, room: ROOMS_PER_ZONE - 1 })).toBe(true);
    expect(nextProgress({ zone: 1, room: ROOMS_PER_ZONE - 1 })).toEqual({ zone: 2, room: 0 });
    expect(roomsClearedBefore({ zone: 2, room: 1 })).toBe(ROOMS_PER_ZONE + 1);
  });
  it('offers a boss door before the boss and a fighting room otherwise', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rand = seeded(seed);
      for (let room = 0; room < ROOMS_PER_ZONE - 1; room++) {
        const opts = doorChoices({ zone: 1, room }, rand);
        if (room === ROOMS_PER_ZONE - 2) expect(opts).toEqual(['boss']);
        else {
          expect(opts.length).toBeGreaterThanOrEqual(2);
          expect(new Set(opts).size).toBe(opts.length);
          expect(opts.some((o) => o === 'combat' || o === 'elite')).toBe(true);
          expect(opts).not.toContain('boss');
        }
      }
    }
  });
  it('the room before the boss always offers a campfire', () => {
    for (let seed = 1; seed <= 100; seed++) expect(doorChoices({ zone: 1, room: ROOMS_PER_ZONE - 3 }, seeded(seed))).toContain('rest');
  });
  it('different seeds produce varied choices', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 100; seed++) seen.add(doorChoices({ zone: 1, room: 1 }, seeded(seed)).join(','));
    expect(seen.size).toBeGreaterThan(3);
  });
  it('depth makes enemies tougher', () => {
    const a = depthMods({ zone: 1, room: 0 });
    const b = depthMods({ zone: 3, room: 3 });
    expect(a).toEqual({ hp: 1, dmg: 1, count: 1 });
    expect(b.hp).toBeGreaterThan(a.hp);
    expect(b.dmg).toBeGreaterThan(a.dmg);
    expect(b.count).toBeGreaterThan(a.count);
  });
});

describe('RoomPlan', () => {
  it('combat rooms scroll several screens with fights, fodder and crates in order', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const plan = planRoom('combat', 3, seeded(seed));
      expect(plan.length).toBeGreaterThanOrEqual(4000);
      expect(plan.encounters.length).toBeGreaterThanOrEqual(2);
      const xs = plan.encounters.map((e) => e.x);
      expect([...xs].sort((a, b) => a - b)).toEqual(xs);
      expect(xs[xs.length - 1]).toBeLessThan(plan.exitX);
      expect(plan.fodder.length).toBeGreaterThanOrEqual(3);
      expect(planEnemyTotal(plan)).toBeGreaterThanOrEqual(20);
      for (const x of [...plan.crates, plan.exitX]) expect(x).toBeLessThanOrEqual(plan.length);
    }
  });
  it('locked fight regions never overlap each other, the start or the exit', () => {
    for (const type of ['combat', 'elite'] as const) {
      for (let seed = 1; seed <= 80; seed++) {
        const plan = planRoom(type, 2, seeded(seed));
        const regions = plan.encounters.map(encounterRegion);
        expect(regions[0].min).toBeGreaterThan(START_X + 300);
        for (let i = 1; i < regions.length; i++) expect(regions[i].min).toBeGreaterThan(regions[i - 1].max);
        expect(regions[regions.length - 1].max).toBeLessThan(plan.exitX);
        // each region is exactly one screen wide, so the camera can lock to it
        for (const r of regions) expect(r.max - r.min).toBeLessThanOrEqual(960);
      }
    }
  });
  it('fodder stands between fights, never inside a locked region', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const plan = planRoom('combat', 1, seeded(seed));
      const regions = plan.encounters.map(encounterRegion);
      for (const f of plan.fodder) {
        for (const r of regions) expect(f.x < r.min - 60 || f.x > r.max + 60).toBe(true);
        expect(f.x).toBeLessThan(plan.exitX);
        expect(f.groups.every((g) => g.tier === 'fodder')).toBe(true);
      }
    }
  });
  it('elite rooms contain elite-tier enemies', () => {
    const plan = planRoom('elite', 2, seeded(7));
    const elites = plan.encounters.flatMap((e) => e.spawns).filter((g) => g.tier === 'elite');
    expect(elites.length).toBeGreaterThanOrEqual(2);
  });
  it('non-combat rooms have a station and no enemies', () => {
    for (const [type, kind] of [['treasure', 'chest'], ['rest', 'campfire'], ['shop', 'merchant']] as const) {
      const plan = planRoom(type, 1, seeded(1));
      expect(plan.station?.kind).toBe(kind);
      expect(planEnemyTotal(plan)).toBe(0);
      expect(plan.station!.x).toBeLessThan(plan.exitX);
    }
  });
  it('new enemy types phase in with depth', () => {
    const kinds = (depth: number) => {
      const set = new Set<string>();
      // first fight of the room only: later fights in the same room get a little nastier
      for (let s = 1; s <= 60; s++) planRoom('combat', depth, seeded(s)).encounters[0].spawns.forEach((g) => set.add(g.kind));
      return set;
    };
    expect(kinds(0).has('guard')).toBe(false);
    expect(kinds(6).has('guard')).toBe(true);
    expect(kinds(6).has('rusher')).toBe(true);
  });
  it('the boss room is a compact arena with no encounters', () => {
    const plan = planRoom('boss', 4, seeded(1));
    expect(plan.length).toBeLessThanOrEqual(1500);
    expect(plan.encounters).toEqual([]);
  });
});

describe('Skills', () => {
  it('cooldown readiness and progress', () => {
    const c = new Cooldown(1000);
    expect(c.ready(0)).toBe(true);
    c.use(0);
    expect(c.ready(999)).toBe(false);
    expect(c.ready(1000)).toBe(true);
    expect(c.progress(500)).toBeCloseTo(0.5);
    c.use(2000, 0.5);
    expect(c.ready(2499)).toBe(false);
    expect(c.ready(2500)).toBe(true);
  });
  it('ult gauge fills, caps, and only spends when full', () => {
    const g = new UltGauge();
    g.gain(40);
    expect(g.ready).toBe(false);
    expect(g.consume()).toBe(false);
    expect(g.value).toBe(40);
    g.gain(1000);
    expect(g.value).toBe(ULT_MAX);
    expect(g.consume()).toBe(true);
    expect(g.value).toBe(0);
    g.gain(10, 1.6);
    expect(g.value).toBeCloseTo(16);
  });
});

describe('Meta progression', () => {
  it('costs rise per level and purchases are bounded', () => {
    expect(metaCost({}, 'vit')).toBe(META_DEFS.vit.baseCost);
    expect(metaCost({ vit: 2 }, 'vit')).toBe(META_DEFS.vit.baseCost * 3);
    expect(canBuyMeta(10, {}, 'vit')).toBe(false);
    const r = buyMeta(100, {}, 'vit')!;
    expect(r.levels.vit).toBe(1);
    expect(r.shards).toBe(100 - META_DEFS.vit.baseCost);
    expect(buyMeta(9999, { relic: 1 }, 'relic')).toBeNull();
    expect(metaLevel({ vit: 99 }, 'vit')).toBe(META_DEFS.vit.max);
  });
  it('bonuses reflect levels', () => {
    const b = metaBonuses({ vit: 2, atk: 1, gold: 3, xp: 2, ult: 2, relic: 1 });
    expect(b).toEqual({ maxHp: 20, damageMult: 1.06, startGold: 90, xpMult: 1.16, startUlt: 40, startRelic: true });
    expect(metaBonuses({}).damageMult).toBe(1);
  });
  it('every run pays something, wins pay more', () => {
    const lose = shardsEarned({ roomsCleared: 3, zonesCleared: 0, kills: 40, victory: false });
    const win = shardsEarned({ roomsCleared: 15, zonesCleared: 3, kills: 300, victory: true });
    expect(lose).toBeGreaterThan(0);
    expect(win).toBeGreaterThan(lose);
    expect(shardsEarned({ roomsCleared: 0, zonesCleared: 0, kills: 0, victory: false })).toBe(0);
  });
  it('every meta upgrade has a definition', () => {
    for (const id of META_IDS) expect(META_DEFS[id].max).toBeGreaterThan(0);
  });
});

describe('Relics', () => {
  it('rolls distinct relics the player does not have', () => {
    const r = rollRelics(seeded(3), ['blast', 'storm'], 3);
    expect(new Set(r).size).toBe(3);
    expect(r).not.toContain('blast');
    expect(rollRelics(seeded(3), RELIC_IDS, 3)).toEqual([]);
  });
  it('numeric relics change stats; others leave them alone', () => {
    const st = applyRelics(BASE_STATS, ['idol', 'overcharge', 'anklet']);
    expect(st.goldMult).toBeCloseTo(1.5);
    expect(st.magnetMult).toBeCloseTo(1.5);
    expect(st.ultGainMult).toBeCloseTo(1.6);
    expect(st.cooldownMult).toBeCloseTo(0.65);
    expect(applyRelics(BASE_STATS, ['blast', 'phoenix'])).toEqual(BASE_STATS);
    expect(BASE_STATS.goldMult).toBe(1);
  });
  it('new perks affect stats', () => {
    const st = statsFrom(['vitality', 'vitality', 'magnet', 'fortune', 'wisdom']);
    expect(st.maxHpBonus).toBe(40);
    expect(st.magnetMult).toBeCloseTo(1.6);
    expect(st.goldMult).toBeCloseTo(1.25);
    expect(st.xpMult).toBeCloseTo(1.15);
  });
});

describe('RunState and save', () => {
  it('a new run starts at zone 1 room 1 with meta bonuses applied', () => {
    const run = newRun('hard', { vit: 2, gold: 1, ult: 1, relic: 1 }, () => 0);
    expect(run.progress).toEqual({ zone: 1, room: 0 });
    expect(run.hp).toBe(BASE_MAX_HP + 20);
    expect(run.gold).toBe(30);
    expect(run.ult).toBe(20);
    expect(run.relics.length).toBe(1);
    expect(run.difficulty).toBe('hard');
    expect(newRun().relics).toEqual([]);
  });
  it('save keeps shards and meta levels, and rejects garbage', () => {
    const save = emptySave();
    save.shards = 120;
    save.meta = { vit: 3, relic: 1 };
    const store = new Map<string, string>();
    const st = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    writeSave(save, st);
    expect(loadSave(st)).toEqual(save);
    const bad = sanitizeSave({ shards: -5, meta: { vit: 99, atk: 'x', nope: 3, gold: 2.9 } });
    expect(bad.shards).toBe(0);
    expect(bad.meta).toEqual({ vit: 5, gold: 2 });
    expect(store.has(SAVE_KEY)).toBe(true);
  });
});

describe('room type coverage', () => {
  it('every room type can be planned', () => {
    for (const t of ['combat', 'elite', 'treasure', 'rest', 'shop', 'boss'] as RoomType[]) expect(planRoom(t, 0, seeded(1)).type).toBe(t);
  });
});
