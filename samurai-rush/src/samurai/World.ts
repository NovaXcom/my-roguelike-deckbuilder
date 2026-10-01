import { Rng } from '../game/Rng';
import { Atk, AIR_COMBO, COMBO, EDef, EKind, ENEMIES, P, SLASH, SlashDef } from './data';
import { computeMods, Mods, SCROLLS } from './perks';
import { ENDLESS, endlessWave, Encounter, SpawnSpec, StageDef } from './stages';

export type PState = 'free' | 'slash' | 'dash' | 'parry' | 'iai' | 'hurt' | 'dead';
export type EState = 'enter' | 'idle' | 'walk' | 'wind' | 'strike' | 'rec' | 'stun' | 'hurt' | 'launched' | 'frozen' | 'dead';

export interface Player {
  x: number; y: number; vx: number; vy: number;
  face: 1 | -1;
  hp: number; maxHp: number;
  state: PState; t: number;
  onGround: boolean;
  step: number; comboGap: number;
  slash: SlashDef | null; hitDone: boolean; queued: boolean;
  lungeV: number; hitAt: number;
  jumps: number; coyote: number;
  jumpBuf: number; slashBuf: number; dashBuf: number; parryBuf: number;
  pips: number; dashCd: number; parryCd: number; invuln: number; dashInv: number;
  dashFrom: number; dashTo: number; dashTime: number; dashCut: boolean;
  airDash: boolean; plunging: boolean;
  parryHold: boolean;
  walk: number;
  hurtT: number;
  flash: number;
}

export interface Enemy {
  id: number; kind: EKind; def: EDef;
  x: number; y: number; vx: number; vy: number; kx: number;
  face: 1 | -1;
  hp: number; maxHp: number;
  state: EState; t: number;
  atk: Atk | null; hitsDone: number;
  cd: number; token: boolean;
  posture: number; stunT: number; guarding: boolean; guardT: number; guardHits: number;
  marked: boolean; prevState: EState;
  juggle: number; telegraph: number;
  tele: number;
  walk: number;
  flash: number;
  summoned: number;
  deadT: number;
  /** For archers / ninjas: pre-aimed target. */
  aimX: number; aimY: number;
  strafe: number;
}

export interface Projectile {
  id: number;
  kind: 'arrow' | 'shuriken' | 'wave';
  owner: 'enemy' | 'player';
  x: number; y: number; vx: number; vy: number;
  dmg: number; life: number; from: number;
  pierce?: boolean;
}

export interface Pickup { kind: 'gourd'; x: number; t: number }

export interface WorldEvent {
  type: string;
  x?: number; y?: number; id?: number; kind?: string; angle?: number; n?: number; by?: string; face?: number; dmg?: number; w?: number; total?: number;
}

export interface Cmd {
  moveX: number; moveY: number;
  jump: boolean; jumpHeld: boolean;
  slash: boolean; parry: boolean; parryHeld: boolean; dash: boolean; iai: boolean;
}

export const emptyCmd = (): Cmd => ({ moveX: 0, moveY: 0, jump: false, jumpHeld: false, slash: false, parry: false, parryHeld: false, dash: false, iai: false });

export class World {
  p: Player;
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  pickups: Pickup[] = [];
  events: WorldEvent[] = [];
  rng: Rng;
  time = 0;
  score = 0;
  combo = 0;
  maxCombo = 0;
  comboT = 0;
  kills = 0;
  damageTaken = 0;
  /** Enemy time scale effects (just-dash, iai charge). */
  slowT = 0;
  lock: { min: number; max: number } | null = null;
  encIndex = 0;
  cleared = false;
  ko = false;
  scrolls: string[] = [];
  mods: Mods = computeMods([]);
  scrollChoices: string[] = [];
  endless: boolean;
  wavesCleared = 0;
  private nextId = 1;
  private projId = 1;
  private queue: { kind: EKind; side: -1 | 1 }[] = [];
  private queueT = 0;
  private waveIdx = -1;
  private waveGap = 0;
  private enc: Encounter | null = null;
  private patrolsDone = new Set<number>();
  private recentKills: number[] = [];
  private killsInWindow = 0;
  /** Gate that opens when the current encounter is over. */
  goHint = 0;

  constructor(readonly stage: StageDef, seed = 1, perks: string[] = []) {
    this.rng = new Rng(seed);
    this.endless = stage.id === ENDLESS.id;
    this.p = this.makePlayer();
    this.scrolls = [...perks];
    this.mods = computeMods(this.scrolls);
    this.p.pips = P.pipsMax + this.mods.pipsMax;
    if (this.endless) {
      this.lock = { min: -15, max: 15 };
      this.p.x = 0;
      this.waveGap = 1.5;
    }
  }

  get pipsMax(): number {
    return P.pipsMax + this.mods.pipsMax;
  }

  /** Reference score used for ranks (what a good run earns). */
  get parScore(): number {
    let s = 0;
    for (const pa of this.stage.patrols) s += ENEMIES[pa.kind].pts * (pa.n ?? 1);
    for (const e of this.stage.encounters) for (const w of e.waves) for (const g of w) s += ENEMIES[g.kind].pts * g.n;
    return Math.round(s * 1.5);
  }

  get bounds(): { min: number; max: number } {
    return this.lock ?? { min: 0, max: this.endless ? 9999 : this.stage.length };
  }

  private makePlayer(): Player {
    return {
      x: 2, y: 0, vx: 0, vy: 0, face: 1, hp: P.hp, maxHp: P.hp, state: 'free', t: 0, onGround: true,
      step: 0, comboGap: 9, slash: null, hitDone: false, queued: false, lungeV: 0, hitAt: 0, jumps: 0, coyote: 0,
      jumpBuf: 0, slashBuf: 0, dashBuf: 0, parryBuf: 0, pips: P.pipsMax, dashCd: 0, parryCd: 0, invuln: 0, dashInv: 0,
      dashFrom: 0, dashTo: 0, dashTime: P.dashTime, dashCut: false, airDash: false, plunging: false, parryHold: false,
      walk: 0, hurtT: 0, flash: 0,
    };
  }

  drain(): WorldEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private ev(e: WorldEvent): void {
    this.events.push(e);
  }

  get aliveCount(): number {
    let n = this.queue.length;
    for (const e of this.enemies) if (e.state !== 'dead') n++;
    return n;
  }

  // ------------------------------------------------------------------ main step

  update(dt: number, cmd: Cmd): void {
    this.time += dt;
    const es = this.slowT > 0 ? 0.22 : 1;
    this.slowT = Math.max(0, this.slowT - dt);
    this.updateEncounters(dt);
    this.updatePlayer(dt, cmd);
    for (const e of this.enemies) this.updateEnemy(e, dt * es);
    this.updateProjectiles(dt * es);
    this.updatePickups(dt);
    this.separate();
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;
    this.goHint = Math.max(0, this.goHint - dt);
    for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i].state === 'dead') this.enemies.splice(i, 1);
  }

  // ------------------------------------------------------------------ encounters

  private updateEncounters(dt: number): void {
    const p = this.p;
    if (this.cleared) return;
    // roadside enemies wake up as you approach
    if (!this.lock) {
      this.stage.patrols.forEach((pa, i) => {
        if (this.patrolsDone.has(i) || p.x < pa.x - 26) return;
        this.patrolsDone.add(i);
        for (let k = 0; k < (pa.n ?? 1); k++) this.spawn(pa.kind, pa.x + k * 1.6, 'idle');
      });
    }
    if (this.endless) return this.updateWaves(dt);
    if (!this.lock && this.encIndex < this.stage.encounters.length) {
      const enc = this.stage.encounters[this.encIndex];
      if (p.x >= enc.x) {
        this.enc = enc;
        this.lock = { min: enc.x - 14, max: enc.x + 14 };
        this.waveIdx = -1;
        this.waveGap = 0.8;
        this.ev({ type: 'lock', x: enc.x, n: enc.waves.length });
        if (enc.boss) this.ev({ type: 'boss' });
      }
    }
    if (this.lock) this.updateWaves(dt);
    if (!this.lock && this.encIndex >= this.stage.encounters.length && p.x >= this.stage.length - 2 && this.aliveCount === 0) {
      this.cleared = true;
      this.ev({ type: 'stageClear' });
    }
  }

  private updateWaves(dt: number): void {
    if (this.queue.length) {
      this.queueT -= dt;
      if (this.queueT <= 0) {
        const q = this.queue.shift()!;
        this.spawn(q.kind, q.side < 0 ? this.lock!.min - 1.5 : this.lock!.max + 1.5, 'enter');
        this.queueT = 0.45;
      }
      return;
    }
    if (this.aliveCount > 0) return;
    this.waveGap -= dt;
    if (this.waveGap > 0) return;
    const next = this.waveIdx + 1;
    let specs: SpawnSpec[] | null = null;
    if (this.endless) specs = endlessWave(next, () => this.rng.next());
    else if (this.enc && next < this.enc.waves.length) specs = this.enc.waves[next];
    if (specs) {
      this.waveIdx = next;
      let side: -1 | 1 = this.rng.next() < 0.5 ? -1 : 1;
      const list: { kind: EKind; side: -1 | 1 }[] = [];
      for (const g of specs) for (let i = 0; i < g.n; i++) { list.push({ kind: g.kind, side }); side = (side * -1) as -1 | 1; }
      list.sort((a, b) => ENEMIES[a.kind].pts - ENEMIES[b.kind].pts);
      this.queue = list;
      this.queueT = 0.1;
      this.waveGap = 1.1;
      if (next > 0) this.wavesCleared++;
      this.ev({ type: 'wave', n: next + 1, total: this.endless ? 0 : this.enc!.waves.length });
    } else if (!this.endless) {
      this.lock = null;
      this.enc = null;
      this.encIndex++;
      this.goHint = 4;
      this.p.hp = Math.min(this.p.maxHp, this.p.hp + 12);
      this.ev({ type: 'unlock' });
    }
  }

  spawn(kind: EKind, x: number, state: EState): Enemy {
    const def = ENEMIES[kind];
    const e: Enemy = {
      id: this.nextId++, kind, def, x, y: 0, vx: 0, vy: 0, kx: 0, face: -1, hp: def.hp, maxHp: def.hp, state, t: 0, atk: null, hitsDone: 0,
      cd: this.rng.range(0.5, 1.5), token: false, posture: 0, stunT: 0, guarding: false, guardT: 0, guardHits: 0, marked: false, prevState: 'idle',
      juggle: 0, telegraph: 0, tele: 0, walk: 0, flash: 0, summoned: 0, deadT: 0, aimX: 0, aimY: 0, strafe: this.rng.next() < 0.5 ? 1 : -1,
    };
    this.enemies.push(e);
    return e;
  }

  // ------------------------------------------------------------------ player

  private nearest(p: Player, maxDist: number, dir = 0): Enemy | null {
    let best: Enemy | null = null;
    let bs = Infinity;
    for (const e of this.enemies) {
      if (e.state === 'dead' || e.state === 'enter') continue;
      const dx = e.x - p.x;
      const d = Math.abs(dx);
      if (d > maxDist) continue;
      const behind = dir !== 0 && Math.sign(dx) !== dir;
      const s = d + (behind ? 3 : 0);
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }

  private updatePlayer(dt: number, cmd: Cmd): void {
    const p = this.p;
    p.t += dt;
    p.flash = Math.max(0, p.flash - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.dashInv = Math.max(0, p.dashInv - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.parryCd = Math.max(0, p.parryCd - dt);
    p.comboGap += dt;
    p.coyote = Math.max(0, p.coyote - dt);
    p.jumpBuf = Math.max(0, p.jumpBuf - dt);
    p.slashBuf = Math.max(0, p.slashBuf - dt);
    p.dashBuf = Math.max(0, p.dashBuf - dt);
    p.parryBuf = Math.max(0, p.parryBuf - dt);
    if (cmd.jump) p.jumpBuf = P.jumpBuf;
    if (cmd.slash) p.slashBuf = 0.16;
    if (cmd.dash) p.dashBuf = 0.12;
    if (cmd.parry) p.parryBuf = 0.12;
    if (p.state === 'dead') return;
    // slash gauge refills on its own
    if (p.pips < this.pipsMax) p.pips = Math.min(this.pipsMax, p.pips + P.pipRegen * this.mods.pipRegen * dt);

    const wasGround = p.onGround;
    p.onGround = p.y <= 0.001 && p.vy <= 0;
    if (p.onGround) { p.jumps = 0; p.airDash = false; p.coyote = P.coyote; }
    else if (wasGround && p.vy <= 0) p.coyote = P.coyote;

    const canChange = p.state === 'free' || (p.state === 'slash' && p.t >= this.slashActiveEnd(p)) || (p.state === 'parry' && p.t > P.parryPerfect + 0.06);

    // ---- actions ----
    if (p.state !== 'dash' && p.state !== 'iai' && p.state !== 'hurt') {
      if (p.dashBuf > 0 && p.dashCd <= 0 && (p.state === 'free' || p.state === 'slash' || p.state === 'parry')) { p.dashBuf = 0; this.startDash(p, cmd); }
      else if (cmd.iai && p.pips >= P.iaiCost && (p.state === 'free' || canChange)) this.startIai(p);
      else if (p.parryBuf > 0 && p.parryCd <= 0 && canChange && p.state !== 'parry') { p.parryBuf = 0; this.startParry(p); }
      else if (p.slashBuf > 0 && canChange) { p.slashBuf = 0; this.startSlash(p, cmd); }
      else if (p.jumpBuf > 0 && (p.state === 'free' || canChange) && (p.coyote > 0 || p.jumps < 2)) this.doJump(p);
    }

    switch (p.state) {
      case 'free': {
        const ax = cmd.moveX;
        const target = ax * P.runSpeed;
        const acc = (p.onGround ? (ax === 0 ? P.friction : P.accel) : P.airAccel) * dt;
        if (Math.abs(target - p.vx) <= acc) p.vx = target;
        else p.vx += Math.sign(target - p.vx) * acc;
        if (ax !== 0) p.face = ax > 0 ? 1 : -1;
        if (p.onGround) p.walk += Math.abs(p.vx) * dt;
        break;
      }
      case 'slash': {
        const d = p.slash!;
        const act = Math.max(d.wind + d.active, p.hitAt + 0.03);
        p.vx = p.t < Math.max(act, p.hitAt) ? p.face * p.lungeV : p.vx * Math.exp(-dt * 14);
        if (p.t >= p.hitAt && !p.hitDone) {
          p.hitDone = true;
          this.slashHit(p, d);
        }
        if (d.id === 'plunge') {
          if (p.onGround || p.y <= 0.001) this.landPlunge(p);
        } else if (p.t >= act + d.rec) {
          p.state = 'free';
          p.slash = null;
        }
        break;
      }
      case 'dash': {
        const k = Math.min(1, p.t / p.dashTime);
        const nx = p.dashFrom + (p.dashTo - p.dashFrom) * k;
        p.vx = (nx - p.x) / Math.max(dt, 1e-4);
        p.x = nx;
        p.vy = p.onGround ? 0 : 0;
        if (k >= 1) this.endDash(p);
        break;
      }
      case 'parry': {
        const window = P.parryPerfect + this.mods.parryWindow;
        p.vx *= Math.exp(-dt * 20);
        if (p.t >= P.parryTotal && !cmd.parryHeld) { p.state = 'free'; p.parryCd = p.t < window + 0.05 ? P.parryCd : 0.05; }
        if (p.t >= P.parryTotal + 2.5) { p.state = 'free'; }
        break;
      }
      case 'iai': {
        p.vx = 0;
        p.vy = 0;
        if (p.t >= P.iaiCharge && !p.hitDone) { p.hitDone = true; this.fireIai(p); }
        if (p.t >= P.iaiCharge + 0.4) p.state = 'free';
        break;
      }
      case 'hurt':
        p.vx *= Math.exp(-dt * 10);
        if (p.t >= p.hurtT) p.state = 'free';
        break;
      default:
        break;
    }

    // ---- vertical ----
    if (p.state === 'dash' || p.state === 'iai') { /* hover */ }
    else {
      let g = P.gravity;
      if (p.state === 'slash' && p.slash?.air && p.slash.id !== 'plunge') g *= 0.35;
      if (p.state === 'free' && !cmd.jumpHeld && p.vy > 5 && p.jumps > 0) g *= 2.3;
      p.vy -= g * dt;
      if (p.vy < -P.fallMax) p.vy = -P.fallMax;
      p.y += p.vy * dt;
      if (p.y <= 0) {
        p.y = 0;
        if (p.vy < -6) this.ev({ type: 'land', x: p.x, n: -p.vy });
        p.vy = 0;
      }
    }
    const b = this.bounds;
    if (p.state !== 'dash') {
      p.x += p.vx * dt;
      if (p.x < b.min + 0.5) { p.x = b.min + 0.5; p.vx = Math.max(0, p.vx); }
      if (p.x > b.max - 0.5) { p.x = b.max - 0.5; p.vx = Math.min(0, p.vx); }
    }
  }

  private slashActiveEnd(p: Player): number {
    const d = p.slash;
    return d ? Math.max(d.wind + d.active, p.hitAt + 0.03) + d.rec * 0.55 : 0;
  }

  private doJump(p: Player): void {
    if (p.state === 'slash') { p.state = 'free'; p.slash = null; }
    if (p.coyote > 0 && p.jumps === 0) {
      p.vy = P.jumpV;
      p.jumps = 1;
      p.coyote = 0;
      this.ev({ type: 'jump', x: p.x });
    } else if (p.jumps < 2) {
      p.vy = P.jump2V;
      p.jumps = 2;
      this.ev({ type: 'djump', x: p.x, y: p.y });
    } else return;
    p.jumpBuf = 0;
    p.onGround = false;
  }

  private startSlash(p: Player, cmd: Cmd): void {
    const air = p.y > 0.35;
    let id: string;
    if (air) {
      if (cmd.moveY < -0.5) id = 'plunge';
      else id = AIR_COMBO[p.step % AIR_COMBO.length];
    } else if (cmd.moveY > 0.5) id = 'up';
    else id = COMBO[p.comboGap < 0.55 ? p.step % COMBO.length : 0];
    let def = SLASH[id];
    if (this.mods.reach) def = { ...def, reach: def.reach + this.mods.reach };
    // soft aim: face the target and lunge into it
    const tgt = this.nearest(p, 6.5, cmd.moveX !== 0 ? Math.sign(cmd.moveX) : p.face);
    if (tgt && id !== 'plunge') p.face = tgt.x >= p.x ? 1 : -1;
    else if (cmd.moveX !== 0) p.face = cmd.moveX > 0 ? 1 : -1;
    const dist = tgt ? Math.max(0, Math.abs(tgt.x - p.x) - tgt.def.w - 0.9) : def.lunge * 0.4;
    const travel = Math.min(def.lunge * 1.6, dist);
    p.state = 'slash';
    p.slash = def;
    p.t = 0;
    p.hitDone = false;
    p.queued = false;
    const lungeTime = Math.max(def.wind + def.active, travel / 45);
    p.lungeV = travel / lungeTime;
    // long lunges connect when we have nearly arrived
    p.hitAt = travel > 1.4 ? Math.max(def.wind, Math.min(0.14, lungeTime * 0.85)) : def.wind;
    p.comboGap = 0;
    if (id === 'plunge') { p.vy = -34; p.plunging = true; }
    else if (def.air) { p.vy = Math.max(p.vy, 3.5); p.step = (p.step + 1) % AIR_COMBO.length; }
    else if (id !== 'up') p.step = (COMBO.indexOf(id) + 1) % COMBO.length;
    else p.step = 0;
    this.ev({ type: 'slash', x: p.x, y: p.y, angle: def.angle, face: p.face, id: undefined, kind: id, n: id === 's3' ? 3 : id === 's2' ? 2 : 1 });
  }

  private slashHit(p: Player, d: SlashDef): void {
    const x0 = p.x - p.face * 0.4, x1 = p.x + p.face * d.reach;
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    const yLo = p.y + d.yLo, yHi = p.y + d.yHi;
    let hits = 0;
    for (const e of this.enemies) {
      if (e.state === 'dead' || e.marked || e.state === 'enter' || e.state === 'frozen') continue;
      if (e.x + e.def.w < lo || e.x - e.def.w > hi) continue;
      if (e.y + e.def.h < yLo || e.y > yHi) continue;
      hits++;
      // a guarding swordsman blocks ordinary frontal cuts
      const front = Math.sign(p.x - e.x) === e.face;
      if (e.guarding && front && !d.heavy && e.state !== 'stun') {
        e.guardHits++;
        e.flash = 0.1;
        this.ev({ type: 'guard', x: e.x - e.face * 0.3, y: e.y + 1.2, face: p.face, id: e.id });
        e.kx += p.face * 1.5;
        p.vx -= p.face * 3;
        if (e.guardHits >= 3) { e.guardHits = 0; this.stun(e, 1.4); this.ev({ type: 'guardBreak', x: e.x, y: e.y + 1.2, id: e.id }); }
        continue;
      }
      this.damageEnemy(e, d.dmg * this.mods.dmg, { angle: d.angle, by: 'slash', knock: d.knock, launch: !!d.launch, heavy: !!d.heavy });
      if (d.air && d.id !== 'plunge') p.vy = Math.max(p.vy, 4);
    }
    // cut flying things out of the air
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const q = this.projectiles[i];
      if (q.owner !== 'enemy' || q.x < lo || q.x > hi || q.y < yLo || q.y > yHi) continue;
      this.projectiles.splice(i, 1);
      this.score += 40;
      p.pips = Math.min(this.pipsMax, p.pips + 0.12);
      this.ev({ type: 'projCut', x: q.x, y: q.y, kind: q.kind, angle: d.angle, face: p.face });
    }
    if (hits) p.vx += p.face * 0; // keep momentum
    if (d.id === 's3' && this.mods.waves) {
      this.projectiles.push({ id: this.projId++, kind: 'wave', owner: 'player', x: p.x + p.face * 1.2, y: p.y + 1.1, vx: p.face * 24, vy: 0, dmg: 22 * this.mods.dmg, life: 0.7, from: 0, pierce: true });
      this.ev({ type: 'waveShot', x: p.x, y: p.y + 1.1, face: p.face });
    }
  }

  private landPlunge(p: Player): void {
    p.plunging = false;
    p.state = 'free';
    p.slash = null;
    this.ev({ type: 'plunge', x: p.x });
    const d = SLASH.plunge;
    for (const e of this.enemies) {
      if (e.state === 'dead' || e.marked || e.state === 'enter') continue;
      if (Math.abs(e.x - p.x) < 3.6 + e.def.w) this.damageEnemy(e, d.dmg * this.mods.dmg, { angle: -80, by: 'plunge', knock: 8, launch: true, heavy: true });
    }
  }

  private startDash(p: Player, cmd: Cmd): void {
    const dir: 1 | -1 = cmd.moveX !== 0 ? (cmd.moveX > 0 ? 1 : -1) : p.face;
    const cut = p.pips >= 1;
    const dist = cut ? P.dashDist * this.mods.dashDist : P.shortDash;
    if (cut) p.pips -= 1;
    const b = this.bounds;
    p.face = dir;
    p.state = 'dash';
    p.t = 0;
    p.dashFrom = p.x;
    p.dashTo = Math.max(b.min + 0.5, Math.min(b.max - 0.5, p.x + dir * dist));
    p.dashTime = P.dashTime * Math.max(0.4, Math.abs(p.dashTo - p.dashFrom) / Math.max(1, dist));
    p.dashCut = cut;
    p.invuln = Math.max(p.invuln, P.dashInvuln);
    p.dashInv = P.dashInvuln;
    p.dashCd = cut ? P.dashCd : 0.5;
    p.slash = null;
    p.comboGap = 9;
    if (!p.onGround) p.airDash = true;
    this.ev({ type: 'dash', x: p.x, y: p.y, face: dir, n: cut ? 1 : 0 });
    if (cut) {
      const lo = Math.min(p.dashFrom, p.dashTo) - 0.5, hi = Math.max(p.dashFrom, p.dashTo) + 0.5;
      for (const e of this.enemies) {
        if (e.state === 'dead' || e.state === 'enter' || e.marked) continue;
        if (e.x < lo - e.def.w || e.x > hi + e.def.w) continue;
        if (Math.abs(e.y - p.y) > 2.3) continue;
        e.marked = true;
        e.prevState = e.state;
        e.state = 'frozen';
        e.token = false;
        e.atk = null;
        this.ev({ type: 'mark', x: e.x, y: e.y + e.def.h * 0.5, id: e.id });
      }
    }
  }

  private endDash(p: Player): void {
    p.state = 'free';
    p.x = p.dashTo;
    p.vx = p.face * 3;
    p.dashFrom = p.dashTo;
    const marked = this.enemies.filter((e) => e.marked && e.state !== 'dead');
    if (!marked.length) return;
    this.ev({ type: 'dashCut', n: marked.length, x: p.x, face: p.face });
    for (const e of marked) {
      e.marked = false;
      e.state = 'hurt';
      e.t = 0;
      const ang = (this.rng.next() - 0.5) * 24;
      this.damageEnemy(e, 72 * this.mods.dmg, { angle: ang, by: 'dash', knock: 4, launch: false, heavy: true, force: true });
      if ((e.state as EState) !== 'dead' && this.mods.echo) this.damageEnemy(e, 40 * this.mods.dmg, { angle: ang + 40, by: 'dash', knock: 2, launch: false, heavy: true, force: true });
    }
  }

  private startParry(p: Player): void {
    p.state = 'parry';
    p.t = 0;
    p.slash = null;
    p.comboGap = 9;
    this.ev({ type: 'parryStart', x: p.x, face: p.face });
  }

  private startIai(p: Player): void {
    p.pips -= P.iaiCost;
    p.state = 'iai';
    p.t = 0;
    p.hitDone = false;
    p.slash = null;
    p.invuln = P.iaiCharge + 0.5;
    this.slowT = P.iaiCharge + 0.1;
    const tgt = this.nearest(p, 14, p.face);
    if (tgt) p.face = tgt.x >= p.x ? 1 : -1;
    this.ev({ type: 'iaiStart', x: p.x, y: p.y, face: p.face });
  }

  private fireIai(p: Player): void {
    const reach = P.iaiReach;
    const lo = Math.min(p.x, p.x + p.face * reach) - 1, hi = Math.max(p.x, p.x + p.face * reach) + 1;
    const hit = this.enemies.filter((e) => e.state !== 'dead' && e.state !== 'enter' && e.x >= lo && e.x <= hi && Math.abs(e.y - p.y) < 3.6);
    this.ev({ type: 'iaiFire', x: p.x, y: p.y, face: p.face, n: hit.length });
    // the cut lands on everyone at the same instant
    for (const e of hit) {
      e.marked = false;
      this.damageEnemy(e, 95 * this.mods.dmg, { angle: (this.rng.next() - 0.5) * 16, by: 'iai', knock: 6, launch: false, heavy: true, force: true });
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const q = this.projectiles[i];
      if (q.owner === 'enemy' && q.x >= lo && q.x <= hi) this.projectiles.splice(i, 1);
    }
    p.x = Math.max(this.bounds.min + 0.5, Math.min(this.bounds.max - 0.5, p.x + p.face * 3.5));
  }

  // ------------------------------------------------------------------ damage

  private stun(e: Enemy, t: number): void {
    e.state = 'stun';
    e.t = 0;
    e.stunT = t;
    e.token = false;
    e.atk = null;
    e.guarding = false;
    this.ev({ type: 'stun', x: e.x, y: e.y + e.def.h, id: e.id });
  }

  damageEnemy(e: Enemy, dmg: number, o: { angle: number; by: string; knock: number; launch: boolean; heavy: boolean; force?: boolean }): boolean {
    if (e.state === 'dead') return false;
    const p = this.p;
    const open = e.state === 'stun';
    const boss = e.kind === 'shogun';
    if (open && !boss && !e.def.armored && o.by === 'slash') {
      dmg = 9999;
      this.ev({ type: 'execute', x: e.x, y: e.y + 1, id: e.id });
    } else if (open) dmg *= 2.5;
    e.hp -= dmg;
    e.flash = 0.12;
    p.pips = Math.min(this.pipsMax, p.pips + 0.05);
    if (e.hp <= 0) {
      this.die(e, o.angle, o.by, o.knock);
      return true;
    }
    e.posture += o.heavy ? 22 : 8;
    this.ev({ type: 'hit', x: e.x, y: e.y + e.def.h * 0.55, id: e.id, angle: o.angle, face: p.face, by: o.by, dmg, n: o.heavy ? 1 : 0 });
    if (e.posture >= 100 && !open && !e.def.armored) { e.posture = 0; this.stun(e, 1.6); }
    if (e.kind === 'shogun') this.shogunPhases(e);
    if (o.launch && !e.def.armored) {
      e.state = 'launched';
      e.t = 0;
      e.vy = 13;
      e.y = Math.max(e.y, 0.05);
      e.juggle = 0;
      e.token = false;
      e.atk = null;
      e.kx = p.face * o.knock * 0.4;
      this.ev({ type: 'launch', x: e.x, y: e.y, id: e.id });
    } else if (e.state === 'launched') {
      if (e.juggle < 8) { e.vy = Math.max(e.vy, 6.5); e.juggle++; }
      e.kx += p.face * o.knock * 0.2;
    } else if (!e.def.armored && !open) {
      e.state = 'hurt';
      e.t = 0;
      e.token = false;
      e.atk = null;
      e.kx += p.face * o.knock;
    } else {
      e.kx += p.face * o.knock * 0.1;
    }
    return false;
  }

  private shogunPhases(e: Enemy): void {
    const frac = e.hp / e.maxHp;
    if (frac < 0.6 && e.summoned === 0) { e.summoned = 1; this.reinforce(['ashigaru', 'ashigaru', 'swordsman']); }
    else if (frac < 0.3 && e.summoned === 1) { e.summoned = 2; this.reinforce(['ninja', 'ninja', 'swordsman']); }
  }

  private reinforce(kinds: EKind[]): void {
    kinds.forEach((k, i) => this.queue.push({ kind: k, side: i % 2 ? 1 : -1 }));
    this.queueT = 0.3;
    this.ev({ type: 'reinforce' });
  }

  private die(e: Enemy, angle: number, by: string, knock: number): void {
    e.state = 'dead';
    e.hp = 0;
    e.token = false;
    e.marked = false;
    const p = this.p;
    this.kills++;
    this.combo++;
    this.comboT = P.comboWindow;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const mult = 1 + Math.min(9, Math.floor(this.combo / 4)) * 0.25;
    this.score += Math.round(e.def.pts * mult);
    p.pips = Math.min(this.pipsMax, p.pips + 0.3);
    if (this.mods.vamp) p.hp = Math.min(p.maxHp, p.hp + this.mods.vamp);
    this.ev({ type: 'cut', x: e.x, y: e.y + e.def.h * 0.55, id: e.id, kind: e.kind, angle, face: p.face, by, n: this.combo, w: knock });
    // several kills in a blink make a multi-kill
    this.recentKills.push(this.time);
    this.recentKills = this.recentKills.filter((t) => this.time - t < 0.6);
    if (this.recentKills.length >= 3 && this.recentKills.length > this.killsInWindow) {
      this.killsInWindow = this.recentKills.length;
      this.score += 100 * this.recentKills.length;
      this.ev({ type: 'multikill', n: this.recentKills.length });
    }
    if (this.recentKills.length < 3) this.killsInWindow = 0;
    if (this.rng.next() < 0.1) this.pickups.push({ kind: 'gourd', x: e.x, t: 0 });
  }

  // ------------------------------------------------------------------ hurting the player

  /** Resolve an enemy attack landing. Returns what happened. */
  private hurtPlayer(src: Enemy | null, a: { icon: string; dmg: number }, dirx: number, proj?: Projectile): 'hit' | 'parry' | 'block' | 'dodge' | 'none' {
    const p = this.p;
    if (p.state === 'dead') return 'none';
    if (p.dashInv > 0 || p.state === 'dash' || p.state === 'iai') {
      if (p.dashInv > 0.05 || p.state === 'dash') {
        if (this.slowT < 0.6) {
          this.slowT = 1.3;
          p.pips = Math.min(this.pipsMax, p.pips + 1);
          this.score += 120;
          this.ev({ type: 'justDash', x: p.x, y: p.y });
        }
      }
      return 'dodge';
    }
    if (p.invuln > 0) return 'none';
    const dmg = a.dmg * (1 - this.mods.armor);
    if (p.state === 'parry' && a.icon !== 'red') {
      const window = P.parryPerfect + this.mods.parryWindow;
      if (p.t <= window) {
        // perfect parry
        p.parryCd = 0;
        p.pips = Math.min(this.pipsMax, p.pips + 0.7);
        this.ev({ type: 'parry', x: p.x + p.face * 0.8, y: p.y + 1.2, face: p.face, id: src?.id });
        this.score += 150;
        if (proj) {
          proj.owner = 'player';
          proj.vx = -proj.vx * 1.5;
          proj.vy = 0;
          proj.dmg = 80;
          proj.life = 2;
          this.ev({ type: 'reflect', x: proj.x, y: proj.y });
        }
        if (src) {
          if (src.kind === 'shogun' || src.def.armored) {
            src.posture += 36;
            this.stun(src, 0.9);
            if (src.posture >= 100) { src.posture = 0; this.stun(src, 2.2); this.ev({ type: 'postureBreak', x: src.x, y: src.y + src.def.h, id: src.id }); }
          } else this.stun(src, 1.5);
        }
        if (this.mods.thunder) this.thunder();
        return 'parry';
      }
      p.hp -= dmg * 0.25;
      this.damageTaken += dmg * 0.25;
      p.vx -= dirx * 4;
      this.ev({ type: 'block', x: p.x + p.face * 0.8, y: p.y + 1.2, face: p.face });
      if (p.hp <= 0) this.kill();
      return 'block';
    }
    p.hp -= dmg;
    this.damageTaken += dmg;
    p.flash = 0.2;
    p.invuln = P.hurtInv;
    this.combo = 0;
    this.comboT = 0;
    this.ev({ type: 'hurt', x: p.x, y: p.y + 1.2, dmg, face: dirx > 0 ? 1 : -1 });
    if (p.hp <= 0) { this.kill(); return 'hit'; }
    p.state = 'hurt';
    p.t = 0;
    p.hurtT = 0.26;
    p.slash = null;
    p.vx = dirx * 7;
    if (p.onGround) p.vy = 5;
    return 'hit';
  }

  private thunder(): void {
    for (const e of this.enemies) {
      if (e.state === 'dead' || e.state === 'enter' || Math.abs(e.x - this.p.x) > 16) continue;
      this.ev({ type: 'bolt', x: e.x, y: e.y });
      this.damageEnemy(e, 34 * this.mods.dmg, { angle: 90, by: 'thunder', knock: 3, launch: false, heavy: true, force: true });
    }
  }

  private kill(): void {
    const p = this.p;
    p.hp = 0;
    p.state = 'dead';
    p.t = 0;
    this.ko = true;
    this.ev({ type: 'playerDown', x: p.x });
  }

  /** After a KO: restore health, clear the field and restart the current fight. */
  retryEncounter(): void {
    const p = this.p;
    const keep = { pips: this.pipsMax };
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.queue = [];
    Object.assign(p, this.makePlayer(), { x: this.lock ? this.lock.min + 4 : Math.max(2, p.x - 6), pips: keep.pips });
    p.maxHp = P.hp;
    p.hp = P.hp;
    this.ko = false;
    this.combo = 0;
    if (this.lock) { this.waveIdx = Math.max(-1, this.waveIdx - 1); this.waveGap = 1; }
    this.score = Math.max(0, this.score - 250);
  }

  // ------------------------------------------------------------------ enemies

  private meleeTokens(): number {
    let n = 0;
    for (const e of this.enemies) if (e.token && e.state !== 'dead') n++;
    return n;
  }

  private chooseAtk(e: Enemy, dist: number): Atk {
    const a = e.def.atks;
    if (a.length === 1) return a[0];
    if (e.kind === 'oni') return this.rng.next() < 0.4 && dist < 4.5 ? a[1] : a[0];
    if (e.kind === 'ninja') return this.rng.next() < 0.5 ? a[0] : a[1];
    // shogun
    if (dist > 5.5 && this.rng.next() < 0.7) return a[1];
    const r = this.rng.next();
    return r < 0.45 ? a[0] : r < 0.75 ? a[2] : a[1];
  }

  private begin(e: Enemy, a: Atk): void {
    e.atk = a;
    e.state = 'wind';
    e.t = 0;
    e.hitsDone = 0;
    e.tele = a.wind;
    e.guarding = false;
    const p = this.p;
    e.aimX = p.x;
    e.aimY = p.y + 1.1;
    this.ev({ type: 'telegraph', id: e.id, x: e.x, y: e.y, kind: a.icon, n: a.wind });
  }

  private updateEnemy(e: Enemy, dt: number): void {
    const p = this.p;
    e.t += dt;
    e.flash = Math.max(0, e.flash - dt);
    e.cd -= dt;
    e.guardT = Math.max(0, e.guardT - dt);
    e.vx = 0;
    const dx = p.x - e.x;
    const dist = Math.abs(dx);
    const toward: 1 | -1 = dx >= 0 ? 1 : -1;
    const sp = e.def.speed;
    const b = this.bounds;

    // gravity for anything airborne
    if (e.y > 0 || e.vy > 0) {
      e.vy -= P.gravity * 0.85 * dt;
      e.y += e.vy * dt;
      if (e.y <= 0 && e.vy < 0) {
        e.y = 0;
        e.vy = 0;
        if (e.state === 'launched') {
          this.ev({ type: 'enemyLand', x: e.x, id: e.id });
          e.hp -= 8;
          if (e.hp <= 0) { this.die(e, 0, 'fall', 2); return; }
          e.state = 'stun';
          e.stunT = 0.9;
          e.t = 0;
        }
      }
    }
    e.x += e.kx * dt;
    e.kx *= Math.exp(-dt * 8);

    switch (e.state) {
      case 'enter': {
        const dir = e.x < (b.min + b.max) / 2 ? 1 : -1;
        e.face = dir;
        e.vx = dir * sp * 1.5;
        e.walk += sp * dt;
        if (e.x > b.min + 1.5 && e.x < b.max - 1.5) { e.state = 'idle'; e.t = 0; }
        break;
      }
      case 'idle':
      case 'walk': {
        if (p.state === 'dead') break;
        e.face = toward;
        this.aiMove(e, dt, dist, toward, sp);
        break;
      }
      case 'wind': {
        const a = e.atk!;
        e.telegraph = Math.min(1, e.t / a.wind);
        if (e.t < a.wind * 0.6 && !a.proj) e.face = toward;
        if (a.proj && e.t < a.wind * 0.8) { e.aimX = p.x; e.aimY = p.y + 1.0; e.face = toward; }
        if (a.lunge > 0 && e.t > a.wind * 0.55) e.vx = e.face * (a.lunge / (a.wind * 0.45 + a.strike));
        if (e.t >= a.wind) { e.state = 'strike'; e.t = 0; e.hitsDone = 0; this.strikeHit(e, a); e.hitsDone = 1; }
        break;
      }
      case 'strike': {
        const a = e.atk!;
        const n = a.hits ?? 1;
        if (a.lunge > 0 && e.hitsDone <= 1) e.vx = e.face * (a.lunge / (a.wind * 0.45 + a.strike)) * 0.6;
        if (e.hitsDone < n && e.t >= e.hitsDone * 0.26) { this.strikeHit(e, a); e.hitsDone++; }
        if (e.t >= a.strike + (n - 1) * 0.26) { e.state = 'rec'; e.t = 0; }
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
          if (e.def.guard) e.guardT = 0.9;
        }
        break;
      }
      case 'stun':
        e.face = toward;
        if (e.t >= e.stunT) { e.state = 'idle'; e.t = 0; e.cd = Math.max(e.cd, 0.4); }
        break;
      case 'hurt':
        if (e.t >= 0.22) { e.state = 'idle'; e.t = 0; e.cd = Math.max(e.cd, 0.35); }
        break;
      case 'launched':
        // airborne: nothing to decide
        break;
      case 'frozen':
        break;
      default:
        break;
    }
    e.x += e.vx * dt;
    if (e.state !== 'enter') e.x = Math.max(b.min + 0.6, Math.min(b.max - 0.6, e.x));
  }

  private aiMove(e: Enemy, dt: number, dist: number, toward: 1 | -1, sp: number): void {
    const p = this.p;
    const d = e.def;
    e.guarding = d.guard && e.guardT > 0;
    const ready = e.cd <= 0;

    if (e.kind === 'archer') {
      if (dist < d.ring[0] - 2) { e.vx = -toward * sp * 1.3; e.walk += sp * dt; e.state = 'walk'; }
      else if (dist > d.ring[1]) { e.vx = toward * sp; e.walk += sp * dt; e.state = 'walk'; }
      else e.state = 'idle';
      if (ready && dist < 22 && this.shooters() < 2) this.begin(e, d.atks[0]);
      return;
    }
    if (e.kind === 'ninja') {
      // hit-and-run: pop up on the far side of the player, strike, repeat
      if (ready && !e.token && this.meleeTokens() < 3) {
        const a = this.chooseAtk(e, dist);
        if (a.proj) {
          if (this.shooters() < 2) this.begin(e, a);
        } else {
          const side: 1 | -1 = toward === 1 ? -1 : 1;
          e.x = p.x + side * 3.4;
          e.face = (side * -1) as 1 | -1;
          this.ev({ type: 'poof', x: e.x, y: 0 });
          e.token = true;
          this.begin(e, a);
        }
        return;
      }
      if (dist < d.ring[0]) { e.vx = -toward * sp; e.state = 'walk'; }
      else if (dist > d.ring[1]) { e.vx = toward * sp; e.state = 'walk'; }
      else { e.vx = e.strafe * sp * 0.4; e.state = 'walk'; if (this.rng.next() < dt * 0.4) e.strafe *= -1; }
      e.walk += sp * dt;
      return;
    }
    // melee
    if (e.token && ready) {
      const a = this.chooseAtk(e, dist);
      const reach = a.aoe ? a.aoe * 0.7 : a.reach;
      if (dist <= reach * 0.82 + p.x * 0) { this.begin(e, a); return; }
      e.vx = toward * sp * 1.25;
      e.state = 'walk';
      e.walk += sp * 1.25 * dt;
      return;
    }
    if (!e.token && ready && this.meleeTokens() < (this.lock ? 2 : 3) && dist < 14) e.token = true;
    // hold the preferred distance, shuffling a little
    if (dist < d.ring[0] - 0.4) { e.vx = -toward * sp * 0.8; e.state = 'walk'; e.walk += sp * 0.8 * dt; }
    else if (dist > d.ring[1]) { e.vx = toward * sp; e.state = 'walk'; e.walk += sp * dt; }
    else { e.state = 'idle'; e.vx = e.strafe * sp * 0.25; e.walk += sp * 0.25 * dt; if (this.rng.next() < dt * 0.5) e.strafe *= -1; }
  }

  private shooters(): number {
    let n = 0;
    for (const e of this.enemies) if (e.state === 'wind' && e.atk?.proj) n++;
    return n;
  }

  private strikeHit(e: Enemy, a: Atk): void {
    const p = this.p;
    if (a.proj) {
      const dx = e.aimX - e.x, dy = e.aimY - (e.y + 1.3);
      const l = Math.hypot(dx, dy) || 1;
      const spd = a.proj === 'arrow' ? 26 : 20;
      const shots = a.proj === 'shuriken' ? 3 : 1;
      for (let i = 0; i < shots; i++) {
        const spread = (i - (shots - 1) / 2) * 0.16;
        const ang = Math.atan2(dy, dx) + spread;
        this.projectiles.push({ id: this.projId++, kind: a.proj, owner: 'enemy', x: e.x + e.face * 0.6, y: e.y + 1.3, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, dmg: a.dmg, life: 2.2, from: e.id });
      }
      this.ev({ type: a.proj === 'arrow' ? 'arrowShot' : 'starShot', x: e.x, y: e.y + 1.3, id: e.id, face: e.face });
      void l;
      return;
    }
    const dx = p.x - e.x;
    let inRange: boolean;
    if (a.aoe) {
      this.ev({ type: 'stompWave', x: e.x, n: a.aoe });
      inRange = Math.abs(dx) <= a.aoe && p.y < 0.9;
    } else {
      const ahead = Math.sign(dx) === e.face || Math.abs(dx) < 0.6;
      inRange = ahead && Math.abs(dx) <= a.reach + P.half && p.y < e.y + e.def.h && p.y + P.height > e.y;
    }
    if (!inRange) return;
    this.hurtPlayer(e, a, Math.sign(dx) || 1);
  }

  // ------------------------------------------------------------------ projectiles, pickups, spacing

  private updateProjectiles(dt: number): void {
    const p = this.p;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const q = this.projectiles[i];
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.life -= dt;
      let dead = q.life <= 0 || q.y < -0.2;
      if (!dead && q.owner === 'enemy' && p.state !== 'dead') {
        if (Math.abs(q.x - p.x) < P.half + 0.3 && q.y > p.y - 0.1 && q.y < p.y + P.height + 0.2) {
          const r = this.hurtPlayer(null, { icon: 'shot', dmg: q.dmg }, Math.sign(q.vx) || 1, q);
          if (r !== 'dodge' && r !== 'parry') dead = true;
        }
      } else if (!dead && q.owner === 'player') {
        for (const e of this.enemies) {
          if (e.state === 'dead' || e.state === 'enter') continue;
          if (Math.abs(q.x - e.x) < e.def.w + 0.3 && q.y > e.y && q.y < e.y + e.def.h) {
            this.damageEnemy(e, q.dmg, { angle: q.kind === 'wave' ? 0 : 6, by: q.kind === 'wave' ? 'wave' : 'reflect', knock: 5, launch: false, heavy: true, force: true });
            if (!q.pierce) { dead = true; break; }
          }
        }
      }
      if (dead) this.projectiles.splice(i, 1);
    }
  }

  private updatePickups(dt: number): void {
    const p = this.p;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      k.t += dt;
      if (Math.abs(k.x - p.x) < 1.1 && p.y < 1.5) {
        p.hp = Math.min(p.maxHp, p.hp + 24);
        this.pickups.splice(i, 1);
        this.ev({ type: 'heal', x: k.x });
      }
    }
  }

  private separate(): void {
    const list = this.enemies.filter((e) => e.state !== 'dead' && e.state !== 'frozen' && e.state !== 'launched' && e.y < 0.2);
    list.sort((a, b) => a.x - b.x);
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i], b = list[i + 1];
      const min = (a.def.w + b.def.w) * 1.05;
      const d = b.x - a.x;
      if (d < min) {
        const push = (min - d) / 2;
        a.x -= push;
        b.x += push;
      }
    }
  }

  // ------------------------------------------------------------------ scrolls

  /** Three scrolls to choose from after clearing a stage. */
  offerScrolls(): string[] {
    const pool = SCROLLS.filter((s) => !this.scrolls.includes(s.id));
    const picks: string[] = [];
    while (picks.length < Math.min(3, pool.length)) {
      const c = this.rng.pick(pool).id;
      if (!picks.includes(c)) picks.push(c);
    }
    this.scrollChoices = picks;
    return picks;
  }
}
