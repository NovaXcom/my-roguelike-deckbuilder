import * as THREE from 'three';
import { audio } from '../audio/AudioSystem';
import { HitStop } from '../combat/HitStop';
import { SlowMo } from '../combat/SlowMo';
import { endlessStage, STAGES, StageDef } from '../brawl/stages';
import { botCommand } from '../brawl/bot';
import { PERKS } from '../brawl/perks';
import { emptyCmd, PlayerCmd, World, WorldEvent } from '../brawl/World';
import { CityView } from './CityView';
import { Hud } from './Hud';
import { Input, Intent } from './Input';
import { applyResult, finalScore, loadSave, SaveData, STAGE_COUNT, storeSave } from './Progress';

type Mode = 'title' | 'play' | 'pause' | 'ko' | 'results';

const STEP = 1 / 60;

export interface RunInfo {
  key: string;
  stage: number;
  name: string;
  endless: boolean;
  seed: number;
}

export class Game {
  readonly view: CityView;
  readonly input: Input;
  readonly hud: Hud;
  save: SaveData;
  mode: Mode = 'title';
  world!: World;
  run!: RunInfo;
  yaw = 0;
  pitch = -0.24;
  time = 0;
  focusing = false;
  private clock = 0;
  private acc = 0;
  private hitStop = new HitStop();
  private slow = new SlowMo();
  private pending: PlayerCmd = emptyCmd();
  private last = performance.now();
  private frameTimes: number[] = [];
  private qualityDone = false;
  private wasLocked = false;
  private koTimer = 0;
  private prevState = 'idle';
  private prevAtk: string | null = null;
  private demoStage = 0;
  private demoT = 0;
  private hintTimer = 0;
  private hintIdx = 0;
  readonly debug: boolean;
  private botMode = false;

  constructor(root: HTMLElement) {
    const q = new URLSearchParams(location.search);
    this.debug = q.has('debug');
    this.botMode = q.has('bot');
    this.save = loadSave();
    this.view = new CityView(root);
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
    if (stage >= 1 && stage <= STAGE_COUNT) {
      this.save.unlocked = STAGE_COUNT;
      this.startStage(stage);
    } else if (q.has('endless')) this.startEndless();
    requestAnimationFrame(() => this.frame());
  }

  // ---- setup ------------------------------------------------------------------------

  private makeWorld(def: StageDef, seed: number, endless: boolean): void {
    this.world = new World(def, seed, endless);
    this.world.damageScale = this.save.assist ? 0.55 : 1;
    this.view.buildStage(def);
    this.view.particles.clear();
    this.view.fx.clear();
    this.view.snapCamera();
    this.acc = 0;
    this.pending = emptyCmd();
    this.prevState = 'idle';
    this.prevAtk = null;
  }

  private startDemo(): void {
    this.mode = 'title';
    const def = STAGES[this.demoStage % STAGES.length];
    this.makeWorld(def, 7, false);
    const w = this.world;
    w.player.x = -1.5; w.player.z = 0; w.player.facing = 0;
    const kinds = ['thug', 'knife', 'bat', 'gunman', 'brute'] as const;
    kinds.slice(0, 3 + (this.demoStage % 3)).forEach((k, i) => {
      const e = w.spawn(k, 1);
      e.state = 'idle';
      e.x = 3 + (i % 2) * 1.2;
      e.z = (i - 1) * 2;
      e.facing = Math.PI;
    });
    this.demoT = 0;
    this.hud.showTitle();
    this.input.releaseLock();
  }

  startStage(n: number): void {
    this.begin({ key: `s${n}`, stage: n, name: `${n}. ${STAGES[n - 1].name}`, endless: false, seed: 40 + n });
  }

  startEndless(): void {
    this.begin({ key: 'endless', stage: 0, name: 'ENDLESS', endless: true, seed: Math.floor(Math.random() * 99999) + 1 });
  }

  private begin(run: RunInfo): void {
    audio.unlock();
    this.run = run;
    const def = run.endless ? endlessStage(STAGES[run.seed % STAGES.length]) : STAGES[run.stage - 1];
    this.makeWorld(def, run.seed, run.endless);
    this.time = 0;
    this.yaw = 0;
    this.pitch = -0.24;
    this.koTimer = 0;
    this.mode = 'play';
    this.hintIdx = 0;
    this.hintTimer = 3.2;
    this.hud.showPlay();
    this.input.requestLock();
    this.hud.toast(run.name, 1.8);
  }

  retry(): void {
    this.begin(this.run);
  }

  retryWave(): void {
    this.world.restartWave();
    this.mode = 'play';
    this.koTimer = 0;
    this.hud.showPlay();
    this.input.requestLock();
    this.view.snapCamera();
    this.hud.toast('RETRY', 1);
  }

  nextStage(): void {
    if (this.run.stage < STAGE_COUNT) this.startStage(this.run.stage + 1);
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
    this.hud.showPlay();
    this.input.requestLock();
    this.last = performance.now();
  }

  setAssist(on: boolean): void {
    this.save.assist = on;
    if (this.world) this.world.damageScale = on ? 0.55 : 1;
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

  // ---- loop -------------------------------------------------------------------------------

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.clock += dt;
    this.trackQuality(dt);
    const intent = this.input.poll(dt);
    if (this.wasLocked && !this.input.locked && this.mode === 'play') this.pause();
    this.wasLocked = this.input.locked;

    if (this.mode === 'title') this.updateDemo(dt);
    else if (this.mode === 'play') {
      if (intent.pausePressed) this.pause();
      else this.updatePlay(dt, intent);
    } else if (this.mode === 'pause') {
      if (intent.pausePressed) this.resume();
    } else {
      this.updateAfter(dt, intent);
    }
    this.view.render(this.mode === 'pause' ? 0 : dt);
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
    this.demoT += dt;
    const w = this.world;
    const a = this.demoT * 0.12;
    const p = w.player;
    this.view.camera.position.set(p.x + Math.cos(a) * 7.5 + 2, 2.3 + Math.sin(a * 1.7) * 0.4, p.z + Math.sin(a) * 7.5);
    this.view.camera.lookAt(p.x + 2, 1.3, p.z);
    this.view.sync(w, dt, this.clock, false);
    if (this.demoT > 16) {
      this.demoStage++;
      this.startDemo();
    }
  }

  private updateAfter(dt: number, intent: Intent): void {
    void intent;
    const w = this.world;
    const scale = this.slow.scale(performance.now());
    w.update(dt * scale, emptyCmd());
    this.processEvents(w.drain());
    this.view.sync(w, dt * scale, this.clock, false);
    this.yaw += dt * 0.15;
    this.view.updateCamera(w, this.yaw, -0.2, dt, { x: 0, z: 0 });
    if (this.mode === 'ko') this.koTimer += dt;
  }

  private toCmd(intent: Intent): PlayerCmd {
    const f = { x: Math.cos(this.yaw), z: Math.sin(this.yaw) };
    const r = { x: -f.z, z: f.x };
    return {
      moveX: f.x * intent.moveY + r.x * intent.moveX,
      moveZ: f.z * intent.moveY + r.z * intent.moveX,
      aimX: f.x, aimZ: f.z,
      light: intent.light, heavy: intent.heavy, dodge: intent.dodge, counter: intent.counter, grab: intent.grab, pickup: intent.pickup, rush: intent.rush, throw: intent.throw, guardHeld: intent.guardHeld,
    };
  }

  private updatePlay(realDt: number, intent: Intent): void {
    const w = this.world;
    const nowMs = performance.now();
    this.yaw += intent.lookYaw;
    this.pitch = Math.max(-0.75, Math.min(0.25, this.pitch + intent.lookPitch));

    // latch presses until a physics step consumes them
    const cmd = this.toCmd(intent);
    for (const k of ['light', 'heavy', 'dodge', 'counter', 'grab', 'pickup', 'rush', 'throw'] as const) if (cmd[k]) this.pending[k] = true;

    const scale = this.slow.scale(nowMs);
    const frozen = this.hitStop.active(nowMs);
    if (!frozen) this.acc += realDt * scale;
    this.time += realDt;
    let steps = 0;
    while (this.acc >= STEP && steps < 8) {
      this.acc -= STEP;
      steps++;
      const c: PlayerCmd = { ...this.pending, moveX: cmd.moveX, moveZ: cmd.moveZ, aimX: cmd.aimX, aimZ: cmd.aimZ };
      if (this.botMode) Object.assign(c, this.botCmd());
      w.update(STEP, c);
      this.pending = emptyCmd();
      this.processEvents(w.drain());
    }
    this.watchPlayerState();
    if (intent.digit && w.status === 'perk') this.choosePerk(w.perkChoices[intent.digit - 1]);
    this.footDust(realDt);

    if (w.ko && this.mode === 'play') {
      this.koTimer += realDt;
      if (this.koTimer > 1.4) {
        if (this.run.endless) this.finish(false);
        else {
          this.mode = 'ko';
          this.hud.showKO();
          this.input.releaseLock();
        }
      }
    }
    if (w.cleared && this.mode === 'play') this.finish(true);

    // hints
    this.hintTimer -= realDt;
    if (this.hintTimer <= 0 && w.status !== 'done') {
      const hints = w.stage.hints;
      if (this.hintIdx < hints.length) {
        this.hud.hint(hints[this.hintIdx++], 4.5);
        this.hintTimer = 7;
      }
    }

    // camera: a little look-ahead toward the nearest enemy keeps the fight in frame
    let bx = 0, bz = 0;
    let nd = 11;
    for (const e of w.enemies) {
      if (e.state === 'dead') continue;
      const d = Math.hypot(e.x - w.player.x, e.z - w.player.z);
      if (d < nd) { nd = d; bx = (e.x - w.player.x) * 0.22; bz = (e.z - w.player.z) * 0.22; }
    }
    this.view.sync(w, realDt * scale, this.clock, false);
    this.view.updateCamera(w, this.yaw, this.pitch, realDt, { x: bx, z: bz });
  }

  /** Plays swing sounds and dust when the player starts something new. */
  private watchPlayerState(): void {
    const p = this.world.player;
    const id = p.atk?.id ?? null;
    if (p.state === 'attack' && (this.prevState !== 'attack' || id !== this.prevAtk)) {
      audio.play('swing', p.atk?.id === 'heavy' ? 0.7 : 1 + Math.random() * 0.25);
      const kick = p.atk?.anim === 'kick';
      if (id !== 'shoot' && id !== 'throwW') {
        const heavy = id === 'heavy' || id === 'finish';
        this.view.fx.slash(p.x + Math.cos(p.facing) * 0.9, kick ? 0.7 : 1.25, p.z + Math.sin(p.facing) * 0.9, p.facing, heavy ? 2.4 : 1.7, p.weapon && p.weapon !== 'gun' ? 0xffe9a0 : 0xffffff, kick ? 1.3 : (this.world.player.step % 2 ? 0.25 : -0.4), 0.2);
      }
      if (p.atk?.id === 'heavy') this.view.fovKick = Math.max(this.view.fovKick, 3);
    }
    if (p.state === 'guard' && this.prevState !== 'guard') audio.play('swing', 1.6);
    this.prevState = p.state;
    this.prevAtk = id;
  }

  choosePerk(id: string | undefined): void {
    if (!id || this.world.status !== 'perk') return;
    this.world.choosePerk(id);
    this.hud.hidePerks();
  }

  private dustT = 0;
  private footDust(dt: number): void {
    const p = this.world.player;
    this.dustT -= dt;
    if (p.state === 'move' && this.dustT <= 0) {
      this.dustT = 0.13;
      this.view.particles.burst(p.x - Math.cos(p.facing) * 0.3, 0.06, p.z - Math.sin(p.facing) * 0.3, 2, 1.4, 0xb4aea4, 0.16, 0.45, -0.5);
    }
  }

  private botCmd(): Partial<PlayerCmd> {
    return botCommand(this.world, 'smart');
  }

  // ---- world events ---------------------------------------------------------------------------

  processEvents(events: WorldEvent[]): void {
    const v = this.view;
    const p = v.particles;
    const now = performance.now();
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          const x = e.x ?? 0, y = e.y ?? 1.2, z = e.z ?? 0;
          if (e.heavy) v.aberr = Math.min(0.012, v.aberr + 0.005);
          if (e.target === 'player') {
            p.burst(x, y, z, 14, 5, 0xff5040, 0.1, 0.4, 8);
            v.shake = Math.max(v.shake, 0.5);
            this.hud.flash('hit');
            audio.play('hurt', 1);
            this.hitStop.trigger(now, 70);
            this.hud.damageNumber(x, y + 0.6, z, String(Math.round(e.dmg ?? 0)), '#ff6a55');
          } else {
            const heavy = !!e.heavy;
            p.burst(x, y, z, heavy ? 26 : 14, heavy ? 9 : 6, 0xfff0b0, 0.1, 0.35, 10);
            p.burst(x, y, z, heavy ? 10 : 5, 3, 0xffffff, 0.2, 0.25, 4);
            v.fx.flash(x, y, z, heavy ? 0.9 : 0.5, 0xffffff, 0.09);
            if (heavy) v.fx.ring(x, y, z, 2.4, 0xffffff, 0.3, new THREE.Vector3().subVectors(v.camera.position, new THREE.Vector3(x, y, z)).normalize());
            v.shake = Math.max(v.shake, heavy ? 0.35 : 0.14);
            v.fovKick = Math.max(v.fovKick, heavy ? 4 : 1.5);
            this.hitStop.trigger(now, heavy ? 90 : 45);
            audio.play(heavy ? 'hitHeavy' : 'hit', 0.9 + Math.random() * 0.3);
            if (e.by !== 'armor') this.hud.damageNumber(x, y + 0.7, z, String(Math.round(e.dmg ?? 0)), heavy ? '#ffd24a' : '#ffffff');
            else audio.play('break', 1.4);
          }
          break;
        }
        case 'block':
          p.burst(e.x ?? 0, 1.2, e.z ?? 0, 12, 6, 0xffe9a0, 0.08, 0.3, 8);
          audio.play('counter', 0.6);
          v.shake = Math.max(v.shake, 0.2);
          this.hitStop.trigger(now, 50);
          this.hud.toast('BLOCK', 0.5);
          break;
        case 'counter':
          this.slow.trigger(now, 380, 0.25);
          this.hitStop.trigger(now, 110);
          audio.play('counter', 1);
          audio.play('hitHeavy', 1.1);
          v.shake = Math.max(v.shake, 0.4);
          v.fovKick = Math.max(v.fovKick, 7);
          v.fx.ring(e.x ?? 0, 1.2, e.z ?? 0, 3, 0x6ab0ff, 0.4);
          p.burst(e.x ?? 0, 1.2, e.z ?? 0, 30, 9, 0x9ac8ff, 0.12, 0.45, 8);
          this.hud.toast('COUNTER!', 0.9, 'blue');
          break;
        case 'deflect':
          this.slow.trigger(now, 300, 0.3);
          p.burst(e.x ?? 0, 1.3, e.z ?? 0, 24, 8, 0xffd060, 0.1, 0.4, 6);
          audio.play('counter', 1.3);
          this.hud.toast('DEFLECT!', 0.8, 'yellow');
          break;
        case 'evade':
          this.slow.trigger(now, 260, 0.4);
          audio.play('dodge', 1.4);
          this.hud.toast('EVADE', 0.5, 'white');
          break;
        case 'dodge':
          audio.play('dodge', 1);
          p.burst(e.x ?? 0, 0.2, e.z ?? 0, 8, 3, 0xb0aaa0, 0.2, 0.5, 2);
          break;
        case 'whiff':
          break;
        case 'telegraph':
          audio.play('warn', e.icon === 'red' ? 0.8 : e.icon === 'yellow' ? 1.5 : 1.1);
          break;
        case 'shoot':
          p.burst(e.x ?? 0, e.y ?? 1.3, e.z ?? 0, 10, 4, 0xffc060, 0.1, 0.2, 0);
          audio.play('boom', 1.8);
          break;
        case 'slam':
          v.fx.ring(e.x ?? 0, 0.15, e.z ?? 0, (e.n ?? 2.5) * 1.1, 0xe0c090, 0.45);
          p.burst(e.x ?? 0, 0.2, e.z ?? 0, 22, 6, 0xaaa090, 0.28, 0.6, 4);
          v.shake = Math.max(v.shake, 0.45);
          audio.play('boom', 0.7);
          break;
        case 'kill': {
          const x = e.x ?? 0, y = e.y ?? 1, z = e.z ?? 0;
          p.burst(x, y, z, 24, 8, 0xffe9b0, 0.12, 0.5, 10);
          audio.play('kill', 1);
          if (e.last) {
            this.slow.trigger(now, 900, 0.22);
            v.fovKick = Math.max(v.fovKick, 9);
            this.hitStop.trigger(now, 140);
            v.shake = Math.max(v.shake, 0.5);
            this.hud.toast('FINISH!', 0.9, 'white');
          } else this.hitStop.trigger(now, 70);
          break;
        }
        case 'throw':
          audio.play('swing', 0.6);
          v.shake = Math.max(v.shake, 0.2);
          break;
        case 'bowl':
          p.burst(e.x ?? 0, 1, e.z ?? 0, 18, 7, 0xffffff, 0.14, 0.4, 6);
          audio.play('hitHeavy', 0.8);
          this.hitStop.trigger(now, 60);
          break;
        case 'wallslam':
          v.shake = Math.max(v.shake, 0.4);
          p.burst(e.x ?? 0, 1, e.z ?? 0, 20, 6, 0xc0b8a8, 0.2, 0.5, 4);
          audio.play('boom', 1.2);
          break;
        case 'perkOffer':
          this.hud.showPerks(this.world.perkChoices);
          break;
        case 'perkChosen': {
          const perk = PERKS.find((q) => q.id === e.kind);
          audio.play('buy', 1);
          this.hud.toast(perk ? perk.name : '', 1.1, 'yellow');
          break;
        }
        case 'launch':
          p.burst(e.x ?? 0, 0.3, e.z ?? 0, 16, 5, 0xb4aea4, 0.2, 0.5, 2);
          v.fx.ring(e.x ?? 0, 0.2, e.z ?? 0, 2.2, 0xffffff, 0.3);
          v.shake = Math.max(v.shake, 0.3);
          audio.play('hitHeavy', 0.7);
          break;
        case 'land':
          p.burst(e.x ?? 0, 0.1, e.z ?? 0, e.n ? 28 : 12, e.n ? 8 : 4, 0xb4aea4, 0.24, 0.6, 3);
          if (e.n) { v.fx.ring(e.x ?? 0, 0.15, e.z ?? 0, 3.6, 0xe0d0b0, 0.45); v.shake = Math.max(v.shake, 0.55); this.hitStop.trigger(now, 80); audio.play('boom', 0.8); this.hud.toast('SMASH!', 0.7, 'yellow'); }
          else audio.play('hit', 0.6);
          break;
        case 'slamdown':
          audio.play('swing', 0.5);
          v.fovKick = Math.max(v.fovKick, 6);
          break;
        case 'finisher':
          this.slow.trigger(now, 700, 0.18);
          this.hitStop.trigger(now, 160);
          v.fovKick = Math.max(v.fovKick, 11);
          v.shake = Math.max(v.shake, 0.7);
          v.aberr = 0.012;
          p.burst(e.x ?? 0, 0.6, e.z ?? 0, 40, 9, 0xffe9b0, 0.14, 0.6, 8);
          v.fx.ring(e.x ?? 0, 0.3, e.z ?? 0, 3.4, 0xffffff, 0.4);
          audio.play('hitHeavy', 0.6);
          audio.play('ult', 1.2);
          this.hud.toast('FINISH!', 1.1, 'red');
          break;
        case 'clang':
          p.burst(e.x ?? 0, e.y ?? 1.2, e.z ?? 0, 14, 7, 0xd8e4ff, 0.08, 0.3, 6);
          v.fx.flash(e.x ?? 0, e.y ?? 1.2, e.z ?? 0, 0.6, 0xffffff, 0.08);
          v.shake = Math.max(v.shake, 0.18);
          this.hitStop.trigger(now, 40);
          audio.play('break', 1.6);
          audio.play('counter', 0.5);
          break;
        case 'guardBreak':
          this.slow.trigger(now, 300, 0.3);
          v.shake = Math.max(v.shake, 0.4);
          p.burst(e.x ?? 0, e.y ?? 1.2, e.z ?? 0, 30, 9, 0xd8e4ff, 0.12, 0.5, 6);
          audio.play('break', 0.8);
          this.hud.toast('GUARD BREAK', 0.9, 'blue');
          break;
        case 'explode': {
          const x = e.x ?? 0, z = e.z ?? 0;
          v.explodeProp(e.id ?? -1, x, z);
          v.fx.flash(x, 0.9, z, 3.2, 0xffc060, 0.35);
          v.fx.flash(x, 0.9, z, 1.8, 0xffffff, 0.18);
          v.fx.ring(x, 0.25, z, (e.n ?? 3.5) * 1.1, 0xffa040, 0.5);
          p.burst(x, 0.9, z, 70, 13, 0xff9a30, 0.3, 0.8, 4);
          p.burst(x, 0.9, z, 26, 7, 0x2a2a2a, 0.28, 1.4, -1.2);
          p.burst(x, 1.2, z, 24, 16, 0xffe080, 0.12, 0.6, 12);
          v.shake = 1.0;
          v.fovKick = Math.max(v.fovKick, 10);
          v.aberr = 0.012;
          this.hitStop.trigger(now, 110);
          this.slow.trigger(now, 400, 0.4);
          audio.play('boom', 0.45);
          audio.play('ult', 0.5);
          this.hud.toast('BOOM', 0.8, 'yellow');
          break;
        }
        case 'pshoot':
          p.burst(e.x ?? 0, e.y ?? 1.3, e.z ?? 0, 10, 6, 0xffd070, 0.1, 0.18, 0);
          v.shake = Math.max(v.shake, 0.12);
          audio.play('boom', 2.2);
          break;
        case 'throwW':
          audio.play('swing', 0.5);
          this.hud.toast('THROW', 0.4, 'white');
          break;
        case 'enrage':
          this.slow.trigger(now, 500, 0.35);
          v.shake = Math.max(v.shake, 0.7);
          p.burst(e.x ?? 0, 1.5, e.z ?? 0, 40, 10, 0xff3a20, 0.2, 0.7, 2);
          audio.play('horde', 0.6);
          this.hud.toast('ENRAGED', 1.2, 'red');
          break;
        case 'rushStart':
          audio.play('ult', 1);
          this.hud.toast('RUSH!', 0.8, 'yellow');
          break;
        case 'rush':
          v.fx.ring(e.x ?? 0, 0.3, e.z ?? 0, 5, 0xffd24a, 0.55);
          v.fx.ring(e.x ?? 0, 1.0, e.z ?? 0, 4, 0xffffff, 0.4);
          p.burst(e.x ?? 0, 1, e.z ?? 0, 50, 12, 0xffd24a, 0.16, 0.6, 6);
          v.shake = Math.max(v.shake, 0.8);
          this.hitStop.trigger(now, 100);
          audio.play('boom', 0.6);
          break;
        case 'combo':
          audio.play('milestone', 1 + Math.min(0.6, (e.n ?? 0) * 0.01));
          this.hud.toast(`${e.n} HIT COMBO`, 0.9, 'white');
          break;
        case 'pickup':
          audio.play('chest', 1);
          this.hud.toast(e.kind === 'bat' ? 'BAT' : 'PIPE', 0.8, 'white');
          break;
        case 'weaponBreak':
          audio.play('break', 1);
          this.hud.toast('WEAPON BROKE', 0.8, 'white');
          break;
        case 'heal':
          audio.play('heal', 1);
          break;
        case 'wave':
          this.hud.toast(e.total ? `WAVE ${e.n} / ${e.total}` : `WAVE ${e.n}`, 1.4, 'white');
          audio.play('horde', 1);
          break;
        case 'reinforce':
          this.hud.toast('REINFORCEMENTS', 1.2, 'red');
          break;
        case 'waveClear':
          this.hud.toast('CLEAR', 1.2, 'white');
          audio.play('levelup', 1.2);
          break;
        case 'playerDown':
          this.slow.trigger(now, 1200, 0.3);
          v.shake = 0.8;
          audio.play('boom', 0.5);
          this.hud.flash('death');
          break;
        default:
          break;
      }
    }
  }

  private finish(cleared: boolean): void {
    const w = this.world;
    this.mode = 'results';
    this.input.releaseLock();
    const points = finalScore(w.score, w.damageTaken);
    let rank: 'S' | 'A' | 'B' | 'C' = 'C';
    let newBest = false;
    let best = 0;
    if (this.run.endless) {
      newBest = points > this.save.endlessBest;
      this.save.endlessBest = Math.max(this.save.endlessBest, points);
      best = this.save.endlessBest;
      storeSave(this.save);
    } else if (cleared) {
      const r = applyResult(this.save, this.run.key, this.run.stage, points, this.time, w.parScore);
      rank = r.rank;
      newBest = r.newBest;
      best = this.save.records[this.run.key].bestScore;
      storeSave(this.save);
      audio.play('levelup', 1);
    }
    this.hud.showResults({
      name: this.run.name,
      endless: this.run.endless,
      wave: w.wave + 1,
      score: points,
      rank,
      time: this.time,
      maxCombo: w.maxCombo,
      damage: Math.round(w.damageTaken),
      kills: w.kills,
      par: w.parScore,
      newBest,
      best,
      next: !this.run.endless && this.run.stage < STAGE_COUNT && this.save.unlocked > this.run.stage,
    });
  }
}
