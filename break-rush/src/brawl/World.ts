import { Rng } from '../game/Rng';
import { AttackDef, COMBO_CHAIN, EnemyDef, EnemyKind, ENEMIES, PLAYER, PLAYER_ATTACKS } from './data';
import { endlessWave, Prop, StageDef, WaveSpec } from './stages';

export type FState =
  | 'idle' | 'move' | 'attack' | 'dodge' | 'guard' | 'counter' | 'hit' | 'down' | 'getup' | 'grab' | 'rush' | 'dead'
  | 'enter' | 'wind' | 'strike' | 'rec' | 'thrown' | 'grabbed';

export interface Fighter {
  id: number;
  kind: 'player' | EnemyKind;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Knock-back velocity that decays on its own. */
  kx: number;
  kz: number;
  facing: number;
  hp: number;
  maxHp: number;
  radius: number;
  state: FState;
  t: number;
  alive: boolean;
  flash: number;
  /** Animation name currently playing (for the renderer). */
  anim: string;
  /** Total seconds the current action lasts (for the renderer). */
  dur: number;
  /** Distance walked, drives the walk cycle. */
  walk: number;
}

export interface Player extends Fighter {
  atk: AttackDef | null;
  step: number;
  comboGap: number;
  queued: 'light' | 'heavy' | null;
  hitDone: boolean;
  lungeV: number;
  dodgeCd: number;
  dodgeX: number;
  dodgeZ: number;
  meter: number;
  weapon: 'bat' | 'pipe' | null;
  uses: number;
  grabId: number;
  stun: number;
  downT: number;
  invuln: number;
}

export interface Enemy extends Fighter {
  def: EnemyDef;
  atk: AttackDef | null;
  cd: number;
  token: boolean;
  strafe: number;
  ringOff: number;
  hitDone: boolean;
  stun: number;
  downT: number;
  enterT: number;
  weapon: 'bat' | null;
  aimX: number;
  aimZ: number;
  telegraph: number;
  deadT: number;
  phase2: boolean;
  lungeV: number;
  kind: EnemyKind;
}

export interface Bullet {
  x: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
  dmg: number;
  from: number;
  reflected: boolean;
}

export interface Pickup {
  kind: 'bat' | 'pipe' | 'health';
  x: number;
  z: number;
  t: number;
}

export interface WorldEvent {
  type: string;
  x?: number;
  y?: number;
  z?: number;
  id?: number;
  dmg?: number;
  heavy?: boolean;
  kind?: string;
  icon?: string;
  n?: number;
  total?: number;
  last?: boolean;
  by?: string;
  target?: 'enemy' | 'player';
}

export interface PlayerCmd {
  moveX: number;
  moveZ: number;
  aimX: number;
  aimZ: number;
  light: boolean;
  heavy: boolean;
  dodge: boolean;
  counter: boolean;
  grab: boolean;
  pickup: boolean;
  rush: boolean;
}

export const emptyCmd = (): PlayerCmd => ({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, light: false, heavy: false, dodge: false, counter: false, grab: false, pickup: false, rush: false });

export function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

type WaveStatus = 'intro' | 'spawning' | 'fight' | 'clear' | 'done';

export class World {
  player: Player;
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  pickups: Pickup[] = [];
  events: WorldEvent[] = [];
  props: Prop[];
  rng: Rng;
  time = 0;
  wave = -1;
  status: WaveStatus = 'intro';
  statusT = 0;
  ko = false;
  cleared = false;
  score = 0;
  combo = 0;
  maxCombo = 0;
  comboT = 0;
  kills = 0;
  damageTaken = 0;
  knockdowns = 0;
  /** Multiplier on damage dealt to the player (assist mode lowers it). */
  damageScale = 1;
  private nextId = 1;
  private queue: { kind: EnemyKind; side: number }[] = [];
  private queueT = 0;
  private gunCd = 0;
  private waves: WaveSpec[][];
  private endless: boolean;

  constructor(readonly stage: StageDef, seed = 1, endless = false) {
    this.rng = new Rng(seed);
    this.props = stage.props;
    this.endless = endless;
    this.waves = stage.waves;
    this.player = this.makePlayer();
    for (const w of stage.weapons) this.pickups.push({ kind: w.kind, x: w.x, z: w.z, t: 0 });
  }

  get totalWaves(): number {
    return this.endless ? 9999 : this.waves.length;
  }

  /** Sum of enemy point values over the whole stage (used to rank scores). */
  get parScore(): number {
    let s = 0;
    for (const w of this.waves) for (const g of w) s += ENEMIES[g.kind].pts * g.n;
    return Math.round(s * 2.3);
  }

  private makePlayer(): Player {
    return {
      id: 0, kind: 'player', x: -this.stage.w / 2 + 4, z: 0, vx: 0, vz: 0, kx: 0, kz: 0, facing: 0, hp: PLAYER.hp, maxHp: PLAYER.hp, radius: PLAYER.radius,
      state: 'idle', t: 0, alive: true, flash: 0, anim: 'idle', dur: 0, walk: 0,
      atk: null, step: 0, comboGap: 0, queued: null, hitDone: false, lungeV: 0, dodgeCd: 0, dodgeX: 1, dodgeZ: 0, meter: 0, weapon: null, uses: 0, grabId: -1, stun: 0, downT: 0, invuln: 0,
    };
  }

  // ------------------------------------------------------------------ main step

  update(dt: number, cmd: PlayerCmd): void {
    this.lastDt = dt;
    this.time += dt;
    this.updateWaves(dt);
    this.assignTokens();
    this.updatePlayer(dt, cmd);
    for (const e of this.enemies) this.updateEnemy(e, dt);
    this.updateBullets(dt);
    this.updatePickups(dt);
    this.collide();
    this.comboT -= dt;
    if (this.comboT <= 0 && this.combo > 0) this.combo = 0;
    this.gunCd -= dt;
    for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i].state === 'dead' && this.enemies[i].deadT > 2.4) this.enemies.splice(i, 1);
  }

  /** Take (and clear) the events produced since the last call. */
  drain(): WorldEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  get mult(): number {
    return 1 + Math.min(6, Math.floor(this.combo / 6)) * 0.5;
  }

  private ev(e: WorldEvent): void {
    this.events.push(e);
  }

  private addScore(n: number): void {
    this.score += Math.round(n * this.mult);
  }

  private registerHit(): void {
    this.combo++;
    this.comboT = PLAYER.comboWindow;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    if (this.combo % 5 === 0) this.ev({ type: 'combo', n: this.combo });
  }

  // ------------------------------------------------------------------ waves

  get aliveCount(): number {
    let n = 0;
    for (const e of this.enemies) if (e.state !== 'dead') n++;
    return n + this.queue.length;
  }

  private updateWaves(dt: number): void {
    this.statusT += dt;
    if (this.status === 'intro') {
      if (this.statusT > 1.6) this.startWave(0);
    } else if (this.status === 'spawning') {
      this.queueT -= dt;
      if (this.queueT <= 0 && this.queue.length) {
        const q = this.queue.shift()!;
        this.spawn(q.kind, q.side);
        this.queueT = 0.55;
      }
      if (!this.queue.length) this.status = 'fight';
    } else if (this.status === 'fight') {
      if (this.aliveCount === 0 && this.player.alive) {
        this.status = 'clear';
        this.statusT = 0;
        this.ev({ type: 'waveClear', n: this.wave + 1 });
        if (this.player.hp < this.player.maxHp) this.pickups.push({ kind: 'health', x: this.player.x + 1.5, z: this.player.z + 1.2, t: 0 });
      }
    } else if (this.status === 'clear') {
      if (this.statusT > 2.2) {
        if (!this.endless && this.wave + 1 >= this.waves.length) {
          this.status = 'done';
          this.cleared = true;
          this.ev({ type: 'stageClear' });
        } else this.startWave(this.wave + 1);
      }
    }
  }

  private startWave(n: number): void {
    this.wave = n;
    this.status = 'spawning';
    this.statusT = 0;
    const spec = this.endless ? endlessWave(n, this.rng) : this.waves[n];
    this.queue = [];
    let side = this.rng.next() < 0.5 ? -1 : 1;
    for (const g of spec) for (let i = 0; i < g.n; i++) {
      this.queue.push({ kind: g.kind, side });
      side = -side;
    }
    // ranged units and heavies last so the first seconds are readable
    this.queue.sort((a, b) => ENEMIES[a.kind].pts - ENEMIES[b.kind].pts);
    this.queueT = 0.2;
    this.ev({ type: 'wave', n: n + 1, total: this.endless ? 0 : this.waves.length });
  }

  /** After a KO: refill and replay the current wave. */
  restartWave(): void {
    const p = this.player;
    this.enemies.length = 0;
    this.bullets.length = 0;
    const keep = { score: this.score, maxCombo: this.maxCombo, dmg: this.damageTaken, kills: this.kills };
    Object.assign(p, this.makePlayer(), { x: p.x, z: p.z });
    p.x = -this.stage.w / 2 + 4;
    p.z = 0;
    this.score = Math.max(0, keep.score - 200);
    this.maxCombo = keep.maxCombo;
    this.damageTaken = keep.dmg;
    this.kills = keep.kills;
    this.combo = 0;
    this.ko = false;
    this.startWave(Math.max(0, this.wave));
  }

  spawn(kind: EnemyKind, side: number): Enemy {
    const def = ENEMIES[kind];
    const x = side * (this.stage.w / 2 + 3);
    const z = (this.rng.next() - 0.5) * this.stage.d * 0.6;
    const e: Enemy = {
      id: this.nextId++, kind, def, x, z, vx: 0, vz: 0, kx: 0, kz: 0, facing: side > 0 ? Math.PI : 0, hp: def.hp, maxHp: def.hp, radius: def.radius,
      state: 'enter', t: 0, alive: true, flash: 0, anim: 'walk', dur: 0, walk: 0,
      atk: null, cd: this.rng.range(0.6, 1.6), token: false, strafe: this.rng.next() < 0.5 ? 1 : -1, ringOff: this.rng.range(-0.4, 0.8),
      hitDone: false, stun: 0, downT: 0, enterT: 0, weapon: kind === 'bat' ? 'bat' : null, aimX: 0, aimZ: 0, telegraph: 0, deadT: 0, phase2: false, lungeV: 0,
    };
    this.enemies.push(e);
    return e;
  }

  // ------------------------------------------------------------------ tokens (only a few enemies may attack at once)

  private assignTokens(): void {
    let held = 0;
    for (const e of this.enemies) {
      if (e.state === 'dead') e.token = false;
      if (e.token) held++;
    }
    const max = this.enemies.some((e) => e.kind === 'boss' && e.state !== 'dead') ? 2 : this.stage.tokens;
    if (held >= max || !this.player.alive) return;
    const p = this.player;
    const cands = this.enemies.filter((e) => !e.token && e.kind !== 'gunman' && (e.state === 'idle' || e.state === 'move') && e.cd <= 0);
    cands.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    for (const e of cands) {
      if (held >= max) break;
      e.token = true;
      held++;
    }
  }

  // ------------------------------------------------------------------ player

  private pickTarget(p: Player, dx: number, dz: number, maxDist = 5): Enemy | null {
    const hasDir = Math.hypot(dx, dz) > 0.2;
    const dir = hasDir ? Math.atan2(dz, dx) : p.facing;
    let best: Enemy | null = null;
    let bs = Infinity;
    for (const e of this.enemies) {
      if (e.state === 'dead' || e.state === 'down' || e.state === 'grabbed' || e.state === 'thrown' || e.state === 'enter') continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d > maxDist) continue;
      const a = Math.abs(angleDiff(Math.atan2(e.z - p.z, e.x - p.x), dir));
      if (a > 1.0 && d > 2.2) continue;
      const s = d + a * 2.2;
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }

  private startAttack(p: Player, id: string, cmd: PlayerCmd): void {
    let def = PLAYER_ATTACKS[id];
    if (p.weapon && id !== 'ground') def = { ...def, dmg: def.dmg * 1.8, range: def.range + 0.7, anim: id === 'heavy' ? 'heavyW' : 'swingW' };
    p.state = 'attack';
    p.t = 0;
    p.atk = def;
    p.anim = def.anim;
    p.dur = def.wind + def.strike + def.rec;
    p.hitDone = false;
    p.queued = null;
    const tgt = id === 'ground' ? this.nearestDowned(p) : this.pickTarget(p, cmd.moveX, cmd.moveZ);
    let ax = Math.cos(p.facing), az = Math.sin(p.facing);
    let dist = 0;
    if (tgt) {
      const dx = tgt.x - p.x, dz = tgt.z - p.z;
      dist = Math.hypot(dx, dz) || 1;
      ax = dx / dist; az = dz / dist;
    } else if (Math.hypot(cmd.moveX, cmd.moveZ) > 0.2) {
      const l = Math.hypot(cmd.moveX, cmd.moveZ);
      ax = cmd.moveX / l; az = cmd.moveZ / l;
    }
    p.facing = Math.atan2(az, ax);
    const reach = tgt ? Math.max(0, dist - tgt.radius - 0.9) : def.lunge * 0.35;
    p.lungeV = Math.min(def.lunge, reach) / (def.wind + def.strike);
    if (id !== 'ground') {
      const i = COMBO_CHAIN.indexOf(id);
      p.step = i >= 0 ? (i + 1) % COMBO_CHAIN.length : 0;
    }
    p.comboGap = 0;
  }

  private nearestDowned(p: Player): Enemy | null {
    let best: Enemy | null = null;
    let bd = 2.4;
    for (const e of this.enemies) {
      if (e.state !== 'down') continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  private updatePlayer(dt: number, cmd: PlayerCmd): void {
    const p = this.player;
    p.t += dt;
    p.flash = Math.max(0, p.flash - dt);
    p.dodgeCd = Math.max(0, p.dodgeCd - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    if (p.comboGap < 9) p.comboGap += dt;
    p.vx = p.vz = 0;
    if (!p.alive) return;

    const mlen = Math.hypot(cmd.moveX, cmd.moveZ);
    const free = p.state === 'idle' || p.state === 'move';
    const inRec = p.state === 'attack' && p.atk && p.t >= p.atk.wind + p.atk.strike;
    const canAct = free || inRec || (p.state === 'guard' && p.t > PLAYER.guardTime) || (p.state === 'counter' && p.t > PLAYER.counterTime * 0.55);

    // ---- buffered input and cancels ----
    if (p.state === 'attack' && p.atk) {
      if (cmd.light) p.queued = 'light';
      if (cmd.heavy) p.queued = 'heavy';
    }
    if (cmd.dodge && p.dodgeCd <= 0 && (canAct || p.state === 'hit' && p.t > 0.12 || p.state === 'attack' && p.atk && p.t > p.atk.wind + p.atk.strike * 0.5)) {
      this.startDodge(p, cmd);
    } else if (cmd.counter && canAct && p.state !== 'guard') {
      p.state = 'guard';
      p.t = 0;
      p.anim = 'guard';
      p.dur = PLAYER.guardTime;
      p.atk = null;
    } else if (cmd.rush && p.meter >= PLAYER.maxMeter && (free || inRec)) {
      p.state = 'rush';
      p.t = 0;
      p.anim = 'rush';
      p.dur = 0.8;
      p.meter = 0;
      p.atk = null;
      p.invuln = 0.8;
      this.ev({ type: 'rushStart', x: p.x, z: p.z });
    } else if (cmd.pickup && (free || inRec)) {
      this.tryPickup(p);
    } else if (cmd.grab && free) {
      this.tryGrab(p, cmd);
    } else if ((cmd.light || cmd.heavy) && (free || inRec)) {
      const down = this.nearestDowned(p);
      const standing = this.pickTarget(p, cmd.moveX, cmd.moveZ, 2.4);
      if (cmd.heavy) this.startAttack(p, 'heavy', cmd);
      else if (down && !standing) this.startAttack(p, 'ground', cmd);
      else {
        const id = p.comboGap < 0.75 && p.step > 0 ? COMBO_CHAIN[p.step] : COMBO_CHAIN[0];
        this.startAttack(p, id, cmd);
      }
    }

    // ---- state update ----
    switch (p.state) {
      case 'idle':
      case 'move': {
        const sp = PLAYER.speed;
        p.vx = cmd.moveX * sp;
        p.vz = cmd.moveZ * sp;
        if (mlen > 0.15) {
          p.state = 'move';
          p.anim = 'run';
          const target = Math.atan2(cmd.moveZ, cmd.moveX);
          p.facing += angleDiff(target, p.facing) * Math.min(1, dt * 16);
          p.walk += Math.hypot(p.vx, p.vz) * dt;
        } else {
          p.state = 'idle';
          p.anim = 'idle';
        }
        break;
      }
      case 'attack': {
        const a = p.atk!;
        const active = a.wind + a.strike;
        if (p.t < active) {
          p.vx = Math.cos(p.facing) * p.lungeV;
          p.vz = Math.sin(p.facing) * p.lungeV;
        }
        if (p.t >= a.wind && !p.hitDone) {
          p.hitDone = true;
          this.playerStrike(p, a);
        }
        if (p.t >= active + a.rec) {
          const q = p.queued;
          p.state = 'idle';
          p.atk = null;
          if (q === 'light') this.startAttack(p, p.comboGap < 0.75 && p.step > 0 ? COMBO_CHAIN[p.step] : COMBO_CHAIN[0], cmd);
          else if (q === 'heavy') this.startAttack(p, 'heavy', cmd);
        }
        break;
      }
      case 'dodge': {
        const k = Math.max(0, 1 - p.t / PLAYER.dodgeTime);
        const sp = PLAYER.dodgeSpeed * (0.35 + 0.65 * k);
        p.vx = p.dodgeX * sp;
        p.vz = p.dodgeZ * sp;
        if (p.t >= PLAYER.dodgeTime) { p.state = 'idle'; p.dodgeCd = PLAYER.dodgeCd; }
        break;
      }
      case 'guard':
        if (p.t >= PLAYER.guardTime + 0.18) p.state = 'idle';
        break;
      case 'counter':
        if (p.t >= PLAYER.counterTime) p.state = 'idle';
        break;
      case 'hit':
        p.vx = p.vz = 0;
        if (p.t >= p.stun) p.state = 'idle';
        break;
      case 'down':
        if (p.t >= p.downT) { p.state = 'getup'; p.t = 0; p.anim = 'getup'; p.dur = 0.55; }
        break;
      case 'getup':
        if (p.t >= 0.55) { p.state = 'idle'; p.invuln = Math.max(p.invuln, 0.3); }
        break;
      case 'grab': {
        const e = this.enemies.find((q) => q.id === p.grabId);
        if (!e || e.state !== 'grabbed') { p.state = 'idle'; break; }
        e.x = p.x + Math.cos(p.facing) * 0.9;
        e.z = p.z + Math.sin(p.facing) * 0.9;
        if (p.t >= 0.34) this.throwEnemy(p, e, cmd);
        if (p.t >= 0.6) p.state = 'idle';
        break;
      }
      case 'rush': {
        if (p.t >= 0.28 && !p.hitDone) {
          p.hitDone = true;
          this.rushBlast(p);
        }
        if (p.t < 0.28) p.hitDone = false;
        if (p.t >= 0.8) p.state = 'idle';
        break;
      }
      default:
        break;
    }
    if (p.state !== 'attack' && p.state !== 'idle' && p.state !== 'move') p.comboGap = Math.min(p.comboGap, 0.3);
  }

  private startDodge(p: Player, cmd: PlayerCmd): void {
    let dx = cmd.moveX, dz = cmd.moveZ;
    const l = Math.hypot(dx, dz);
    if (l < 0.2) {
      // no direction: roll away from the nearest enemy
      const n = this.pickTarget(p, 0, 0, 8);
      if (n) { dx = p.x - n.x; dz = p.z - n.z; } else { dx = -Math.cos(p.facing); dz = -Math.sin(p.facing); }
    }
    const k = Math.hypot(dx, dz) || 1;
    p.dodgeX = dx / k; p.dodgeZ = dz / k;
    p.facing = Math.atan2(p.dodgeZ, p.dodgeX);
    p.state = 'dodge';
    p.t = 0;
    p.anim = 'roll';
    p.dur = PLAYER.dodgeTime;
    p.atk = null;
    this.ev({ type: 'dodge', x: p.x, z: p.z });
  }

  private tryPickup(p: Player): void {
    for (let i = 0; i < this.pickups.length; i++) {
      const k = this.pickups[i];
      if (k.kind === 'health') continue;
      if (Math.hypot(k.x - p.x, k.z - p.z) < 1.8) {
        if (p.weapon) this.pickups.push({ kind: p.weapon, x: p.x + 0.8, z: p.z, t: 0 });
        p.weapon = k.kind;
        p.uses = k.kind === 'bat' ? 12 : 14;
        this.pickups.splice(i, 1);
        this.ev({ type: 'pickup', kind: k.kind });
        return;
      }
    }
  }

  private tryGrab(p: Player, cmd: PlayerCmd): void {
    let best: Enemy | null = null;
    let bd = 2.2;
    for (const e of this.enemies) {
      if (e.def.armored || e.state === 'dead' || e.state === 'down' || e.state === 'thrown' || e.state === 'grabbed' || e.state === 'enter') continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return;
    best.state = 'grabbed';
    best.token = false;
    best.atk = null;
    p.state = 'grab';
    p.t = 0;
    p.anim = 'grab';
    p.dur = 0.6;
    p.grabId = best.id;
    p.facing = Math.atan2(best.z - p.z, best.x - p.x);
    void cmd;
  }

  private throwEnemy(p: Player, e: Enemy, cmd: PlayerCmd): void {
    let dx = cmd.moveX, dz = cmd.moveZ;
    if (Math.hypot(dx, dz) < 0.2) { dx = cmd.aimX; dz = cmd.aimZ; }
    // prefer throwing toward another enemy in that general direction
    const dir = Math.atan2(dz, dx);
    let best: Enemy | null = null;
    let bs = 1.0;
    for (const o of this.enemies) {
      if (o === e || o.state === 'dead') continue;
      const a = Math.abs(angleDiff(Math.atan2(o.z - p.z, o.x - p.x), dir));
      if (a < bs) { bs = a; best = o; }
    }
    const ang = best ? Math.atan2(best.z - p.z, best.x - p.x) : dir;
    e.state = 'thrown';
    e.t = 0;
    e.anim = 'thrown';
    e.kx = Math.cos(ang) * 15;
    e.kz = Math.sin(ang) * 15;
    p.grabId = -1;
    this.ev({ type: 'throw', id: e.id, x: e.x, z: e.z });
    this.damageEnemy(e, 14, { kb: 0, knock: false, heavy: false, quiet: true });
    if (e.hp > 0) e.state = 'thrown';
    this.addScore(80);
  }

  private rushBlast(p: Player): void {
    this.ev({ type: 'rush', x: p.x, z: p.z });
    for (const e of this.enemies) {
      if (e.state === 'dead') continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d < 4.2) this.damageEnemy(e, 32, { kb: 7, knock: true, heavy: true, from: p, force: true });
    }
    for (const b of this.bullets) if (Math.hypot(b.x - p.x, b.z - p.z) < 4.2) b.life = 0;
  }

  private playerStrike(p: Player, a: AttackDef): void {
    if (p.weapon) {
      p.uses--;
      if (p.uses <= 0) { p.weapon = null; this.ev({ type: 'weaponBreak' }); }
    }
    const hits: { e: Enemy; d: number }[] = [];
    for (const e of this.enemies) {
      if (e.state === 'dead' || e.state === 'grabbed' || e.state === 'thrown' || e.state === 'enter') continue;
      if (a.id === 'ground' ? e.state !== 'down' : e.state === 'down') continue;
      const dx = e.x - p.x, dz = e.z - p.z;
      const d = Math.hypot(dx, dz) - e.radius;
      if (d > a.range) continue;
      if (Math.abs(angleDiff(Math.atan2(dz, dx), p.facing)) > a.arc && d > 0.3) continue;
      hits.push({ e, d });
    }
    hits.sort((x, y) => x.d - y.d);
    const max = a.id === 'heavy' ? 4 : a.knock ? 3 : 1;
    if (!hits.length) this.ev({ type: 'whiff', x: p.x + Math.cos(p.facing), z: p.z + Math.sin(p.facing), id: 0 });
    for (const h of hits.slice(0, max)) this.damageEnemy(h.e, a.dmg, { kb: a.kb, knock: !!a.knock, heavy: a.id === 'heavy' || a.id === 'l4', from: p, finisher: a.id === 'l4' });
  }

  /** Returns true if the enemy died. */
  damageEnemy(e: Enemy, dmg: number, o: { kb: number; knock: boolean; heavy: boolean; from?: Fighter; quiet?: boolean; force?: boolean; finisher?: boolean; mult?: number }): boolean {
    if (e.state === 'dead') return false;
    const armored = e.def.armored && !o.knock && !o.force && e.state !== 'hit' && e.state !== 'down';
    if (armored) dmg *= 0.55;
    e.hp -= dmg;
    e.flash = 0.14;
    const p = this.player;
    const from = o.from ?? p;
    const dx = e.x - from.x, dz = e.z - from.z;
    const l = Math.hypot(dx, dz) || 1;
    if (!o.quiet) {
      this.registerHit();
      this.addScore(10 + (o.heavy ? 15 : 0));
      p.meter = Math.min(PLAYER.maxMeter, p.meter + 4 + (o.heavy ? 4 : 0));
    }
    this.ev({ type: 'hit', target: 'enemy', id: e.id, x: e.x, y: 1.2, z: e.z, dmg, heavy: o.heavy || o.knock, kind: e.kind, by: armored ? 'armor' : undefined });
    if (e.hp <= 0) {
      this.kill(e, o.heavy || o.knock, dx / l, dz / l);
      return true;
    }
    if (e.kind === 'boss' && !e.phase2 && e.hp < e.maxHp * 0.5) {
      e.phase2 = true;
      this.queue.push({ kind: 'knife', side: -1 }, { kind: 'knife', side: 1 });
      this.status = 'spawning';
      this.queueT = 0.4;
      this.ev({ type: 'reinforce' });
    }
    if (e.state === 'thrown') return false;
    if (o.knock) {
      this.knockdown(e, dx / l, dz / l, o.kb);
    } else if (!armored) {
      e.state = 'hit';
      e.t = 0;
      e.stun = 0.34;
      e.anim = 'hit';
      e.dur = e.stun;
      e.token = false;
      e.atk = null;
      e.kx += (dx / l) * o.kb;
      e.kz += (dz / l) * o.kb;
      e.cd = Math.max(e.cd, 0.5);
    } else {
      e.kx += (dx / l) * o.kb * 0.15;
      e.kz += (dz / l) * o.kb * 0.15;
    }
    return false;
  }

  private knockdown(e: Enemy, dx: number, dz: number, kb: number): void {
    e.state = 'down';
    e.t = 0;
    e.downT = 1.7;
    e.anim = 'down';
    e.dur = e.downT;
    e.token = false;
    e.atk = null;
    e.kx = dx * kb * 1.4;
    e.kz = dz * kb * 1.4;
    e.facing = Math.atan2(-dz, -dx);
    this.knockdowns++;
  }

  private kill(e: Enemy, heavy: boolean, dx: number, dz: number): void {
    e.state = 'dead';
    e.t = 0;
    e.deadT = 0;
    e.hp = 0;
    e.alive = false;
    e.token = false;
    e.atk = null;
    e.anim = 'dead';
    e.kx = dx * (heavy ? 6 : 3);
    e.kz = dz * (heavy ? 6 : 3);
    e.facing = Math.atan2(-dz, -dx);
    this.kills++;
    this.addScore(e.def.pts);
    const p = this.player;
    p.meter = Math.min(PLAYER.maxMeter, p.meter + 8);
    p.hp = Math.min(p.maxHp, p.hp + 3);
    const last = this.aliveCount === 0;
    this.ev({ type: 'kill', id: e.id, kind: e.kind, x: e.x, y: 1, z: e.z, last, heavy });
    if (e.weapon === 'bat') this.pickups.push({ kind: 'bat', x: e.x, z: e.z, t: 0 });
    if (this.rng.next() < 0.14) this.pickups.push({ kind: 'health', x: e.x, z: e.z, t: 0 });
  }

  // ------------------------------------------------------------------ being hit

  /** Resolves an enemy attack against the player. Returns what happened. */
  hurtPlayer(src: Enemy | null, atk: AttackDef, dmg: number, dirx: number, dirz: number, bullet?: Bullet): 'hit' | 'evade' | 'block' | 'counter' | 'none' {
    const p = this.player;
    dmg *= this.damageScale;
    if (!p.alive || p.invuln > 0 && p.state !== 'guard') return 'none';
    if (p.state === 'dodge' && p.t >= PLAYER.iFrom && p.t <= PLAYER.iTo) {
      this.ev({ type: 'evade', x: p.x, z: p.z });
      p.meter = Math.min(PLAYER.maxMeter, p.meter + 8);
      this.addScore(30);
      return 'evade';
    }
    if (p.state === 'rush' || p.state === 'counter') return 'none';
    if (p.state === 'guard' && atk.icon !== 'red') {
      if (p.t <= PLAYER.perfect) {
        if (bullet) {
          bullet.reflected = true;
          const s = this.enemies.find((e) => e.id === bullet.from);
          const tx = s ? s.x - bullet.x : -bullet.vx, tz = s ? s.z - bullet.z : -bullet.vz;
          const l = Math.hypot(tx, tz) || 1;
          bullet.vx = (tx / l) * 32; bullet.vz = (tz / l) * 32; bullet.life = 2;
          this.ev({ type: 'deflect', x: bullet.x, y: 1.3, z: bullet.z });
          this.registerHit();
          this.addScore(120);
          p.meter = Math.min(PLAYER.maxMeter, p.meter + 10);
          return 'counter';
        }
        if (src) this.doCounter(p, src);
        return 'counter';
      }
      p.kx = dirx * 3;
      p.kz = dirz * 3;
      const d = dmg * 0.25;
      p.hp -= d;
      this.damageTaken += d;
      this.ev({ type: 'block', x: p.x, y: 1.2, z: p.z });
      if (p.hp <= 0) this.downPlayer();
      return 'block';
    }
    p.hp -= dmg;
    this.damageTaken += dmg;
    p.flash = 0.2;
    p.invuln = 0.3;
    this.combo = 0;
    this.comboT = 0;
    this.ev({ type: 'hit', target: 'player', id: 0, x: p.x, y: 1.2, z: p.z, dmg, heavy: !!atk.knock });
    if (p.hp <= 0) {
      this.downPlayer();
      return 'hit';
    }
    p.atk = null;
    p.queued = null;
    if (atk.knock || dmg >= 18) {
      p.state = 'down';
      p.t = 0;
      p.downT = 0.9;
      p.anim = 'down';
      p.dur = 0.9;
      p.kx = dirx * atk.kb;
      p.kz = dirz * atk.kb;
    } else {
      p.state = 'hit';
      p.t = 0;
      p.stun = 0.34;
      p.anim = 'hit';
      p.dur = 0.34;
      p.kx = dirx * atk.kb;
      p.kz = dirz * atk.kb;
    }
    return 'hit';
  }

  private downPlayer(): void {
    const p = this.player;
    p.hp = 0;
    p.alive = false;
    p.state = 'dead';
    p.anim = 'dead';
    p.t = 0;
    this.ko = true;
    this.ev({ type: 'playerDown' });
  }

  private doCounter(p: Player, e: Enemy): void {
    p.state = 'counter';
    p.t = 0;
    p.anim = 'counter';
    p.dur = PLAYER.counterTime;
    p.facing = Math.atan2(e.z - p.z, e.x - p.x);
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if (d > 1.3) { p.x += Math.cos(p.facing) * (d - 1.3); p.z += Math.sin(p.facing) * (d - 1.3); }
    this.ev({ type: 'counter', id: e.id, x: e.x, y: 1.2, z: e.z });
    this.registerHit();
    this.addScore(150);
    p.meter = Math.min(PLAYER.maxMeter, p.meter + 12);
    const killed = this.damageEnemy(e, 22, { kb: 4.5, knock: true, heavy: true, from: p, force: true });
    if (!killed && e.def.armored) {
      // big enemies are staggered rather than floored
      e.state = 'hit';
      e.t = 0;
      e.stun = 1.3;
      e.anim = 'hit';
      e.dur = 1.3;
    }
  }

  // ------------------------------------------------------------------ enemies

  private moveToward(e: Enemy, tx: number, tz: number, sp: number): void {
    const dx = tx - e.x, dz = tz - e.z;
    const l = Math.hypot(dx, dz) || 1;
    e.vx = (dx / l) * sp;
    e.vz = (dz / l) * sp;
  }

  private faceTowards(e: Enemy, ang: number, rate: number, dt: number): void {
    const d = angleDiff(ang, e.facing);
    e.facing += Math.max(-rate * dt, Math.min(rate * dt, d));
  }

  private updateEnemy(e: Enemy, dt: number): void {
    const p = this.player;
    e.t += dt;
    e.flash = Math.max(0, e.flash - dt);
    e.cd -= dt;
    e.vx = e.vz = 0;
    const toP = Math.atan2(p.z - e.z, p.x - e.x);
    const dist = Math.hypot(p.x - e.x, p.z - e.z);

    switch (e.state) {
      case 'enter': {
        e.enterT += dt;
        const side = Math.sign(e.x) || 1;
        e.anim = 'walk';
        e.vx = -side * e.def.speed * 1.2;
        e.vz = 0;
        e.facing = side > 0 ? Math.PI : 0;
        e.walk += e.def.speed * dt;
        if (Math.abs(e.x) < this.stage.w / 2 - 2.2 || e.enterT > 3) { e.state = 'idle'; e.t = 0; }
        break;
      }
      case 'idle':
      case 'move': {
        if (!p.alive) { e.anim = 'idle'; break; }
        this.faceTowards(e, toP, 9, dt);
        if (e.kind === 'gunman') { this.updateGunman(e, dt, dist, toP); break; }
        if (e.token && e.cd <= 0) {
          const atk = this.chooseAttack(e, dist);
          if (dist - p.radius <= atk.range * 0.88) { this.beginAttack(e, atk); break; }
          e.state = 'move';
          e.anim = 'run';
          this.moveToward(e, p.x, p.z, e.def.speed * 1.25);
          e.walk += e.def.speed * 1.25 * dt;
          break;
        }
        // hold the ring, strafing slowly
        const ring = e.def.ring + e.ringOff;
        if (dist < ring - 0.6) {
          e.state = 'move'; e.anim = 'back';
          this.moveToward(e, e.x - Math.cos(toP) * 3, e.z - Math.sin(toP) * 3, e.def.speed * 0.8);
          e.walk += e.def.speed * 0.8 * dt;
        } else if (dist > ring + 0.8) {
          e.state = 'move'; e.anim = 'walk';
          this.moveToward(e, p.x, p.z, e.def.speed);
          e.walk += e.def.speed * dt;
        } else {
          e.state = 'move'; e.anim = 'strafe';
          const px = -Math.sin(toP) * e.strafe, pz = Math.cos(toP) * e.strafe;
          e.vx = px * e.def.speed * 0.45;
          e.vz = pz * e.def.speed * 0.45;
          e.walk += e.def.speed * 0.45 * dt;
          if (this.rng.next() < dt * 0.25) e.strafe = -e.strafe;
        }
        break;
      }
      case 'wind': {
        const a = e.atk!;
        e.telegraph = Math.min(1, e.t / a.wind);
        if (e.t < a.wind * 0.65) this.faceTowards(e, toP, a.ranged ? 6 : 3.2, dt);
        if (a.ranged && e.t < a.wind * 0.8) { e.aimX = p.x; e.aimZ = p.z; }
        // lunge during the second half of the wind-up so the hit lands where the player stood
        if (a.lunge > 0 && e.t > a.wind * 0.6) {
          e.vx = Math.cos(e.facing) * e.lungeV;
          e.vz = Math.sin(e.facing) * e.lungeV;
        }
        if (e.t >= a.wind) {
          e.state = 'strike';
          e.t = 0;
          e.hitDone = false;
          e.telegraph = 0;
        }
        break;
      }
      case 'strike': {
        const a = e.atk!;
        if (a.lunge > 0) {
          e.vx = Math.cos(e.facing) * e.lungeV;
          e.vz = Math.sin(e.facing) * e.lungeV;
        }
        if (!e.hitDone && (e.t === dt || a.lunge >= 5 || e.t < dt * 1.5)) this.enemyStrike(e, a);
        if (e.t >= a.strike) { e.state = 'rec'; e.t = 0; }
        break;
      }
      case 'rec': {
        const a = e.atk!;
        if (e.t >= a.rec) {
          e.state = 'idle';
          e.t = 0;
          e.token = false;
          e.atk = null;
          e.cd = this.rng.range(e.def.cd[0], e.def.cd[1]);
          if (e.kind === 'boss' && this.rng.next() < 0.55) e.cd *= 0.4;
          e.anim = 'idle';
        }
        break;
      }
      case 'hit':
        if (e.t >= e.stun) { e.state = 'idle'; e.t = 0; e.anim = 'idle'; }
        break;
      case 'down':
        if (e.t >= e.downT) { e.state = 'getup'; e.t = 0; e.anim = 'getup'; e.dur = 0.6; }
        break;
      case 'getup':
        if (e.t >= 0.6) { e.state = 'idle'; e.t = 0; e.anim = 'idle'; e.cd = Math.max(e.cd, 0.6); }
        break;
      case 'thrown': {
        // flying body: hurts whoever it hits
        const sp = Math.hypot(e.kx, e.kz);
        for (const o of this.enemies) {
          if (o === e || o.state === 'dead' || o.state === 'thrown' || o.state === 'down') continue;
          if (Math.hypot(o.x - e.x, o.z - e.z) < e.radius + o.radius + 0.1) {
            this.ev({ type: 'bowl', x: o.x, z: o.z });
            this.damageEnemy(o, 14, { kb: 4, knock: true, heavy: true, from: e, force: true });
            this.addScore(60);
          }
        }
        if (e.t > 0.55 || sp < 3) { this.knockdown(e, e.kx / (sp || 1), e.kz / (sp || 1), 0.5); }
        break;
      }
      case 'grabbed':
        e.anim = 'grabbed';
        break;
      case 'dead':
        e.deadT += dt;
        break;
      default:
        break;
    }
  }

  private chooseAttack(e: Enemy, dist: number): AttackDef {
    const at = e.def.attacks;
    if (at.length === 1) return at[0];
    if (e.kind === 'brute') return this.rng.next() < 0.45 && dist < 3.4 ? at[1] : at[0];
    // boss: mix by distance
    if (dist > 5 && this.rng.next() < 0.6) return at[3];
    const r = this.rng.next();
    return r < 0.35 ? at[0] : r < 0.65 ? at[1] : at[2];
  }

  private beginAttack(e: Enemy, a: AttackDef): void {
    e.atk = a;
    e.state = 'wind';
    e.t = 0;
    e.hitDone = false;
    e.anim = a.anim;
    e.dur = a.wind + a.strike + a.rec;
    e.telegraph = 0;
    e.lungeV = a.lunge / (a.wind * 0.4 + a.strike);
    this.ev({ type: 'telegraph', id: e.id, icon: a.icon, x: e.x, z: e.z, n: a.wind });
  }

  private updateGunman(e: Enemy, dt: number, dist: number, toP: number): void {
    const p = this.player;
    let tooClose = dist < 5.2;
    e.anim = 'idle';
    if (tooClose) {
      e.state = 'move'; e.anim = 'back';
      this.moveToward(e, e.x - Math.cos(toP) * 4, e.z - Math.sin(toP) * 4, e.def.speed * 1.2);
      e.walk += e.def.speed * 1.2 * dt;
    } else if (dist > 13) {
      e.state = 'move'; e.anim = 'walk';
      this.moveToward(e, p.x, p.z, e.def.speed);
      e.walk += e.def.speed * dt;
    } else {
      e.state = 'idle';
    }
    // melee pistol-whip when cornered is skipped; instead panic-shoot faster
    if (e.cd <= 0 && this.gunCd <= 0 && dist < 18) {
      this.gunCd = 1.1;
      this.beginAttack(e, e.def.attacks[0]);
    }
    tooClose = false;
  }

  private enemyStrike(e: Enemy, a: AttackDef): void {
    const p = this.player;
    e.hitDone = true;
    if (a.ranged) {
      const dx = e.aimX - e.x, dz = e.aimZ - e.z;
      const l = Math.hypot(dx, dz) || 1;
      const sp = 26;
      this.bullets.push({ x: e.x + Math.cos(e.facing) * 0.7, z: e.z + Math.sin(e.facing) * 0.7, vx: (dx / l) * sp, vz: (dz / l) * sp, life: 1.6, dmg: a.dmg, from: e.id, reflected: false });
      this.ev({ type: 'shoot', x: e.x, y: 1.3, z: e.z });
      return;
    }
    const dx = p.x - e.x, dz = p.z - e.z;
    const d = Math.hypot(dx, dz);
    let inRange = false;
    if (a.aoe) inRange = d <= a.aoe + p.radius;
    else inRange = d - p.radius <= a.range && Math.abs(angleDiff(Math.atan2(dz, dx), e.facing)) <= a.arc;
    if (a.aoe) this.ev({ type: 'slam', x: e.x, z: e.z, n: a.aoe });
    if (!inRange) { if (a.lunge >= 5) e.hitDone = false; return; }
    const res = this.hurtPlayer(e, a, a.dmg, dx / (d || 1), dz / (d || 1));
    if (res === 'none' && a.lunge >= 5) e.hitDone = false;
  }

  // ------------------------------------------------------------------ bullets, pickups, collisions

  private updateBullets(dt: number): void {
    const p = this.player;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
      let dead = b.life <= 0;
      if (!dead) for (const pr of this.props) {
        if (pr.solid === false || pr.kind === 'bench' || pr.kind === 'bin' || pr.kind === 'barrel') continue;
        if (Math.abs(b.x - pr.x) < pr.hw && Math.abs(b.z - pr.z) < pr.hd) { dead = true; break; }
      }
      if (!dead && Math.abs(b.x) > this.stage.w / 2 + 12) dead = true;
      if (!dead && !b.reflected && p.alive && Math.hypot(b.x - p.x, b.z - p.z) < 0.6) {
        const l = Math.hypot(b.vx, b.vz) || 1;
        const r = this.hurtPlayer(null, { id: 'bullet', icon: 'yellow', wind: 0, strike: 0, rec: 0, dmg: b.dmg, range: 0, arc: 0, lunge: 0, kb: 2, anim: '' }, b.dmg, b.vx / l, b.vz / l, b);
        if (r !== 'evade' && r !== 'counter') dead = true;
      }
      if (!dead && b.reflected) {
        for (const e of this.enemies) {
          if (e.state === 'dead') continue;
          if (Math.hypot(b.x - e.x, b.z - e.z) < e.radius + 0.3) {
            this.damageEnemy(e, 34, { kb: 5, knock: true, heavy: true, force: true });
            dead = true;
            break;
          }
        }
      }
      if (dead) this.bullets.splice(i, 1);
    }
  }

  private updatePickups(dt: number): void {
    const p = this.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      k.t += dt;
      if (k.kind === 'health' && p.alive && Math.hypot(k.x - p.x, k.z - p.z) < 1.1) {
        p.hp = Math.min(p.maxHp, p.hp + 25);
        this.pickups.splice(i, 1);
        this.ev({ type: 'heal', x: k.x, z: k.z });
      }
    }
  }

  private collide(): void {
    const half = this.stage.w / 2, hd = this.stage.d / 2;
    const bodies: Fighter[] = [];
    const p = this.player;
    // integrate movement
    const all: Fighter[] = [p, ...this.enemies];
    for (const f of all) {
      f.x += (f.vx + f.kx) * this.lastDt;
      f.z += (f.vz + f.kz) * this.lastDt;
      const decay = Math.exp(-this.lastDt * (f.state === 'thrown' ? 1.2 : 7));
      f.kx *= decay; f.kz *= decay;
      if (Math.abs(f.kx) < 0.02) f.kx = 0;
      if (Math.abs(f.kz) < 0.02) f.kz = 0;
    }
    for (const f of all) {
      if (f.state === 'dead' || f.state === 'down' || f.state === 'thrown' || f.state === 'grabbed') continue;
      if (f === p && (p.state === 'dodge' || p.state === 'dead')) continue;
      bodies.push(f);
    }
    // fighters push each other apart
    for (let it = 0; it < 2; it++) {
      for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const ux = dx / d, uz = dz / d;
        const aFixed = a === p && (p.state === 'attack'), bFixed = b === p && p.state === 'attack';
        const wa = aFixed ? 0.3 : 1, wb = bFixed ? 0.3 : 1;
        a.x -= ux * push * wa; a.z -= uz * push * wa;
        b.x += ux * push * wb; b.z += uz * push * wb;
      }
    }
    // props and bounds
    for (const f of all) {
      if (f.state === 'dead' && f.t > 0) { /* bodies still obey props */ }
      for (const pr of this.props) {
        if (pr.solid === false) continue;
        const cx = Math.max(pr.x - pr.hw, Math.min(f.x, pr.x + pr.hw));
        const cz = Math.max(pr.z - pr.hd, Math.min(f.z, pr.z + pr.hd));
        const dx = f.x - cx, dz = f.z - cz;
        const d = Math.hypot(dx, dz);
        if (d < f.radius) {
          if (d > 1e-5) { f.x = cx + (dx / d) * f.radius; f.z = cz + (dz / d) * f.radius; }
          else {
            // centre inside the box: shove out along the shortest axis
            const ox = pr.hw - Math.abs(f.x - pr.x), oz = pr.hd - Math.abs(f.z - pr.z);
            if (ox < oz) f.x += (f.x >= pr.x ? 1 : -1) * (ox + f.radius); else f.z += (f.z >= pr.z ? 1 : -1) * (oz + f.radius);
          }
          if (f.state === 'thrown') {
            const e = f as Enemy;
            this.ev({ type: 'wallslam', x: e.x, z: e.z });
            this.damageEnemy(e, 12, { kb: 0, knock: false, heavy: true, quiet: true });
            e.kx = e.kz = 0;
          }
        }
      }
      const inField = f === p || (f as Enemy).state !== 'enter';
      if (inField) {
        const xl = half - 0.6, zl = hd - 0.6;
        if (f.x > xl) f.x = xl; else if (f.x < -xl) f.x = -xl;
        if (f.z > zl) f.z = zl; else if (f.z < -zl) f.z = -zl;
      }
    }
  }

  private lastDt = 1 / 60;
}
