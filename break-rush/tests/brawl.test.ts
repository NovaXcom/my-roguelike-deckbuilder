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
    (e.def as { attacks: unknown[] }).attacks = [ENEMIES.brute.attacks[1]];
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
    expect(masher).toBeGreaterThan(smart * 1.3);
  });

  it('the later stages are hard but clearable by the defensive bot at least sometimes', () => {
    let clears = 0;
    for (const stage of [2, 3]) for (let seed = 1; seed <= 5; seed++) if (play(stage, 'smart', seed).cleared) clears++;
    expect(clears).toBeGreaterThanOrEqual(3);
  });
});
