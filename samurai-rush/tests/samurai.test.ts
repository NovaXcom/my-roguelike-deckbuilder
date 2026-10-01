import { describe, expect, it } from 'vitest';
import { botCommand } from '../src/samurai/bot';
import { ENEMIES, P } from '../src/samurai/data';
import { SCROLLS } from '../src/samurai/perks';
import { ENDLESS, STAGES, StageDef } from '../src/samurai/stages';
import { Cmd, emptyCmd, EKind, Enemy, World } from '../src/samurai/World';

const DT = 1 / 60;
const EMPTY: StageDef = { id: 50, name: 't', jp: 't', blurb: '', theme: 'bamboo', length: 300, patrols: [], encounters: [] };

function dojo(kinds: [EKind, number][] = []): World {
  const w = new World(EMPTY, 1);
  w.p.x = 20;
  kinds.forEach(([k, x]) => {
    const e = w.spawn(k, x, 'idle');
    e.cd = 99;
  });
  return w;
}

const at = (t: number, T: number) => Math.abs(t - T) < 0.008;

function run(w: World, secs: number, f: (w: World, t: number) => Partial<Cmd>): void {
  for (let t = 0; t < secs && !w.ko; t += DT) w.update(DT, { ...emptyCmd(), ...f(w, t) });
}

describe('movement', () => {
  it('runs fast, with a quick start and stop', () => {
    const w = dojo();
    run(w, 0.3, () => ({ moveX: 1 }));
    expect(w.p.vx).toBeCloseTo(P.runSpeed, 0);
    run(w, 0.3, () => ({}));
    expect(Math.abs(w.p.vx)).toBeLessThan(0.1);
  });

  it('jump, hold for height, double jump, and cut the jump short by releasing', () => {
    const tall = dojo();
    let top = 0;
    run(tall, 1.2, (ww, t) => (top = Math.max(top, ww.p.y), { jump: at(t, 0), jumpHeld: t < 0.5 }));
    const hop = dojo();
    let hopTop = 0;
    run(hop, 1.2, (ww, t) => (hopTop = Math.max(hopTop, ww.p.y), { jump: at(t, 0), jumpHeld: t < 0.05 }));
    expect(top).toBeGreaterThan(2.4);
    expect(hopTop).toBeLessThan(top * 0.7);
    const dbl = dojo();
    let dtop = 0;
    let djumps = 0;
    run(dbl, 1.4, (ww, t) => { djumps += ww.drain().filter((e) => e.type === 'djump').length; dtop = Math.max(dtop, ww.p.y); return { jump: at(t, 0) || at(t, 0.4), jumpHeld: true }; });
    expect(djumps).toBe(1);
    expect(dtop).toBeGreaterThan(top + 1.2);
  });
});

describe('slashing', () => {
  it('a three hit combo; the third is a big sweep that hits harder', () => {
    const w = dojo([['oni', 22]]);
    const e = w.enemies[0];
    e.hp = 9999;
    const dmgs: number[] = [];
    const seen = new Set<string>();
    run(w, 1.4, (ww, t) => {
      for (const ev of ww.drain()) if (ev.type === 'hit') dmgs.push(ev.dmg ?? 0);
      if (ww.p.slash) seen.add(ww.p.slash.id);
      return { slash: Math.round(t * 60) % 13 === 0 && Math.abs(t * 60 - Math.round(t * 60)) < 0.01 && t < 0.7 };
    });
    expect(seen.has('s1') && seen.has('s2') && seen.has('s3')).toBe(true);
    expect(Math.max(...dmgs)).toBeGreaterThan(Math.min(...dmgs) * 1.5);
  });

  it('a foot soldier dies to two cuts and falls apart with a cut event', () => {
    const w = dojo([['ashigaru', 22.5]]);
    let cut = false;
    run(w, 0.8, (ww, t) => { if (ww.drain().some((e) => e.type === 'cut')) cut = true; return { slash: at(t, 0) || at(t, 0.2) }; });
    expect(cut).toBe(true);
    expect(w.kills).toBe(1);
    expect(w.enemies.length).toBe(0);
  });

  it('slashing auto-aims and lunges at enemies a few metres away', () => {
    const w = dojo([['oni', 25.5]]);
    w.enemies[0].hp = 9999;
    run(w, 0.4, (_w, t) => ({ slash: at(t, 0) }));
    expect(w.p.x).toBeGreaterThan(21.5);
    expect(w.enemies[0].hp).toBeLessThan(9999);
  });

  it('an up-slash launches enemies, and air cuts keep juggling them', () => {
    const w = dojo([['swordsman', 22]]);
    const e = w.enemies[0];
    e.hp = 9999;
    let maxY = 0;
    run(w, 0.8, (ww, t) => {
      maxY = Math.max(maxY, e.y);
      if (at(t, 0)) return { slash: true, moveY: 1 };
      if (at(t, 0.2)) return { jump: true, jumpHeld: true };
      if (at(t, 0.36) || at(t, 0.48)) return { slash: true, jumpHeld: true };
      return { jumpHeld: true };
    });
    expect(maxY).toBeGreaterThan(1.2);
    expect(e.juggle).toBeGreaterThanOrEqual(1);
  });

  it('a downward air slash dives and the landing blasts nearby enemies', () => {
    const w = dojo([['ashigaru', 22], ['ashigaru', 23.5]]);
    w.enemies.forEach((e) => (e.hp = 9999));
    let plunge = false;
    run(w, 1.4, (ww, t) => {
      if (ww.drain().some((e) => e.type === 'plunge')) plunge = true;
      if (at(t, 0)) return { jump: true, jumpHeld: true };
      if (at(t, 0.2)) return { slash: true, moveY: -1, jumpHeld: true };
      return { jumpHeld: true };
    });
    expect(plunge).toBe(true);
    expect(w.enemies.every((e) => e.hp < 9999)).toBe(true);
  });

  it('a guarding swordsman blocks ordinary cuts but a heavy sweep gets through', () => {
    const w = dojo([['swordsman', 22.6]]);
    const e = w.enemies[0];
    e.guarding = true; e.guardT = 99; e.face = -1; e.hp = 9999;
    let guards = 0;
    run(w, 0.5, (ww, t) => { guards += ww.drain().filter((x) => x.type === 'guard').length; return { slash: at(t, 0) }; });
    expect(guards).toBeGreaterThan(0);
    expect(e.hp).toBe(9999);
    // a dash cut ignores the guard
    const w2 = dojo([['swordsman', 24]]);
    w2.enemies[0].guarding = true; w2.enemies[0].guardT = 99;
    run(w2, 0.5, (_w, t) => ({ dash: at(t, 0), moveX: 1 }));
    expect(w2.kills).toBe(1);
  });
});

describe('dash cut', () => {
  it('cuts everything on the path at the same instant when the dash ends, for one pip', () => {
    const w = dojo([['ashigaru', 24], ['ashigaru', 27], ['swordsman', 30]]);
    w.enemies.forEach((e) => { e.hp = 40; });
    let minPips = 9;
    let marked = 0, firstCut = -1, lastCut = -1;
    run(w, 0.6, (ww, t) => {
      minPips = Math.min(minPips, ww.p.pips);
      for (const e of ww.drain()) {
        if (e.type === 'mark') marked++;
        if (e.type === 'cut') { if (firstCut < 0) firstCut = t; lastCut = t; }
      }
      return { dash: at(t, 0), moveX: 1 };
    });
    expect(marked).toBe(3);
    expect(w.kills).toBeGreaterThanOrEqual(2);
    expect(lastCut - firstCut).toBeLessThan(0.02);
    expect(firstCut).toBeGreaterThan(0.08);
    expect(minPips).toBeLessThan(P.pipsMax - 0.8);
    expect(w.p.x).toBeGreaterThan(30);
  });

  it('with no slash gauge left, dash is only a short step that cuts nothing', () => {
    const w = dojo([['ashigaru', 24]]);
    w.p.pips = 0;
    run(w, 0.2, (_w, t) => ({ dash: at(t, 0), moveX: 1 }));
    expect(w.kills).toBe(0);
    expect(w.p.x - 20).toBeLessThan(7);
  });

  it('you cannot be hurt during a dash, and dashing through danger triggers slow motion', () => {
    const w = dojo();
    w.projectiles.push({ id: 7, kind: 'arrow', owner: 'enemy', x: 20.4, y: 1.1, vx: -1, vy: 0, dmg: 11, life: 3, from: 0 });
    let just = false;
    run(w, 0.6, (ww, t) => { if (ww.drain().some((x) => x.type === 'justDash')) just = true; return { dash: at(t, 0), moveX: 1 }; });
    expect(just).toBe(true);
    expect(w.p.hp).toBe(P.hp);
    expect(w.slowT).toBeGreaterThan(0);
  });

  it('flying around the arena costs gauge but it refills with time and kills', () => {
    const w = dojo();
    w.p.pips = 0;
    run(w, 3, () => ({}));
    expect(w.p.pips).toBeGreaterThan(0.9);
  });
});

describe('parry', () => {
  const striker = (kind: EKind, x: number, w = dojo()) => {
    const e = w.spawn(kind, x, 'idle');
    e.token = true; e.cd = 0;
    return { w, e };
  };

  it('a well-timed parry stuns the attacker and costs you nothing', () => {
    const { w, e } = striker('ashigaru', 22.4);
    let parried = false;
    run(w, 1.4, (ww) => {
      if (ww.drain().some((x) => x.type === 'parry')) parried = true;
      if (!parried && e.state === 'wind' && e.t > e.atk!.wind - 0.1 && ww.p.state !== 'parry') return { parry: true };
      return {};
    });
    expect(parried).toBe(true);
    expect(w.p.hp).toBe(P.hp);
    expect(['stun', 'idle', 'walk']).toContain(e.state);
  });

  it('a stunned enemy dies to a single cut (execution)', () => {
    const { w, e } = striker('swordsman', 22.4);
    let executed = false;
    run(w, 2.2, (ww) => {
      if (ww.drain().some((x) => x.type === 'execute')) executed = true;
      if (e.state === 'wind' && e.t > e.atk!.wind - 0.1 && ww.p.state !== 'parry' && ww.p.state !== 'slash') return { parry: true };
      if (e.state === 'stun') return { slash: true };
      return {};
    });
    expect(executed).toBe(true);
    expect(e.state).toBe('dead');
  });

  it('pressing late only blocks: chip damage', () => {
    const { w, e } = striker('ashigaru', 22.4);
    run(w, 1.4, (ww) => (e.state === 'wind' && e.t > e.atk!.wind - 0.38 && ww.p.state === 'free' ? { parry: true, parryHeld: true } : { parryHeld: ww.p.state === 'parry' }));
    expect(w.p.hp).toBeLessThan(P.hp);
    expect(w.p.hp).toBeGreaterThan(P.hp - 6);
  });

  it('red attacks cannot be parried', () => {
    const { w, e } = striker('ninja', 22.8);
    e.def = { ...e.def, atks: [ENEMIES.ninja.atks[0]] };
    e.token = false;
    run(w, 1.4, (ww) => (e.state === 'wind' && e.atk?.icon === 'red' && e.t > e.atk.wind - 0.1 && ww.p.state !== 'parry' ? { parry: true } : {}));
    expect(w.p.hp).toBeLessThan(P.hp);
  });

  it('a parried arrow flies back and kills the archer', () => {
    const w = dojo();
    const a = w.spawn('archer', 33, 'idle');
    a.token = false; a.cd = 0;
    let reflected = false;
    run(w, 4, (ww) => {
      if (ww.drain().some((x) => x.type === 'reflect')) reflected = true;
      const q = ww.projectiles.find((z) => z.owner === 'enemy');
      if (q && Math.abs(q.x - ww.p.x) < 4.1 && ww.p.state !== 'parry' && ww.p.parryCd <= 0 && !reflected) return { parry: true };
      return {};
    });
    expect(reflected).toBe(true);
    expect(a.state).toBe('dead');
  });

  it('you can cut an arrow out of the air', () => {
    const w = dojo();
    w.projectiles.push({ id: 99, kind: 'arrow', owner: 'enemy', x: 25, y: 1.2, vx: -26, vy: 0, dmg: 11, life: 3, from: 0 });
    let cut = false;
    run(w, 0.5, (ww, t) => { if (ww.drain().some((e) => e.type === 'projCut')) cut = true; return { slash: t > 0.05 && t < 0.07 }; });
    expect(cut).toBe(true);
    expect(w.p.hp).toBe(P.hp);
  });
});

describe('ougi (iai)', () => {
  it('after a charge, everything in front within reach is cut in the same instant, for two pips', () => {
    const w = dojo([['ashigaru', 24], ['ashigaru', 26], ['swordsman', 28], ['archer', 30], ['ashigaru', 38]]);
    w.enemies.forEach((e) => { e.hp = 50; });
    let fired = false;
    let minPips = 9;
    run(w, 1, (ww, t) => { minPips = Math.min(minPips, ww.p.pips); if (ww.drain().some((e) => e.type === 'iaiFire')) fired = true; return { iai: at(t, 0) }; });
    expect(fired).toBe(true);
    expect(w.kills).toBeGreaterThanOrEqual(3);
    expect(w.enemies.find((e) => e.hp === 50 && e.kind === 'ashigaru')).toBeDefined();
    expect(minPips).toBeLessThan(P.pipsMax - 1.5);
  });
  it('needs two pips', () => {
    const w = dojo([['ashigaru', 24]]);
    w.p.pips = 1;
    run(w, 1, (_w, t) => ({ iai: at(t, 0) }));
    expect(w.kills).toBe(0);
  });
});

describe('enemies', () => {
  it('they close in but only two melee fighters attack at a time inside an encounter', () => {
    const st: StageDef = { ...EMPTY, encounters: [{ x: 5, waves: [[{ kind: 'ashigaru', n: 6 }]] }] };
    const w = new World(st, 3);
    w.p.x = 6;
    let worst = 0;
    for (let t = 0; t < 12; t += DT) {
      w.p.hp = 100;
      w.update(DT, emptyCmd());
      worst = Math.max(worst, w.enemies.filter((e) => e.state === 'wind' || e.state === 'strike').length);
    }
    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeLessThanOrEqual(2);
  });

  it('jumping clears an oni stomp, standing still does not', () => {
    const mk = () => { const w = dojo(); const e = w.spawn('oni', 22.5, 'idle'); e.token = true; e.cd = 0; e.def = { ...e.def, atks: [ENEMIES.oni.atks[1]] }; return { w, e }; };
    const a = mk();
    run(a.w, 2, () => ({}));
    expect(a.w.p.hp).toBeLessThan(P.hp);
    const b = mk();
    run(b.w, 2, (ww) => (b.e.state === 'wind' && b.e.t > b.e.atk!.wind - 0.25 && ww.p.onGround ? { jump: true, jumpHeld: true } : { jumpHeld: true }));
    expect(b.w.p.hp).toBe(P.hp);
  });

  it('ninjas appear behind you', () => {
    const w = dojo();
    const n = w.spawn('ninja', 30, 'idle');
    n.def = { ...n.def, atks: [ENEMIES.ninja.atks[0]] };
    n.token = false; n.cd = 0;
    let poof = false;
    run(w, 2, (ww) => { if (ww.drain().some((e) => e.type === 'poof')) poof = true; return {}; });
    expect(poof).toBe(true);
  });

  it('the shogun summons help as he gets hurt', () => {
    const w = dojo();
    const s = w.spawn('shogun', 28, 'idle');
    s.cd = 99;
    let reinforced = 0;
    s.hp = s.maxHp * 0.55;
    w.damageEnemy(s, 1, { angle: 0, by: 'slash', knock: 0, launch: false, heavy: false });
    s.hp = s.maxHp * 0.25;
    w.damageEnemy(s, 1, { angle: 0, by: 'slash', knock: 0, launch: false, heavy: false });
    for (const e of w.drain()) if (e.type === 'reinforce') reinforced++;
    expect(reinforced).toBe(2);
  });
});

describe('stage flow', () => {
  it('reaching an encounter locks the screen, spawns waves, and unlocks when they are dead', () => {
    const st: StageDef = { ...EMPTY, encounters: [{ x: 30, waves: [[{ kind: 'ashigaru', n: 2 }], [{ kind: 'ashigaru', n: 1 }]] }] };
    const w = new World(st, 2);
    w.p.x = 31;
    let locked = false, unlocked = false, waves = 0;
    for (let t = 0; t < 40 && !unlocked; t += DT) {
      const cmd = { ...emptyCmd(), ...botCommand(w, 'smart') };
      w.update(DT, cmd);
      for (const e of w.drain()) { if (e.type === 'lock') locked = true; if (e.type === 'unlock') unlocked = true; if (e.type === 'wave') waves++; }
      if (w.lock) expect(w.p.x).toBeGreaterThanOrEqual(w.lock.min);
    }
    expect(locked).toBe(true);
    expect(waves).toBe(2);
    expect(unlocked).toBe(true);
    expect(w.lock).toBeNull();
  });

  it('roadside enemies wake up as you run towards them', () => {
    const st: StageDef = { ...EMPTY, patrols: [{ x: 60, kind: 'ashigaru', n: 2 }] };
    const w = new World(st, 1);
    w.update(DT, emptyCmd());
    expect(w.enemies.length).toBe(0);
    w.p.x = 40;
    w.update(DT, emptyCmd());
    expect(w.enemies.length).toBe(2);
  });

  it('retrying after a KO restores health and the fight', () => {
    const st: StageDef = { ...EMPTY, encounters: [{ x: 30, waves: [[{ kind: 'swordsman', n: 3 }]] }] };
    const w = new World(st, 2);
    w.p.x = 31;
    run(w, 30, () => ({}));
    expect(w.ko).toBe(true);
    w.retryEncounter();
    expect(w.ko).toBe(false);
    expect(w.p.hp).toBe(P.hp);
    expect(w.aliveCount).toBe(0);
  });

  it('scrolls change the numbers', () => {
    const w = new World(EMPTY, 1, ['tsubame', 'edge']);
    expect(w.pipsMax).toBe(P.pipsMax + 1);
    expect(w.mods.dmg).toBe(1.2);
    expect(SCROLLS.length).toBeGreaterThanOrEqual(10);
    expect(new World(EMPTY, 1).offerScrolls().length).toBe(3);
  });
});

describe('bots', () => {
  const play = (stage: StageDef, mode: 'smart' | 'masher' | 'idle', seed: number, perks: string[] = []) => {
    const w = new World(stage, seed, perks);
    let t = 0;
    for (; t < 300 && !w.ko && !w.cleared; t += DT) w.update(DT, { ...emptyCmd(), ...botCommand(w, mode) });
    w.drain();
    return { w, t };
  };

  it('doing nothing loses (the first fight kills you)', () => {
    const st: StageDef = { ...EMPTY, encounters: [{ x: 4, waves: [[{ kind: 'swordsman', n: 3 }]] }] };
    const w = new World(st, 1);
    w.p.x = 5;
    run(w, 40, () => ({}));
    expect(w.ko).toBe(true);
  });

  it('a competent player clears stages 1 and 2', () => {
    for (const st of [STAGES[0], STAGES[1]]) {
      let clears = 0;
      for (let seed = 1; seed <= 6; seed++) if (play(st, 'smart', seed).w.cleared) clears++;
      expect(clears).toBeGreaterThanOrEqual(5);
    }
  });

  it('the bot can fight through later stages too (sometimes)', () => {
    let clears = 0;
    for (const st of [STAGES[2], STAGES[3]]) for (let seed = 1; seed <= 5; seed++) if (play(st, 'smart', seed, ['edge', 'calm']).w.cleared) clears++;
    expect(clears).toBeGreaterThanOrEqual(3);
  });

  it('endless mode keeps coming and eventually beats a bot', () => {
    const { w } = play({ ...ENDLESS }, 'smart', 1);
    expect(w.kills).toBeGreaterThan(15);
  });
});
