import { audio } from '../audio/AudioSystem';
import { HitStop } from '../combat/HitStop';
import { SlowMo } from '../combat/SlowMo';
import { generateLevel, Level } from '../level/Generator';
import { Controller, MoveInput } from '../physics/Controller';
import { Crumbler } from '../physics/Crumbler';
import { THEMES } from './Theme';
import { MOVE } from '../physics/config';
import { AutoPilot } from './AutoPilot';
import { Combat, COMBAT } from './Combat';
import { Hud } from './Hud';
import { Input, Intent } from './Input';
import { applyResult, dailySeed, formatTime, loadSave, SaveData, storeSave, STAGES } from './Progress';
import { SceneView } from './SceneView';

type Mode = 'title' | 'play' | 'pause' | 'results';

const STEP = 1 / 120;
export const STAGE_NAMES = THEMES.map((t) => t.name);

export interface RunInfo {
  key: string;
  stage: number;
  seed: number;
  daily: boolean;
  name: string;
}

export class Game {
  readonly view: SceneView;
  readonly input: Input;
  readonly hud: Hud;
  save: SaveData;
  mode: Mode = 'title';

  level!: Level;
  ctrl!: Controller;
  combat!: Combat;
  run!: RunInfo;

  yaw = 0;
  pitch = -0.12;
  time = 0;
  deaths = 0;
  kills = 0;
  cpIndex = 0;
  hearts = 1;
  maxHearts = 1;
  dead = false;
  deadTimer = 0;
  invuln = 0;
  lungeLeft = 0;
  focus = 1;
  stars = COMBAT.maxStars;
  crumbler = new Crumbler();
  focusing = false;
  finished = false;
  combatDeflectCd(): number {
    return this.combat.deflectCooldownLeft;
  }
  private clock = 0;
  private acc = 0;
  private hitStop = new HitStop();
  private slow = new SlowMo();
  private pendingJump = false;
  private pendingDash = false;
  private fxTimer = 0;
  private trailTimer = 0;
  private last = performance.now();
  private pilot: AutoPilot | null = null;
  private demoLevelSeed = 3;
  private frameTimes: number[] = [];
  private qualityDone = false;
  private wasLocked = false;
  private autoPlay = false;
  private sinceFinish = 0;
  readonly debug: boolean;

  constructor(root: HTMLElement) {
    const q = new URLSearchParams(location.search);
    this.debug = q.has('debug');
    this.autoPlay = q.has('auto');
    this.save = loadSave();
    this.view = new SceneView(root);
    this.input = new Input(this.view.renderer.domElement);
    this.input.sens = this.save.sens;
    audio.volume(this.save.volume);
    this.hud = new Hud(root, this);
    if (q.has('hifx')) this.qualityDone = true;
    window.addEventListener('pointerdown', () => audio.unlock());
    this.view.renderer.domElement.addEventListener('click', () => {
      if (this.mode === 'play' && !this.input.locked) this.input.requestLock();
    });
    this.startDemo();
    if (this.debug) (window as unknown as { __g: Game }).__g = this;
    const stage = Number(q.get('stage'));
    if (stage >= 1 && stage <= STAGES) {
      this.save.unlocked = STAGES;
      this.startStage(stage);
    }
    requestAnimationFrame(() => this.frame());
  }

  // ---- run setup --------------------------------------------------------------------

  private setupLevel(level: Level, enemies = true): void {
    this.level = level;
    this.ctrl = new Controller(level.boxes);
    this.ctrl.reset(level.start.x, level.start.y + 0.001, level.start.z, 0);
    this.combat = new Combat(level.boxes, enemies ? level.enemies : []);
    this.combat.checkpoint();
    this.crumbler = new Crumbler();
    this.stars = COMBAT.maxStars;
    this.view.buildLevel(level);
    this.view.buildEnemies(this.combat);
    this.view.snapCamera();
    this.view.resetScarf(this.ctrl);
    this.view.particles.clear();
    this.view.fx.clear();
    this.acc = 0;
    this.pendingJump = this.pendingDash = false;
  }

  private startDemo(): void {
    this.mode = 'title';
    this.setupLevel(generateLevel(this.demoLevelSeed, { stage: 2, enemies: false, modules: 10 }), false);
    this.pilot = new AutoPilot(this.level.route);
    this.yaw = 0;
    this.pitch = -0.14;
    this.hud.showTitle();
    this.input.releaseLock();
  }

  startStage(stage: number): void {
    this.beginRun({ key: `s${stage}`, stage, seed: 100 + stage, daily: false, name: `${stage}. ${STAGE_NAMES[stage - 1]}` });
  }

  startDaily(): void {
    this.beginRun({ key: `daily-${dailySeed()}`, stage: 0, seed: dailySeed(), daily: true, name: 'DAILY RUN' });
  }

  retry(): void {
    this.beginRun(this.run);
  }

  private beginRun(run: RunInfo): void {
    audio.unlock();
    this.run = run;
    const stage = run.daily ? 4 : run.stage;
    this.setupLevel(generateLevel(run.seed, { stage, modules: run.daily ? 14 : undefined }), true);
    this.pilot = this.autoPlay ? new AutoPilot(this.level.route) : null;
    this.time = 0;
    this.deaths = 0;
    this.kills = 0;
    this.cpIndex = 0;
    this.dead = false;
    this.finished = false;
    this.invuln = 0.4;
    this.lungeLeft = 0;
    this.focus = 1;
    this.maxHearts = this.save.assist ? 3 : 1;
    this.hearts = this.maxHearts;
    this.yaw = 0;
    this.pitch = -0.1;
    this.mode = 'play';
    this.hud.showPlay(run.name);
    this.input.requestLock();
    this.view.setQuality(this.qualityDone && this.view.bloomOn ? 'high' : this.view.bloomOn ? 'high' : 'low');
    this.hud.toast(run.name, 1.6);
  }

  toMenu(): void {
    this.startDemo();
  }

  pause(): void {
    if (this.mode !== 'play') return;
    this.mode = 'pause';
    this.hud.showPause();
    this.input.releaseLock();
  }

  resume(): void {
    if (this.mode !== 'pause') return;
    this.mode = 'play';
    this.hud.showPlay(this.run.name);
    this.input.requestLock();
    this.last = performance.now();
  }

  setAssist(on: boolean): void {
    this.save.assist = on;
    storeSave(this.save);
  }

  setSens(v: number): void {
    this.save.sens = v;
    this.input.sens = v;
    storeSave(this.save);
  }

  setVolume(v: number): void {
    this.save.volume = v;
    audio.volume(v);
    storeSave(this.save);
  }

  // ---- main loop -------------------------------------------------------------------------

  private frame(): void {
    const now = performance.now();
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.clock += dt;
    this.trackQuality(dt);
    const intent = this.input.poll(dt);
    // pointer lock lost (user hit Esc) -> pause
    if (this.wasLocked && !this.input.locked && this.mode === 'play') this.pause();
    this.wasLocked = this.input.locked;

    if (this.mode === 'title') this.updateDemo(dt);
    else if (this.mode === 'play') {
      if (intent.pausePressed) this.pause();
      else this.updatePlay(dt, intent);
    } else if (this.mode === 'pause') {
      if (intent.pausePressed) this.resume();
      this.view.render(0);
      this.hud.update(this, dt);
      requestAnimationFrame(() => this.frame());
      return;
    } else if (this.mode === 'results') {
      this.sinceFinish += dt;
      this.view.fx.update(0);
      this.updateWorldVisuals(dt * 0.3);
    }
    this.view.render(dt);
    this.hud.update(this, dt);
    requestAnimationFrame(() => this.frame());
  }

  private trackQuality(dt: number): void {
    if (this.qualityDone) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length >= 120) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this.frameTimes.length = 0;
      if (avg > 0.034 && this.view.bloomOn) {
        this.view.setQuality('low');
        this.qualityDone = true;
      } else if (avg < 0.02) this.qualityDone = true;
    }
  }

  private updateDemo(dt: number): void {
    const c = this.ctrl;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 16) {
      this.acc -= STEP;
      steps++;
      const inp = this.pilot!.input(c);
      const ev = c.step(STEP, inp);
      this.crumbler.update(STEP, c.groundBox);
      if (ev.fell || ev.hitHazard || (Math.abs(c.x - this.level.finish.x) < 1.5 && c.onGround)) {
        this.demoLevelSeed = (this.demoLevelSeed % 40) + 1;
        this.setupLevel(generateLevel(this.demoLevelSeed, { stage: 2, enemies: false, modules: 10 }), false);
        this.pilot = new AutoPilot(this.level.route);
        return;
      }
    }
    this.yaw = Math.sin(this.clock * 0.25) * 0.35;
    this.pitch = -0.16;
    this.view.syncPlayer(c, { slash: 0, deflect: 0, lunging: false, time: this.clock, invuln: false, hidden: false }, dt);
    this.view.updateCamera(c, this.yaw, this.pitch, dt, this.level.boxes);
    this.view.syncEnemies(this.combat, c.x, c.y, c.z, this.clock);
    this.view.syncProjectiles(this.combat, this.clock);
    this.view.syncDynamic(this.crumbler, dt);
    this.emitMoveFx(c, dt);
  }

  private updateWorldVisuals(dt: number): void {
    const c = this.ctrl;
    this.view.syncPlayer(c, { slash: 0, deflect: 0, lunging: false, time: this.clock, invuln: false, hidden: this.dead }, dt);
    this.view.updateCamera(c, this.yaw + dt * 0.5, this.pitch, dt, this.level.boxes);
  }

  private updatePlay(realDt: number, intent: Intent): void {
    const c = this.ctrl;
    const nowMs = performance.now();

    // ---- look ---------------------------------------------------------------------
    this.yaw += intent.lookYaw;
    this.pitch = Math.max(-1.2, Math.min(0.9, this.pitch + intent.lookPitch));

    if (intent.respawnPressed && !this.dead) this.die('reset');

    // ---- time scale: focus, kill slow-mo, hit stop --------------------------------------
    this.focusing = intent.focusHeld && this.focus > 0.02 && !this.dead;
    let scale = this.slow.scale(nowMs);
    if (this.focusing) {
      scale = Math.min(scale, 0.3);
      this.focus = Math.max(0, this.focus - realDt * 0.28 / Math.max(0.3, 1));
    } else this.focus = Math.min(1, this.focus + realDt * 0.03);
    const frozen = this.hitStop.active(nowMs);
    const dt = frozen ? 0 : realDt * scale;
    if (!this.finished) this.time += realDt;
    this.invuln = Math.max(0, this.invuln - realDt);

    if (this.dead) {
      this.deadTimer -= realDt;
      if (this.deadTimer <= 0) this.respawn();
    }

    // ---- actions (once per frame) ------------------------------------------------------------
    if (intent.jumpPressed) this.pendingJump = true;
    if (intent.dashPressed) this.pendingDash = true;
    if (!this.dead && !this.finished) {
      if (intent.attackPressed) this.doAttack(intent);
      if (intent.starPressed && this.stars > 0) {
        this.stars--;
        const cp = Math.cos(this.pitch);
        const body0 = { x: c.x, y: c.y, z: c.z, vx: 0, vz: 0, height: c.height };
        this.combat.throwStar(body0, cp * Math.cos(this.yaw), Math.sin(this.pitch) + 0.04, cp * Math.sin(this.yaw));
        audio.play('swing', 1.9);
      }
      if (intent.deflectPressed && this.combat.startDeflect()) {
        audio.play('swing', 1.5);
        const fx = Math.cos(this.yaw), fz = Math.sin(this.yaw);
        this.view.fx.ring(c.x + fx * 0.9, c.y + 1.1, c.z + fz * 0.9, 1.6, 0xffe14a, 0.3, new THREE.Vector3(fx, 0, fz));
      }
    }

    this.updateGates();

    // ---- fixed-step movement ---------------------------------------------------------------------
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 24) {
      this.acc -= STEP;
      steps++;
      let inp: MoveInput;
      if (this.dead || this.finished) {
        inp = { moveX: 0, moveZ: 0, jumpPressed: false, jumpHeld: false, slideHeld: false, dashPressed: false };
        if (this.dead) continue;
      } else if (this.pilot) {
        inp = this.pilot.input(c);
      } else {
        const fx = Math.cos(this.yaw), fz = Math.sin(this.yaw);
        const rx = -fz, rz = fx;
        inp = {
          moveX: fx * intent.moveY + rx * intent.moveX,
          moveZ: fz * intent.moveY + rz * intent.moveX,
          jumpPressed: this.pendingJump,
          jumpHeld: intent.jumpHeld,
          slideHeld: intent.slideHeld,
          dashPressed: this.pendingDash,
        };
        this.pendingJump = this.pendingDash = false;
      }
      const ev = c.step(STEP, inp);
      this.crumbler.update(STEP, c.groundBox);
      this.lungeLeft = Math.max(0, this.lungeLeft - STEP);
      this.handleMoveEvents(ev);
      if (this.dead) break;
    }
    if (steps === 0 && !frozen) {
      /* very slow-mo frames keep pending presses */
    }

    // ---- combat ----------------------------------------------------------------------------------------
    const body = { x: c.x, y: c.y, z: c.z, vx: c.vx, vz: c.vz, height: c.height };
    if (!this.dead) {
      const ev = this.combat.update(dt, body, this.lungeLeft > 0, this.invuln > 0 || this.finished);
      for (const k of ev.kills) this.onKill(k);
      for (const t of ev.telegraphs) {
        void t;
        audio.play('warn', 1.2);
      }
      for (const f of ev.fired) {
        this.view.particles.burst(f.x, f.y, f.z, 8, 4, 0xff4466, 0.14, 0.3, 0);
        audio.play('swing', 0.7);
      }
      for (const d of ev.deflected) this.onDeflect(d);
      for (const b of ev.blocked) this.onBlocked(b);
      if (ev.playerHit) this.hurt();
    } else this.combat.update(dt, { ...body, y: -9999 }, false, true);

    // ---- checkpoints & finish ---------------------------------------------------------------------------
    if (!this.dead && !this.finished) this.checkProgress();

    // ---- visuals ---------------------------------------------------------------------------------------------
    this.updateVisuals(realDt, dt);
  }

  private doAttack(intent: Intent): void {
    const c = this.ctrl;
    if (!this.combat.canAttack()) return;
    // aim = camera forward, biased by movement input
    let ax = Math.cos(this.yaw), az = Math.sin(this.yaw);
    if (Math.hypot(intent.moveX, intent.moveY) > 0.3) {
      const rx = -az, rz = ax;
      ax = ax * intent.moveY + rx * intent.moveX;
      az = az * intent.moveY + rz * intent.moveX;
    }
    const body = { x: c.x, y: c.y, z: c.z, vx: c.vx, vz: c.vz, height: c.height };
    const target = this.combat.pickTarget(body, ax, az);
    this.combat.startSlash();
    audio.play('swing', 1 + Math.random() * 0.2);
    let dirx = ax, dirz = az, vy = 0, time = 0.14;
    if (target) {
      const dx = target.x - c.x, dz = target.z - c.z;
      const hd = Math.hypot(dx, dz) || 1;
      dirx = dx / hd; dirz = dz / hd;
      time = Math.min(0.42, Math.max(0.12, hd / MOVE.dashSpeed + 0.05));
      vy = (target.y + 0.9 - (c.y + 0.9)) / (time * 0.8);
      vy = Math.max(-18, Math.min(16, vy));
    } else if (!c.onGround) {
      vy = Math.max(0, c.vy) * 0.3;
    }
    const l = Math.hypot(dirx, dirz) || 1;
    c.lunge(dirx / l, vy, dirz / l, COMBAT.lunge.speed, time);
    this.lungeLeft = time + 0.05;
    this.yaw = this.yaw; // camera keeps the player's look
    const ang = Math.atan2(dirz, dirx);
    this.view.fx.slash(c.x + dirx * 0.8, c.y + 1.1, c.z + dirz * 0.8, ang, 2.2, 0xffffff, 0.25 + Math.random() * 0.3);
    this.view.particles.spray(c.x, c.y + 1.1, c.z, -dirx, 0.2, -dirz, 8, 6, 0xffffff);
    this.view.shake = Math.max(this.view.shake, 0.06);
  }

  private onKill(k: { type: string; x: number; y: number; z: number; by: string }): void {
    const color = 0xff7a2a;
    const p = this.view.particles;
    p.burst(k.x, k.y, k.z, 36, 11, color, 0.22, 0.7);
    p.burst(k.x, k.y, k.z, 20, 14, 0xffffff, 0.14, 0.4);
    p.burst(k.x, k.y, k.z, 14, 7, 0x3a3d44, 0.3, 0.9, 22);
    this.view.fx.flash(k.x, k.y, k.z, 1.8, 0xffffff, 0.16);
    this.view.fx.ring(k.x, k.y, k.z, 3.2, color, 0.4, new THREE.Vector3().subVectors(this.view.camera.position, new THREE.Vector3(k.x, k.y, k.z)).normalize());
    this.hitStop.trigger(performance.now(), 85);
    this.slow.trigger(performance.now(), 220, 0.25);
    this.view.shake = Math.max(this.view.shake, 0.35);
    audio.play('kill', 1 + Math.min(0.5, this.kills * 0.03));
    audio.play('hit', 0.9);
    this.kills++;
    this.stars = Math.min(COMBAT.maxStars, this.stars + 1);
    this.focus = Math.min(1, this.focus + 0.2);
    this.combat.resetAttack();
    this.ctrl.dashCharges = MOVE.dashCharges;
    if (k.by === 'lunge') this.hud.toast(this.kills > 0 ? 'SLICED' : '', 0.5);
    if (k.by === 'reflect') this.hud.toast('REFLECTED', 0.8);
  }

  private onDeflect(d: { x: number; y: number; z: number }): void {
    this.view.particles.burst(d.x, d.y, d.z, 24, 9, 0xffe14a, 0.16, 0.5, 4);
    this.view.fx.flash(d.x, d.y, d.z, 1.2, 0xffee88, 0.14);
    this.hitStop.trigger(performance.now(), 70);
    this.view.shake = Math.max(this.view.shake, 0.25);
    audio.play('counter', 1.1);
    this.focus = Math.min(1, this.focus + 0.1);
  }

  private onBlocked(b: { x: number; y: number; z: number; dx: number; dz: number }): void {
    const c = this.ctrl;
    if (Math.hypot(c.x - b.x, c.z - b.z) < 4) c.knock(b.dx * 9, 6, b.dz * 9);
    this.lungeLeft = 0;
    this.view.particles.burst(b.x, b.y, b.z, 22, 8, 0xffe9a0, 0.12, 0.4, 10);
    this.view.fx.flash(b.x, b.y, b.z, 0.9, 0xffffff, 0.1);
    this.hitStop.trigger(performance.now(), 60);
    this.view.shake = Math.max(this.view.shake, 0.3);
    audio.play('hit', 0.6);
    audio.play('counter', 0.7);
    this.hud.toast('BLOCKED — GET BEHIND IT', 1.1);
  }

  private updateGates(): void {
    for (const a of this.level.arenas) {
      const open = a.ids.every((id) => !this.combat.enemies[id]?.alive);
      const g = this.level.boxes[a.gate];
      if (g.ghost !== open) {
        g.ghost = open;
        if (open && this.mode === 'play') {
          this.hud.toast('AREA CLEAR', 1);
          audio.play('milestone', 1.4);
        }
      }
    }
  }

  private hurt(): void {
    if (this.invuln > 0) return;
    this.hearts--;
    if (this.hearts <= 0) {
      this.die('hit');
      return;
    }
    this.invuln = 1.3;
    this.view.shake = 0.6;
    audio.play('hurt', 1.2);
    this.hud.flash('hit');
    this.hud.toast(`${this.hearts} LEFT`, 0.8);
  }

  die(why: 'hit' | 'fell' | 'hazard' | 'reset'): void {
    if (this.dead || this.finished) return;
    this.dead = true;
    this.deadTimer = why === 'fell' ? 0.45 : 0.7;
    this.deaths++;
    const c = this.ctrl;
    this.view.particles.burst(c.x, c.y + 1, c.z, 60, 10, 0xff7a1a, 0.2, 0.9);
    this.view.particles.burst(c.x, c.y + 1, c.z, 30, 12, 0x2d323d, 0.26, 0.9, 20);
    this.view.shake = 0.9;
    this.hud.flash('death');
    audio.play('hurt', 0.8);
    audio.play('boom', 0.8);
  }

  private respawn(): void {
    const cp = this.level.checkpoints[this.cpIndex];
    this.ctrl.reset(cp.x, cp.y + 0.001, cp.z, 0);
    this.combat.respawn();
    this.crumbler.reset(this.level.boxes);
    this.stars = COMBAT.maxStars;
    this.dead = false;
    this.invuln = 0.9;
    this.hearts = this.maxHearts;
    this.lungeLeft = 0;
    this.yaw = 0;
    this.pitch = -0.1;
    this.view.snapCamera();
    this.view.resetScarf(this.ctrl);
    this.pendingJump = this.pendingDash = false;
    this.acc = 0;
    this.hud.flash('respawn');
    this.hud.toast('CHECKPOINT', 0.7);
  }

  private handleMoveEvents(ev: ReturnType<Controller['step']>): void {
    const c = this.ctrl;
    const p = this.view.particles;
    if (ev.jumped) {
      audio.play('dodge', ev.wallJumped ? 1.5 : 1.7);
      p.burst(c.x, c.y + 0.1, c.z, ev.wallJumped ? 16 : 8, 4, ev.wallJumped ? 0xff9a1f : 0x88bbff, 0.12, 0.35, 6);
      if (ev.wallJumped) this.view.shake = Math.max(this.view.shake, 0.12);
    }
    if (ev.landed && ev.landSpeed > 9) {
      p.burst(c.x, c.y + 0.05, c.z, Math.min(20, 6 + ev.landSpeed * 0.6), 5, 0x88bbff, 0.14, 0.4, 6);
      this.view.shake = Math.max(this.view.shake, Math.min(0.25, ev.landSpeed * 0.01));
      audio.play('hit', 0.5);
    }
    if (ev.dashed) {
      audio.play('dodge', 1);
      const dx = Math.cos(c.yaw), dz = Math.sin(c.yaw);
      p.spray(c.x, c.y + 1, c.z, -dx, 0.1, -dz, 18, 9, 0xeaf4ff);
      this.view.fx.ring(c.x, c.y + 1, c.z, 2.0, 0xffffff, 0.3, new THREE.Vector3(dx, 0, dz));
      this.view.shake = Math.max(this.view.shake, 0.12);
    }
    if (ev.padded) {
      audio.play('skill', 1.2);
      p.burst(c.x, c.y + 0.2, c.z, 24, 7, 0x5bff9a, 0.16, 0.5, 4);
      this.view.fx.ring(c.x, c.y + 0.3, c.z, 2.4, 0x5bff9a, 0.35);
      this.view.shake = Math.max(this.view.shake, 0.2);
    }
    if (ev.slideStarted) audio.play('swing', 0.6);
    if (ev.wallRunStarted) audio.play('swing', 1.3);
    if (ev.hitHazard) this.die('hazard');
    else if (ev.fell) this.die('fell');
  }

  private emitMoveFx(c: Controller, dt: number): void {
    const p = this.view.particles;
    this.fxTimer -= dt;
    this.trailTimer -= dt;
    if (this.fxTimer <= 0) {
      this.fxTimer = 0.035;
      if (c.state === 'slide') p.burst(c.x, c.y + 0.05, c.z, 3, 3, 0xffaa33, 0.1, 0.3, 8);
      if (c.state === 'wallrun') p.burst(c.x - c.wallNx * 0.3, c.y + 0.9, c.z - c.wallNz * 0.3, 3, 3, 0xff9a1f, 0.1, 0.3, 4);
    }
    if (this.trailTimer <= 0 && c.speed > 11) {
      this.trailTimer = 0.03;
      p.emit(c.x, c.y + 0.9 + (Math.random() - 0.5) * 0.8, c.z + (Math.random() - 0.5) * 0.4, 0, 0, 0, 0.35, 0.12, 0xffffff, 0);
    }
  }

  private checkProgress(): void {
    const c = this.ctrl;
    for (let i = this.cpIndex + 1; i < this.level.checkpoints.length; i++) {
      const cp = this.level.checkpoints[i];
      if (c.x >= cp.x - 0.5 && Math.abs(c.y - cp.y) < 2.5 && Math.abs(c.z - cp.z) < 6 && c.onGround) {
        this.cpIndex = i;
        this.combat.checkpoint();
        this.hud.toast('CHECKPOINT', 1);
        audio.play('milestone', 1.2);
        this.view.fx.ring(cp.x, cp.y + 0.2, cp.z, 3, 0xffe14a, 0.6);
        this.view.particles.burst(cp.x, cp.y + 0.5, cp.z, 30, 6, 0xffe14a, 0.15, 0.8, 2);
      }
    }
    const f = this.level.finish;
    if (c.x >= f.x - 1.5 && Math.abs(c.y - f.y) < 2.5 && c.onGround) this.finish();
  }

  private finish(): void {
    this.finished = true;
    this.mode = 'results';
    this.sinceFinish = 0;
    const key = this.run.key;
    const res = applyResult(this.save, key, this.run.stage, this.time, this.deaths, this.level.parTime);
    storeSave(this.save);
    this.view.particles.burst(this.ctrl.x, this.ctrl.y + 1, this.ctrl.z, 80, 10, 0x45ff9a, 0.2, 1.1);
    this.view.fx.ring(this.ctrl.x, this.ctrl.y + 0.2, this.ctrl.z, 6, 0x45ff9a, 0.8);
    audio.play('levelup', 1);
    this.slow.trigger(performance.now(), 700, 0.35);
    this.input.releaseLock();
    this.hud.showResults({
      name: this.run.name,
      time: this.time,
      deaths: this.deaths,
      kills: this.kills,
      totalEnemies: this.combat.enemies.length,
      par: this.level.parTime,
      rank: res.rank,
      newBest: res.newBest,
      best: this.save.records[key].bestTime,
      next: !this.run.daily && this.run.stage < STAGES && this.save.unlocked > this.run.stage,
    });
  }

  nextStage(): void {
    if (this.run.stage < STAGES) this.startStage(this.run.stage + 1);
  }

  private updateVisuals(realDt: number, dt: number): void {
    const c = this.ctrl;
    const v = this.view;
    this.view.syncPlayer(c, { slash: this.combat.slashLeft, deflect: this.combat.deflectLeft, lunging: this.lungeLeft > 0, time: this.clock, invuln: this.invuln > 0, hidden: this.dead }, dt);
    // camera roll while wall-running
    const rx = -Math.sin(this.yaw), rz = Math.cos(this.yaw);
    const targetRoll = c.state === 'wallrun' ? (-(c.wallNx * rx + c.wallNz * rz) > 0 ? 1 : -1) * 0.1 : 0;
    v.roll += (targetRoll - v.roll) * (1 - Math.pow(0.001, realDt));
    v.updateCamera(c, this.yaw, this.pitch, realDt, this.level.boxes);
    v.syncEnemies(this.combat, c.x, c.y, c.z, this.clock);
    v.syncProjectiles(this.combat, this.clock);
    v.syncDynamic(this.crumbler, realDt);
    this.emitMoveFx(c, realDt);
    // bullet trails
    if (dt > 0) for (const b of this.combat.projectiles) {
      if (Math.random() < 0.6) v.particles.emit(b.x, b.y, b.z, 0, 0, 0, 0.25, 0.2, b.owner === 'enemy' ? 0xff7733 : 0xaaf0ff, 0);
    }
  }
}

import * as THREE from 'three';
export { formatTime };
