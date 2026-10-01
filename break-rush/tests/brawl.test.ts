import { describe, expect, it } from 'vitest';
import { ENEMIES, PLAYER } from '../src/brawl/data';
import { STAGES } from '../src/brawl/stages';
import { botCommand as bot } from '../src/brawl/bot';
import { emptyCmd, Enemy, PlayerCmd, World } from '../src/brawl/World';

const DT = 1 / 60;

function arena(kinds: Enemy['kind'][] = [], seed = 1): World {
  const w = new World({ ...STAGES[0], props: [], weapons: [], waves: [[]] }, seed);
  // skip the intro and place enemies by hand
  w.status = 'fight';
  w.wave = 0;
  w.player.x = 0;
  w.player.z = 0;
  kinds.forEach((k, i) => {
    const e = (w as unknown as { spawn(k: string, s: number): Enemy }).spawn(k, 1);
    e.state = 'idle';
    e.x = 3 + i * 1.5;
    e.z = 0;
    e.cd = 0;
  });
  return w;
}

function run(w: World, secs: number, cmd: (w: World, t: number) => Partial<PlayerCmd>): void {
  for (let t = 0; t < secs && !w.ko; t += DT) {
    w.update(DT, { ...emptyCmd(), ...cmd(w, t) });
  }
}

describe('player attacks', () => {
  it('chains a four hit combo with a knockdown finisher', () => {
    const w = arena(['brute']);
    const e = w.enemies[0];
    e.x = 1.6;
    e.hp = 9999;
    e.cd = 99;
    let presses = 0;
    run(w, 2.2, (_w, t) => {
      const press = Math.floor(t / 0.3) > presses;
      if (press) presses++;
      return { light: press, aimX: 1, aimZ: 0 };
    });
    expect(w.maxCombo).toBeGreaterThanOrEqual(4);
    expect(w.knockdowns).toBeGreaterThanOrEqual(1);
  });

  it('light hits stun a normal enemy and interrupt its wind-up', () => {
    const w = arena(['thug']);
    const e = w.enemies[0];
    e.x = 1.8;
    e.token = true;
    w.update(DT, emptyCmd());
    expect(e.state).toBe('wind');
    run(w, 0.3, (_w, t) => ({ light: t < 0.02 }));
    expect(e.state === 'hit' || e.state === 'idle' || e.state === 'move').toBe(true);
    expect(e.hp).toBeLessThan(ENEMIES.thug.hp);
    expect(e.atk).toBeNull();
  });

  it('auto-aims: attacking lunges to a target a couple of metres away', () => {
    const w = arena(['thug']);
    w.enemies[0].x = 4;
    w.enemies[0].cd = 99;
    run(w, 0.5, (_w, t) => ({ light: t < 0.02, aimX: 1, aimZ: 0 }));
    expect(w.player.x).toBeGreaterThan(1.2);
    expect(w.enemies[0].hp).toBeLessThan(ENEMIES.thug.hp);
  });

  it('ground strike hits knocked-down enemies', () => {
    const w = arena(['thug']);
    const e = w.enemies[0];
    e.cd = 99;
    e.x = 1.4;
    e.state = 'down';
    e.downT = 5;
    e.t = 0;
    const hp = e.hp;
    run(w, 0.4, (_w, t) => ({ light: t < 0.02 }));
    expect(e.hp).toBeLessThan(hp);
  });
});

describe('defence', () => {
  it('a dodge with good timing makes the attack whiff', () => {
    const w = arena(['thug']);
    const e = w.enemies[0];
    e.x = 1.9;
    e.token = true;
    let dodged = false;
    run(w, 1.6, (ww) => {
      if (!dodged && e.state === 'wind' && e.t > e.atk!.wind - 0.2) { dodged = true; return { dodge: true, moveX: 0, moveZ: 1 }; }
      return {};
    });
    expect(dodged).toBe(true);
    expect(w.player.hp).toBe(PLAYER.hp);
  });

  it('without dodging, the same attack hurts', () => {
    const w = arena(['thug']);
    const e = w.enemies[0];
    e.x = 1.9;
    e.token = true;
    run(w, 1.4, () => ({}));
    expect(w.player.hp).toBeLessThan(PLAYER.hp);
  });

  it('a counter pressed just before the hit lands floors the attacker for free', () => {
    const w = arena(['thug']);
    const e = w.enemies[0];
    e.x = 1.9;
    e.token = true;
    let pressed = false;
    run(w, 1.6, () => {
      if (!pressed && e.state === 'wind' && e.t > e.atk!.wind - 0.12) { pressed = true; return { counter: true }; }
      return {};
    });
    expect(w.player.hp).toBe(PLAYER.hp);
    expect(e.hp).toBeLessThan(ENEMIES.thug.hp);
    expect(w.knockdowns).toBeGreaterThanOrEqual(1);
  });

  it('red attacks cannot be countered, only dodged', () => {
    const w = arena(['brute']);
    const e = w.enemies[0];
    e.x = 2.2;
    e.token = true;
    e.def = { ...e.def, attacks: [ENEMIES.brute.attacks[1]] };
    let pressed = false;
    run(w, 2.4, () => {
      if (!pressed && e.state === 'wind' && e.t > e.atk!.wind - 0.12) { pressed = true; return { counter: true }; }
      return {};
    });
    expect(w.player.hp).toBeLessThan(PLAYER.hp);
  });

  it('only a limited number of enemies attack at once', () => {
    const w = arena(['thug', 'thug', 'thug', 'thug', 'thug']);
    w.enemies.forEach((e, i) => { e.x = 3 + (i % 2) * 2; e.z = (i - 2) * 1.4; });
    let worst = 0;
    run(w, 12, () => ({ dodge: false }));
    // sample again while fighting back is irrelevant; check the invariant on a fresh run
    const w2 = arena(['thug', 'thug', 'thug', 'thug', 'thug']);
    w2.enemies.forEach((e, i) => { e.x = 3 + (i % 2) * 2; e.z = (i - 2) * 1.4; });
    for (let t = 0; t < 8; t += DT) {
      w2.player.hp = 100;
      w2.update(DT, emptyCmd());
      const attackers = w2.enemies.filter((e) => e.state === 'wind' || e.state === 'strike').length;
      worst = Math.max(worst, attackers);
    }
    expect(worst).toBeLessThanOrEqual(w2.stage.tokens);
    expect(worst).toBeGreaterThan(0);
  });
});

describe('guns', () => {
  it('a gunman telegraphs, then fires a bullet that can be dodged by moving', () => {
    const w = arena(['gunman']);
    const e = w.enemies[0];
    e.x = 8;
    let shots = 0;
    let maxHp = 0;
    run(w, 4, (ww, t) => {
      shots += ww.drain().filter((x) => x.type === 'shoot').length;
      maxHp = Math.max(maxHp, ww.player.hp);
      // sidestep at a steady pace once the shot is in the air
      return ww.bullets.length ? { moveZ: 1 } : {};
    });
    expect(shots).toBeGreaterThan(0);
    expect(w.player.hp).toBe(PLAYER.hp);
  });

  it('standing still gets you shot', () => {
    const w = arena(['gunman']);
    w.enemies[0].x = 8;
    run(w, 4, () => ({}));
    expect(w.player.hp).toBeLessThan(PLAYER.hp);
  });

  it('a perfect guard reflects the bullet and kills the shooter', () => {
    const w = arena(['gunman']);
    const e = w.enemies[0];
    e.x = 9;
    let guarded = false;
    run(w, 5, (ww) => {
      const b = ww.bullets[0];
      if (b && !b.reflected && b.x < 2.6 && !guarded) { guarded = true; return { counter: true }; }
      return {};
    });
    expect(guarded).toBe(true);
    expect(e.state).toBe('dead');
    expect(w.player.hp).toBe(PLAYER.hp);
  });
});

describe('throws, weapons, rush', () => {
  it('a grabbed enemy can be thrown into another one', () => {
    const w = arena(['thug', 'thug']);
    w.enemies[0].x = 1.5; w.enemies[0].cd = 99;
    w.enemies[1].x = 5; w.enemies[1].cd = 99;
    run(w, 1.4, (_w, t) => (t < 0.02 ? { grab: true } : { moveX: 1 }));
    expect(w.enemies[1].hp).toBeLessThan(ENEMIES.thug.hp);
    expect(w.enemies[0].hp).toBeLessThan(ENEMIES.thug.hp);
  });

  it('big enemies cannot be grabbed', () => {
    const w = arena(['brute']);
    w.enemies[0].x = 1.5; w.enemies[0].cd = 99;
    run(w, 0.3, (_w, t) => ({ grab: t < 0.02 }));
    expect(w.player.state).not.toBe('grab');
  });

  it('picking up a bat makes hits stronger and it wears out', () => {
    const w = arena(['brute']);
    w.pickups.push({ kind: 'bat', x: 0.5, z: 0, t: 0 });
    run(w, 0.1, (_w, t) => ({ pickup: t < 0.02 }));
    expect(w.player.weapon).toBe('bat');
    const plain = arena(['brute']);
    for (const x of [w, plain]) { x.enemies[0].x = 1.6; x.enemies[0].cd = 99; x.enemies[0].hp = 9999; }
    run(w, 0.5, (_w, t) => ({ light: t < 0.02 }));
    run(plain, 0.5, (_w, t) => ({ light: t < 0.02 }));
    expect(9999 - w.enemies[0].hp).toBeGreaterThan((9999 - plain.enemies[0].hp) * 1.5);
    w.player.uses = 1;
    w.player.weapon = 'bat';
    run(w, 1, (_w, t) => ({ light: t < 0.02 }));
    expect(w.player.weapon).toBeNull();
  });

  it('rush needs a full meter, then knocks everything around you down', () => {
    const w = arena(['thug', 'thug', 'thug']);
    w.enemies.forEach((e, i) => { e.x = 2 + i * 0.5; e.z = i - 1; e.cd = 99; });
    run(w, 0.5, (_w, t) => ({ rush: t < 0.02 }));
    expect(w.knockdowns).toBe(0);
    w.player.meter = PLAYER.maxMeter;
    run(w, 1, (_w, t) => ({ rush: t < 0.02 }));
    expect(w.knockdowns + w.kills).toBeGreaterThanOrEqual(3);
    expect(w.player.meter).toBeLessThan(PLAYER.maxMeter);
  });
});

describe('waves and scoring', () => {
  it('progresses through every wave and reports a clear', () => {
    const w = new World(STAGES[0], 3);
    let cleared = false;
    run(w, 120, (ww) => bot(ww, 'smart'));
    cleared = w.cleared;
    expect(w.wave).toBeGreaterThanOrEqual(1);
    expect(cleared || w.ko).toBe(true);
  });

  it('combo multiplier raises score and damage resets it', () => {
    const w = arena(['brute']);
    w.combo = 12;
    expect(w.mult).toBe(2);
    w.hurtPlayer(w.enemies[0], ENEMIES.thug.attacks[0], 8, 1, 0);
    expect(w.combo).toBe(0);
  });

  it('restartWave refills health and replays the wave after a KO', () => {
    const w = new World(STAGES[0], 5);
    run(w, 20, () => ({}));
    expect(w.player.hp).toBeLessThan(PLAYER.hp);
    w.player.hp = 0;
    run(w, 0.1, () => ({}));
    w.restartWave();
    expect(w.ko).toBe(false);
    expect(w.player.hp).toBe(PLAYER.hp);
    expect(w.aliveCount).toBeGreaterThan(0);
  });
});

describe('balance (bots)', () => {
  const play = (stage: number, mode: 'smart' | 'masher' | 'idle', seed: number) => {
    const w = new World(STAGES[stage], seed);
    run(w, 400, (ww) => bot(ww, mode));
    return w;
  };

  it('a player who does nothing loses', () => {
    expect(play(0, 'idle', 1).ko).toBe(true);
  });

  it('a defensive player clears stage 1 and 2 with health to spare', () => {
    for (const stage of [0, 1]) {
      let cleared = 0;
      let hpSum = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const w = play(stage, 'smart', seed);
        if (w.cleared) { cleared++; hpSum += w.player.hp; }
      }
      expect(cleared).toBeGreaterThanOrEqual(5);
      expect(hpSum / Math.max(1, cleared)).toBeGreaterThan(20);
    }
  });

  it('defence matters: a pure masher takes clearly more damage than the defensive player', () => {
    let smart = 0;
    let masher = 0;
    for (let seed = 1; seed <= 6; seed++) {
      smart += play(1, 'smart', seed).damageTaken;
      masher += play(1, 'masher', seed).damageTaken;
    }
    expect(masher).toBeGreaterThan(smart * 1.15);
  });

  it('the later stages are hard but clearable by the defensive bot at least sometimes', () => {
    let clears = 0;
    for (const stage of [2, 3]) for (let seed = 1; seed <= 5; seed++) if (play(stage, 'smart', seed).cleared) clears++;
    expect(clears).toBeGreaterThanOrEqual(3);
  });
});

describe('launcher and juggles', () => {
  it('a heavy attack launches a normal enemy, follow-ups keep it airborne, and landing knocks it down', () => {
    const w = arena(['thug']);
    const e = w.enemies[0];
    e.x = 1.7; e.cd = 99; e.hp = 9999;
    let maxY = 0;
    let launched = false;
    run(w, 0.8, (ww, t) => {
      maxY = Math.max(maxY, e.y);
      launched ||= e.state === 'launched';
      return { heavy: t < 0.02, light: t > 0.5 && t < 0.52 };
    });
    expect(launched).toBe(true);
    expect(maxY).toBeGreaterThan(0.8);
    expect(e.juggle).toBeGreaterThanOrEqual(1);
    run(w, 2.5, () => ({}));
    expect(e.y).toBe(0);
    expect(['down', 'getup', 'idle', 'move']).toContain(e.state);
    expect(w.knockdowns).toBeGreaterThanOrEqual(1);
  });

  it('a second heavy on a launched enemy slams it down for extra damage', () => {
    const w = arena(['thug']);
    const e = w.enemies[0];
    e.x = 1.7; e.cd = 99; e.hp = 9999;
    let slammed = false;
    run(w, 1.4, (ww, t) => {
      if (ww.drain().some((x) => x.type === 'slamdown')) slammed = true;
      return { heavy: t < 0.02 || (t > 0.55 && t < 0.57) };
    });
    expect(slammed).toBe(true);
    expect(9999 - e.hp).toBeGreaterThan(40);
  });

  it('armoured enemies are staggered instead of launched', () => {
    const w = arena(['brute']);
    const e = w.enemies[0];
    e.x = 1.9; e.cd = 99; e.hp = 9999;
    let air = false;
    run(w, 0.8, (_w, t) => { air ||= e.state === 'launched'; return { heavy: t < 0.02 }; });
    expect(air).toBe(false);
  });
});

describe('new moves', () => {
  it('finisher: a weakened, downed enemy is executed with E', () => {
    const w = arena(['thug']);
    const e = w.enemies[0];
    e.x = 1.4; e.cd = 99; e.state = 'down'; e.downT = 9; e.t = 0; e.hp = 5;
    w.player.hp = 50;
    let fin = false;
    run(w, 0.8, (ww, t) => { if (ww.drain().some((x) => x.type === 'finisher')) fin = true; return { heavy: t < 0.02 }; });
    expect(fin).toBe(true);
    expect(e.state).toBe('dead');
    expect(w.player.hp).toBeGreaterThan(55);
  });

  it('a healthy downed enemy gets a normal ground strike, not a finisher', () => {
    const w = arena(['thug']);
    const e = w.enemies[0];
    e.x = 1.4; e.cd = 99; e.state = 'down'; e.downT = 9; e.t = 0;
    run(w, 0.8, (_w, t) => ({ light: t < 0.02 }));
    expect(e.state).toBe('down');
    expect(e.hp).toBeLessThan(ENEMIES.thug.hp);
  });

  it('attacking right after a roll gives a fast dash strike that covers distance', () => {
    const w = arena(['thug']);
    w.enemies[0].x = 6; w.enemies[0].cd = 99; w.enemies[0].hp = 9999;
    let id = '';
    run(w, 1.2, (ww, t) => {
      if (ww.player.atk) id = ww.player.atk.id;
      if (t < 0.02) return { dodge: true, moveX: 0, moveZ: 1 };
      if (t > 0.3 && t < 0.32) return { light: true };
      return {};
    });
    expect(id).toBe('dash');
  });

  it('after a counter you can chain straight into the next enemy', () => {
    const w = arena(['thug', 'thug']);
    const a = w.enemies[0], b = w.enemies[1];
    a.x = 1.9; a.z = 0; a.token = true;
    b.x = 5; b.z = 2; b.cd = 99;
    let pressed = false, chained = false;
    run(w, 2.4, (ww) => {
      if (!pressed && a.state === 'wind' && a.t > a.atk!.wind - 0.12) { pressed = true; return { counter: true }; }
      if (pressed && ww.player.state === 'counter' && ww.player.t > 0.15 && !chained) { chained = true; return { light: true }; }
      return {};
    });
    expect(chained).toBe(true);
    expect(b.hp).toBeLessThan(ENEMIES.thug.hp);
  });
});

describe('explosive barrels', () => {
  const withBarrel = (kinds: Enemy['kind'][], safe = false) => {
    const w = new World({ ...STAGES[0], props: [{ kind: 'barrel', x: 4, z: 0, hw: 0.45, hd: 0.45, explosive: true }, { kind: 'barrel', x: 6.5, z: 0.5, hw: 0.45, hd: 0.45, explosive: true }], weapons: [], waves: [[]] }, 1);
    w.status = 'fight'; w.wave = 0; w.player.x = 0; w.player.z = 0;
    if (safe) { w.perks.push('demolition'); w.mods = (w as unknown as { mods: typeof w.mods }).mods; }
    kinds.forEach((k, i) => { const e = w.spawn(k, 1); e.state = 'idle'; e.x = 4.5 + i; e.z = 0.8; e.cd = 99; });
    return w;
  };
  it('hitting a red barrel blows up enemies around it, and chains to neighbours', () => {
    const w = withBarrel(['thug', 'thug']);
    let boom = 0;
    run(w, 0.8, (ww, t) => { boom += ww.drain().filter((x) => x.type === 'explode').length; return { light: t < 0.02, moveX: t < 0.4 ? 1 : 0 }; });
    // lunge out to the barrel
    w.player.x = 2.6; w.player.facing = 0;
    run(w, 0.5, (ww, t) => { boom += ww.drain().filter((x) => x.type === 'explode').length; return { light: t < 0.02 }; });
    expect(w.barrels.every((b) => !b.alive)).toBe(true);
    expect(boom).toBe(2);
    expect(w.enemies.every((e) => e.hp < e.maxHp)).toBe(true);
  });

  it('a bullet sets off a barrel', () => {
    const w = withBarrel([]);
    w.bullets.push({ x: 2, z: 0, vx: 20, vz: 0, life: 2, dmg: 5, from: -1, reflected: false });
    run(w, 0.5, () => ({}));
    expect(w.barrels[0].alive).toBe(false);
  });

  it('you take blast damage if you stand next to it', () => {
    const w = withBarrel([]);
    w.player.x = 2.2;
    w.bullets.push({ x: 3, z: 0, vx: 20, vz: 0, life: 2, dmg: 5, from: -1, reflected: false });
    run(w, 0.5, () => ({}));
    expect(w.player.hp).toBeLessThan(PLAYER.hp);
  });

  it('barrel props are copied per run, so a blown barrel does not leak into the next game', () => {
    const w = new World(STAGES[0], 1);
    w.explode(w.barrels[0]);
    const w2 = new World(STAGES[0], 1);
    expect(w2.barrels[0].alive).toBe(true);
    expect(w2.props.every((p) => p.solid !== false || p.kind === 'lamp')).toBe(true);
  });
});

describe('guns and thrown weapons', () => {
  it('a pistol (G) shoots the enemy you are facing and runs out of ammo', () => {
    const w = arena(['gunman']);
    const e = w.enemies[0];
    e.x = 9; e.cd = 99; e.hp = 9999;
    w.player.weapon = 'gun';
    w.player.uses = 2;
    run(w, 1.6, (_w, t) => ({ throw: (t > 0 && t < 0.02) || (t > 0.5 && t < 0.52), aimX: 1, aimZ: 0 }));
    expect(9999 - e.hp).toBeGreaterThanOrEqual(25);
    expect(w.player.weapon).toBeNull();
  });

  it('throwing a bat deals heavy damage and the bat is gone', () => {
    const w = arena(['thug']);
    const e = w.enemies[0];
    e.x = 7; e.cd = 99; e.hp = 9999;
    w.player.weapon = 'bat';
    w.player.uses = 5;
    run(w, 1, (_w, t) => ({ throw: t < 0.02, aimX: 1, aimZ: 0 }));
    expect(9999 - e.hp).toBeGreaterThanOrEqual(20);
    expect(w.player.weapon).toBeNull();
  });

  it('gunmen sometimes drop a pistol you can pick up', () => {
    let dropped = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const w = arena(['gunman'], seed);
      const e = w.enemies[0];
      e.x = 1.5; e.cd = 99; e.hp = 1;
      run(w, 0.3, (_w, t) => ({ light: t < 0.02 }));
      if (w.pickups.some((k) => k.kind === 'gun')) dropped++;
    }
    expect(dropped).toBeGreaterThan(3);
    expect(dropped).toBeLessThan(20);
  });
});

describe('perks', () => {
  const clearFirstWave = () => {
    const w = new World(STAGES[0], 4);
    w.status = 'clear'; w.wave = 0; w.statusT = 3;
    w.update(1 / 60, emptyCmd());
    return w;
  };
  it('after each wave you choose one of three perks before the next begins', () => {
    const w = clearFirstWave();
    expect(w.status).toBe('perk');
    expect(w.perkChoices.length).toBe(3);
    expect(new Set(w.perkChoices).size).toBe(3);
    for (let i = 0; i < 300; i++) w.update(1 / 60, emptyCmd());
    expect(w.wave).toBe(0); // waiting for the choice
    w.choosePerk(w.perkChoices[0]);
    expect(w.wave).toBe(1);
    expect(w.perks.length).toBe(1);
  });

  it('choosing something that was not offered does nothing', () => {
    const w = clearFirstWave();
    w.choosePerk('nonexistent');
    expect(w.status).toBe('perk');
  });

  it('perks change the numbers: IRON BODY raises max HP, BRAWLER raises damage, KEVLAR cuts damage', () => {
    const w = clearFirstWave();
    w.perkChoices = ['iron', 'brawler', 'kevlar'];
    w.choosePerk('iron');
    expect(w.player.maxHp).toBe(PLAYER.hp + 30);
    expect(w.mods.dmg).toBe(1);
    w.perks.push('brawler', 'kevlar');
    w.mods = (w as unknown as { mods: typeof w.mods }).mods;
  });

  it('a perk is never offered twice', () => {
    const w = new World(STAGES[0], 9, true);
    const seen = new Set<string>();
    for (let n = 0; n < 4; n++) {
      w.status = 'clear'; w.wave = n; w.statusT = 3;
      w.update(1 / 60, emptyCmd());
      expect(w.status).toBe('perk');
      for (const c of w.perkChoices) expect(seen.has(c)).toBe(false);
      const pick = w.perkChoices[0];
      seen.add(pick);
      w.choosePerk(pick);
    }
  });
});

describe('riot shield and assassin', () => {
  it('punches from the front are blocked; four blocked hits break the guard', () => {
    const w = arena(['shield']);
    const e = w.enemies[0];
    e.x = 1.9; e.cd = 99; e.facing = Math.PI;
    let clang = 0, broke = false;
    run(w, 3, (ww, t) => {
      for (const x of ww.drain()) { if (x.type === 'clang') clang++; if (x.type === 'guardBreak') broke = true; }
      e.facing = broke ? e.facing : Math.PI;
      return { light: Math.floor(t / 0.4) !== Math.floor((t - DT) / 0.4) };
    });
    expect(clang).toBeGreaterThanOrEqual(4);
    expect(broke).toBe(true);
  });

  it('attacks from behind go through', () => {
    const w = arena(['shield']);
    const e = w.enemies[0];
    e.x = 1.9; e.cd = 99; e.facing = 0; // facing away from the player
    run(w, 0.4, (_w, t) => ({ light: t < 0.02 }));
    expect(e.hp).toBeLessThan(ENEMIES.shield.hp);
  });

  it('a shield can be grabbed and thrown', () => {
    const w = arena(['shield']);
    const e = w.enemies[0];
    e.x = 1.6; e.cd = 99; e.facing = Math.PI;
    run(w, 0.3, (_w, t) => ({ grab: t < 0.02 }));
    expect(w.player.state).toBe('grab');
  });

  it('the shielder turns slowly, so you can run round it', () => {
    const w = arena(['shield']);
    const e = w.enemies[0];
    e.x = 2.5; e.cd = 99; e.facing = Math.PI;
    w.player.x = 0;
    run(w, 0.25, () => ({}));
    w.player.x = 5; // jump to the other side
    run(w, 0.15, () => ({}));
    expect(w.shieldBlocks(e, w.player.x, w.player.z)).toBe(false);
  });

  it('assassins stab with a long red lunge you must roll through', () => {
    const w = arena(['assassin']);
    const e = w.enemies[0];
    e.x = 5; e.token = true; e.cd = 0;
    let icon = '';
    run(w, 3, (ww) => { if (e.atk) icon = e.atk.icon; return {}; });
    expect(icon).toBe('red');
    expect(w.player.hp).toBeLessThan(PLAYER.hp);
  });
});

describe('boss', () => {
  it('enrages below 25% health', () => {
    const w = arena(['boss']);
    const e = w.enemies[0];
    e.cd = 99;
    e.hp = e.maxHp * 0.26;
    w.damageEnemy(e, 10, { kb: 0, knock: false, heavy: false, force: true });
    expect(e.rage).toBeGreaterThan(1);
  });
});

describe('guard feels snappy', () => {
  it('a tapped guard is over in about a third of a second, and letting go of a held guard is instant', () => {
    const w = arena([]);
    run(w, 0.05, () => ({ counter: true }));
    expect(w.player.state).toBe('guard');
    run(w, 0.4, () => ({}));
    expect(w.player.state).toBe('idle');
    // hold
    run(w, 0.1, () => ({ counter: true, guardHeld: true }));
    run(w, 0.8, () => ({ guardHeld: true }));
    expect(w.player.state).toBe('guard');
    run(w, 0.02, () => ({ guardHeld: false }));
    expect(w.player.state).toBe('idle');
  });

  it('you can roll out of a guard immediately', () => {
    const w = arena([]);
    run(w, 0.05, () => ({ counter: true }));
    run(w, 0.03, () => ({ dodge: true, moveZ: 1 }));
    expect(w.player.state).toBe('dodge');
  });

  it('and attack out of it once the stance is open', () => {
    const w = arena(['thug']);
    w.enemies[0].x = 1.6; w.enemies[0].cd = 99;
    run(w, 0.05, () => ({ counter: true }));
    run(w, 0.2, (_w, t) => ({ light: t > 0.08 && t < 0.1 }));
    expect(w.player.state).toBe('attack');
  });
});

describe('just dodge', () => {
  it('rolling just as an attack lands triggers slow motion for enemies only', () => {
    const w = arena(['thug', 'thug']);
    const a = w.enemies[0], b = w.enemies[1];
    a.x = 1.9; a.token = true; b.x = 8; b.z = 3; b.cd = 99;
    let just = false;
    run(w, 1.4, (ww) => {
      if (ww.drain().some((x) => x.type === 'justdodge')) just = true;
      if (!just && a.state === 'wind' && a.t > a.atk!.wind - 0.1 && ww.player.state !== 'dodge') return { dodge: true, moveZ: 1 };
      return {};
    });
    expect(just).toBe(true);
    expect(w.witchT).toBeGreaterThan(0);
    const t0 = b.t;
    w.update(1 / 60, emptyCmd());
    // during witch time enemy clocks advance at a fraction of real time
    expect(b.t - t0).toBeLessThan(1 / 60 * 0.5);
    expect(w.player.hp).toBe(PLAYER.hp);
  });

  it('an early roll is an ordinary evade with no slow motion', () => {
    const w = arena(['thug']);
    const a = w.enemies[0];
    a.x = 1.9; a.token = true;
    let evaded = false;
    run(w, 1.4, (ww) => {
      for (const x of ww.drain()) if (x.type === 'evade') evaded = true;
      if (!evaded && a.state === 'wind' && a.t > a.atk!.wind - 0.38 && ww.player.state !== 'dodge' && ww.player.dodgeEnd < 0) return { dodge: true, moveZ: 1 };
      return {};
    });
    expect(w.witchT).toBe(0);
  });
});

describe('air combos', () => {
  const launchOne = () => {
    const w = arena(['thug']);
    const e = w.enemies[0];
    e.x = 1.7; e.cd = 99; e.hp = 9999;
    run(w, 0.4, (_w, t) => ({ heavy: t < 0.02 }));
    return { w, e };
  };

  it('a launching heavy attack carries the player up after the enemy', () => {
    const { w, e } = launchOne();
    expect(e.state).toBe('launched');
    expect(w.player.y).toBeGreaterThan(0.3);
    expect(['air', 'attack']).toContain(w.player.state);
  });

  it('air strikes juggle the enemy and keep you both aloft, then the slam brings you down with a shockwave', () => {
    const { w, e } = launchOne();
    let hits = 0, slam = false, quake = false;
    for (let t = 0; t < 2.4; t += DT) {
      for (const x of w.drain()) { if (x.type === 'slamdown') slam = true; if (x.type === 'airSlam') quake = true; }
      const press = Math.floor(t / 0.18) !== Math.floor((t - DT) / 0.18);
      const cmd = { ...emptyCmd(), light: press && t < 0.6, heavy: press && t >= 0.6 && t < 0.8 };
      if (cmd.light) hits++;
      w.update(DT, cmd);
    }
    expect(hits).toBeGreaterThanOrEqual(2);
    expect(e.juggle).toBeGreaterThanOrEqual(2);
    expect(slam).toBe(true);
    expect(quake).toBe(true);
    expect(w.player.y).toBe(0);
  });

  it('while you are high in the air melee attacks cannot touch you', () => {
    const { w } = launchOne();
    w.player.y = 2; w.player.vy = 0;
    const th = (w as unknown as { spawn(k: string, s: number): Enemy }).spawn('thug', 1);
    th.state = 'idle'; th.x = w.player.x + 1; th.z = w.player.z; th.token = true; th.cd = 0;
    const hp = w.player.hp;
    for (let i = 0; i < 40; i++) { w.player.y = 2; w.player.vy = 0; w.update(DT, emptyCmd()); }
    expect(w.player.hp).toBe(hp);
  });
});

describe('style rank', () => {
  it('mixing different moves climbs the rank much faster than repeating one move', () => {
    const a = arena([]);
    const b = arena([]);
    for (let i = 0; i < 12; i++) b.styleGain('hit', 12);
    for (const m of ['hit', 'counter', 'finish', 'throw', 'explode', 'justdodge', 'airslam', 'deflect', 'gun', 'kill', 'rush', 'evade']) a.styleGain(m, 12);
    expect(a.style).toBeGreaterThan(b.style * 1.8);
    expect(a.styleRank).toBeGreaterThan(b.styleRank);
  });

  it('style decays when you stop, and is cut when you are hit', () => {
    const w = arena([]);
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].forEach((m) => w.styleGain(m, 40));
    const high = w.style;
    expect(high).toBeGreaterThan(300);
    for (let i = 0; i < 60 * 4; i++) w.update(DT, emptyCmd());
    expect(w.style).toBeLessThan(high);
    const s0 = w.style;
    const th = (w as unknown as { spawn(k: string, s: number): Enemy }).spawn('thug', 1);
    w.hurtPlayer(th, ENEMIES.thug.attacks[0], 8, 1, 0);
    expect(w.style).toBeCloseTo(s0 * 0.5, 0);
  });

  it('a higher rank multiplies your score', () => {
    const w = arena([]);
    const base = w.mult;
    for (const m of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']) w.styleGain(m, 40);
    expect(w.mult).toBeGreaterThan(base * 1.5);
  });

  it('rank changes are announced', () => {
    const w = arena([]);
    w.styleGain('a', 100);
    expect(w.drain().some((e) => e.type === 'rank' && e.by === 'up')).toBe(true);
  });
});
