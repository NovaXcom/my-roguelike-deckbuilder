import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { audio } from '../audio/AudioSystem';
import { HitStop } from '../combat/HitStop';
import { DIFFICULTIES, DifficultyDef, DifficultyId, ramped } from '../logic/Difficulty';
import { SlowMo } from '../combat/SlowMo';
import { BOSS_TIMES, Director, GAME_LENGTH, SpawnOrder } from '../logic/Director';
import { BOSS_GEM, ELITE_GEM, ELITE_HP_MULT, ENEMY_DEFS, EnemyKind, bossHp, dmgScale, hpScale, speedScale } from '../logic/Enemies';
import { HEROES, HeroId, MetaBonuses, MetaId, buyMeta, bankedCoins, metaBonuses } from '../logic/Meta';
import { KillStreak, UltCharge, addXp, xpToNext } from '../logic/Progression';
import { SaveData, loadSave, recordRun, writeSave } from '../logic/Save';
import { Card, Loadout, MAX_WEAPON_LEVEL, Mods, PASSIVE_IDS, PassiveId, WEAPON_IDS, WeaponId, applyCard, modsFrom, newLoadout, rollCards } from '../logic/Upgrades';
import { Boss } from './Boss';
import { EnemyManager } from './Enemies';
import { DamageNumbers, Effects, Particles } from './Fx';
import { Hud, cardView } from './Hud';
import { Input } from './Input';
import { Pickups } from './Pickups';
import { Player } from './Player';
import { HitOpts, Weapon, WeaponCtx, createWeapon } from './Weapons';
import { World } from './World';

type State = 'title' | 'playing' | 'modal' | 'dying' | 'over';

const CAP_HIGH = 440;
const CAP_LOW = 260;
const SFX_GAP: Record<string, number> = { hit: 45, kill: 55, swing: 90, boom: 110, coin: 24, gem: 24, skill: 80, hitHeavy: 80 };

/** Owns the renderer, the loop and all the pieces; the glue between rules (logic/) and visuals. */
export class Game {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private world: World;
  private particles: Particles;
  private fx: Effects;
  private dn: DamageNumbers;
  private enemies: EnemyManager;
  private pickups: Pickups;
  private hud: Hud;
  private input: Input;
  private player: Player;
  private weapons = new Map<WeaponId, Weapon>();
  private loadout: Loadout = newLoadout('slash');
  private mods: Mods = modsFrom(this.loadout);
  private meta: MetaBonuses = metaBonuses({});
  private save: SaveData = loadSave();
  private hero: HeroId = 'blaze';
  private director = new Director();
  private boss: Boss | null = null;
  private hitStop = new HitStop();
  private slowmo = new SlowMo();
  private streak = new KillStreak();
  private ult = new UltCharge();
  private level = { level: 1, xp: 0 };
  private state: State = 'title';
  private t = 0; // simulation seconds in the run
  private clock = 0; // real ms
  private kills = 0;
  private coins = 0;
  private rerolls = 2;
  private pendingLevels = 0;
  private pendingChests: number[] = [];
  private shakeAmt = 0;
  private timers: Array<{ at: number; fn: () => void }> = [];
  private ultWave: { x: number; z: number; r: number; prev: number } | null = null;
  private lastSfx: Record<string, number> = {};
  private pickStreak = 0;
  private lastPick = 0;
  private cap = CAP_HIGH;
  private lowFx = false;
  private autoQuality = true;
  /** Test-only: ?speed=4 runs the simulation faster. */
  private simSpeed = 1;
  private qualityCheckAt = 3000;
  private lastFrame = 0;
  private dying = 0;
  private victory = false;
  private win = false;
  private titleAngle = 0;
  private bossDeathPending = false;
  private rand = Math.random;
  private ctx: WeaponCtx;
  private diff: DifficultyDef = DIFFICULTIES.normal;
  private hurtCount = 0;
  private minHpRatio = 1;

  constructor(root: HTMLElement) {
    const q = new URLSearchParams(location.search);
    this.autoQuality = !q.has('hifx');
    if (q.has('debug')) this.simSpeed = Math.min(6, Math.max(0.2, Number(q.get('speed') ?? 1) || 1));
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    root.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.5, 400);
    this.world = new World(this.scene);
    this.particles = new Particles(this.scene);
    this.fx = new Effects(this.scene);
    this.enemies = new EnemyManager(this.scene, 480);
    this.pickups = new Pickups(this.scene);
    this.player = new Player(this.scene, HEROES.blaze);
    this.input = new Input(root);
    this.hud = new Hud(root, () => this.input.press('KeyQ'), () => this.input.press('Space'));
    this.dn = new DamageNumbers(this.hud.numbers, this.camera);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.45, 0.5, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.ctx = this.makeCtx();
    this.hud.onHeroBuy = (id) => this.buyHero(id);
    window.addEventListener('resize', () => this.resize());
    this.resize();

    this.applySettings();
    if (q.has('lowfx')) this.setLowFx(true);
    if (q.has('debug')) (window as unknown as { __g: Game }).__g = this;
    this.hud.update(this.hudState());
    this.openTitle();
    this.lastFrame = performance.now();
    requestAnimationFrame((n) => this.frame(n));
  }

  // ---- Setup helpers ----------------------------------------------------

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.composer.setSize(w, h);
    this.bloom.setSize(Math.max(2, w >> 1), Math.max(2, h >> 1));
    this.camera.aspect = w / h;
    // Keep the same amount of world visible on tall (phone portrait) screens
    this.camera.fov = w / h < 1 ? 62 : 46;
    this.camera.updateProjectionMatrix();
  }

  private applySettings(): void {
    audio.muted = this.save.settings.muted;
    this.setLowFx(this.save.settings.lowFx);
  }

  private setLowFx(on: boolean): void {
    this.lowFx = on;
    this.cap = on ? CAP_LOW : CAP_HIGH;
    this.particles.density = on ? 0.5 : 1;
    this.bloom.enabled = !on;
    this.renderer.setPixelRatio(on ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
    this.resize();
  }

  private makeCtx(): WeaponCtx {
    const g = this;
    return {
      get px() { return g.player.x; },
      get pz() { return g.player.z; },
      get facing() { return g.player.facing; },
      get mods() { return g.mods; },
      enemies: this.enemies,
      fx: this.fx,
      particles: this.particles,
      scene: this.scene,
      damageCircle: (x, z, r, d, o) => this.damageCircle(x, z, r, d, o),
      sfx: (n, p) => this.sfx(n, p),
      shake: (a) => this.shake(a),
      bossPos: () => (this.boss && this.boss.alive ? { x: this.boss.x, z: this.boss.z } : null),
    };
  }

  private sfx(name: string, pitch = 1): void {
    const gap = SFX_GAP[name] ?? 0;
    if (gap) {
      if (this.clock - (this.lastSfx[name] ?? -1e9) < gap) return;
      this.lastSfx[name] = this.clock;
    }
    audio.play(name as never, pitch);
  }

  private shake(a: number): void {
    this.shakeAmt = Math.min(1, Math.max(this.shakeAmt, a));
  }

  private later(sec: number, fn: () => void): void {
    this.timers.push({ at: this.t + sec, fn });
  }

  // ---- Menus ------------------------------------------------------------

  private openTitle(): void {
    this.state = 'title';
    this.hud.showHud(false);
    this.hud.showTitle(this.save, {
      onDifficulty: (d: DifficultyId) => {
        this.save.difficulty = d;
        writeSave(this.save);
      },
      onPlay: (h) => {
        audio.unlock();
        this.startRun(h);
      },
      onShop: () => this.openShop(),
      onToggleSound: () => {
        audio.unlock();
        this.save.settings.muted = !this.save.settings.muted;
        audio.muted = this.save.settings.muted;
        writeSave(this.save);
      },
      onToggleFx: () => {
        this.save.settings.lowFx = !this.save.settings.lowFx;
        writeSave(this.save);
        this.setLowFx(this.save.settings.lowFx);
      },
    });
  }

  private openShop(): void {
    audio.unlock();
    this.hud.showShop(
      this.save,
      (id: MetaId) => {
        const r = buyMeta(this.save.coins, this.save.meta, id);
        if (!r) return;
        this.save.coins = r.coins;
        this.save.meta = r.levels;
        writeSave(this.save);
        audio.play('buy');
      },
      () => this.openTitle(),
    );
  }

  private buyHero(id: HeroId): void {
    const cost = HEROES[id].cost;
    if (this.save.coins < cost || this.save.heroes.includes(id)) return;
    this.save.coins -= cost;
    this.save.heroes.push(id);
    this.save.hero = id;
    writeSave(this.save);
    audio.unlock();
    audio.play('levelup');
    this.openTitle();
  }

  // ---- Run lifecycle ----------------------------------------------------

  private startRun(hero: HeroId): void {
    audio.unlock();
    this.hud.closeModal();
    this.hero = hero;
    this.save.hero = hero;
    writeSave(this.save);
    this.meta = metaBonuses(this.save.meta);
    this.diff = DIFFICULTIES[this.save.difficulty];
    this.loadout = newLoadout(HEROES[hero].startWeapon);
    this.weapons.forEach((w) => w.dispose());
    this.weapons.clear();
    this.syncWeapons();
    this.recalcMods();

    this.enemies.clear();
    this.pickups.clear();
    this.particles.clear();
    this.boss?.dispose();
    this.boss = null;
    this.director = new Director(this.rand);
    this.streak = new KillStreak();
    this.ult = new UltCharge();
    this.level = { level: 1, xp: 0 };
    this.t = 0;
    this.kills = 0;
    this.coins = 0;
    this.rerolls = 2;
    this.pendingLevels = 0;
    this.pendingChests = [];
    this.timers = [];
    this.ultWave = null;
    this.dying = 0;
    this.hurtCount = 0;
    this.minHpRatio = 1;
    this.win = false;
    this.victory = false;
    this.bossDeathPending = false;
    this.hitStop = new HitStop();
    this.slowmo = new SlowMo();
    this.player.group.visible = true;
    this.player.x = 0;
    this.player.z = 0;
    this.player.vx = this.player.vz = 0;
    this.player.baseSpeed = HEROES[hero].speed * this.meta.speedMult;
    this.player.maxHp = HEROES[hero].hp * this.meta.hpMult + this.mods.maxHpBonus;
    this.player.hp = this.player.maxHp;
    this.player.invuln = 0.5;
    this.input.clearTaps();
    this.state = 'playing';
    this.hud.showHud(true);
    this.hud.banner('SURVIVE!', '#ffe066', 1100);
    this.sfx('horde');
  }

  private recalcMods(): void {
    const m = modsFrom(this.loadout);
    m.damageMult *= this.meta.damageMult;
    m.magnetMult *= this.meta.magnetMult;
    m.goldMult *= this.meta.goldMult;
    m.luck += this.meta.luck;
    m.speedMult *= this.meta.speedMult;
    this.mods = m;
    const base = HEROES[this.hero].hp * this.meta.hpMult + m.maxHpBonus;
    if (base !== this.player.maxHp && this.state !== 'title') {
      const gain = base - this.player.maxHp;
      this.player.maxHp = base;
      if (gain > 0) this.player.hp += gain;
    }
    this.player.baseSpeed = HEROES[this.hero].speed;
  }

  private syncWeapons(): void {
    for (const id of WEAPON_IDS) {
      const lv = this.loadout.weapons[id] ?? 0;
      if (lv > 0) {
        let w = this.weapons.get(id);
        if (!w) {
          w = createWeapon(id, this.scene);
          this.weapons.set(id, w);
        }
        w.level = Math.min(lv, MAX_WEAPON_LEVEL);
      }
    }
  }

  // ---- Main loop --------------------------------------------------------

  private frame(now: number): void {
    requestAnimationFrame((n) => this.frame(n));
    const spacing = now - this.lastFrame;
    const rawDt = Math.min(0.05, spacing / 1000) * this.simSpeed;
    this.lastFrame = now;
    this.clock = now;
    this.frameSpacing = this.frameSpacing * 0.92 + Math.min(200, spacing) * 0.08;
    this.watchPerformance(now);
    this.input.update();

    if (this.state === 'title') this.updateTitle(rawDt);
    else this.step(rawDt);

    this.world.update(this.player.x, this.player.z, now / 1000);
    this.particles.update(rawDt);
    this.fx.update(rawDt);
    this.enemies.render(now / 1000);
    this.updateCamera(rawDt);
    this.composer.render();
  }

  private watchPerformance(now: number): void {
    if (!this.autoQuality || this.lowFx || now < this.qualityCheckAt) return;
    this.qualityCheckAt = now + 2000;
    // Judge by real frame spacing, not our own work
    if (this.state === 'playing' && this.frameSpacing > 40) {
      this.setLowFx(true);
      this.hud.toast('Performance mode ON');
    }
  }

  private frameSpacing = 16;

  private step(rawDt: number): void {
    const nowMs = this.clock;
    if (this.state === 'playing' || this.state === 'dying') {
      if (this.input.tap('Escape', 'KeyP') && this.state === 'playing') {
        this.openPause();
        return;
      }
    }
    if (this.state === 'modal' || this.state === 'over') {
      this.hud.update(this.hudState());
      return;
    }

    const slow = this.slowmo.scale(nowMs);
    const frozen = this.hitStop.active(nowMs);
    const dt = frozen ? 0 : rawDt * slow;
    if (dt === 0) {
      this.hud.update(this.hudState());
      return;
    }

    if (this.state === 'dying') {
      this.dying += rawDt;
      if (this.dying > 1.6) this.finishRun();
    } else {
      this.t += dt;
      this.handleInput();
      this.ult.addTime(dt);
    }

    const aim = this.aimTarget();
    this.player.update(dt, this.state === 'dying' ? 0 : this.input.moveX, this.state === 'dying' ? 0 : this.input.moveZ, this.mods.speedMult, aim);
    if (this.player.dashing && Math.random() < 0.9) this.particles.emit(this.player.x, 0.8, this.player.z, 0, 0.5, 0, 0.35, 0.3, 0x66e0ff, 0);
    if (this.mods.regen > 0 && this.state === 'playing') this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.mods.regen * dt);

    if (this.state === 'playing') {
      this.spawnWave(dt);
      this.updateTimers();
      for (const w of this.weapons.values()) w.update(dt, this.ctx);
      this.updateUltWave(dt);
    }
    this.enemies.update(
      dt,
      this.player.x,
      this.player.z,
      this.t,
      speedScale(this.t) * ramped(this.diff.speed, this.t),
      (dmg, count) => this.hurtPlayer(dmg * (1 + 0.1 * (count - 1)) * ramped(this.diff.dmg, this.t), true),
      dmgScale(this.t),
    );
    this.boss?.update(dt);
    this.processDeaths();
    this.pickups.update(dt, this.t, this.player.x, this.player.z, 5.2 * this.mods.magnetMult, {
      gem: (v) => this.collectGem(v),
      coin: (v) => this.collectCoin(v),
      heart: (v, x, z) => this.collectHeart(v, x, z),
      chest: (tier) => this.pendingChests.push(tier),
    });
    this.afterPickups();
    this.minHpRatio = Math.min(this.minHpRatio, this.player.hp / this.player.maxHp);
    this.hud.update(this.hudState());
  }

  private updateTitle(dt: number): void {
    this.titleAngle += dt * 0.25;
    this.player.update(dt, 0, 0, 1, null);
    this.player.facing = this.titleAngle * 2;
    if (Math.random() < 0.15) this.particles.emit((Math.random() - 0.5) * 24, 0.3, (Math.random() - 0.5) * 16, 0, 2 + Math.random() * 2, 0, 1.4, 0.18, [0xff3cac, 0x3cf0ff, 0xffd633][(Math.random() * 3) | 0], 0);
  }

  private updateCamera(dt: number): void {
    const p = this.player;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.4);
    const s = this.shakeAmt * this.shakeAmt;
    const zoom = 1 + Math.min(0.3, this.level.level * 0.006);
    if (this.state === 'title') {
      const r = 15;
      this.camera.position.set(Math.sin(this.titleAngle) * r, 5.2, Math.cos(this.titleAngle) * r);
      this.camera.lookAt(0, 1.6, 0);
      return;
    }
    const tx = p.x + (Math.random() - 0.5) * s * 1.6;
    const tz = p.z + (Math.random() - 0.5) * s * 1.6;
    const ty = (Math.random() - 0.5) * s * 1.2;
    this.camera.position.set(tx, 20 * zoom + ty, tz + 14.5 * zoom);
    this.camera.lookAt(p.x, 0, p.z - 0.8);
  }

  private aimTarget(): { x: number; z: number } | null {
    if (this.state !== 'playing') return null;
    const i = this.enemies.nearest(this.player.x, this.player.z, 9);
    if (i >= 0) return { x: this.enemies.x[i], z: this.enemies.z[i] };
    if (this.boss?.alive) return { x: this.boss.x, z: this.boss.z };
    return null;
  }

  // ---- Input / abilities ------------------------------------------------

  private handleInput(): void {
    if (this.input.tap('Space', 'ShiftLeft', 'ShiftRight')) {
      if (this.player.tryDash(this.input.moveX, this.input.moveZ)) {
        this.sfx('dodge');
        this.particles.burst(this.player.x, 0.4, this.player.z, 14, 6, 0x66e0ff, 0.26, 0.5, 1);
        this.fx.ring(this.player.x, this.player.z, 2.4, 0x66e0ff, 0.3);
      }
    }
    if (this.input.tap('KeyQ', 'KeyR', 'KeyE', 'KeyF')) this.castUlt();
  }

  private castUlt(): void {
    if (this.ultWave || !this.ult.consume()) return;
    const p = this.player;
    p.invuln = Math.max(p.invuln, 3);
    this.sfx('ult');
    this.hud.callout('OVER BREAK!!', '#ffe066', 1.5);
    this.hud.flash('#ffffff', 0.9, 600);
    this.hitStop.trigger(this.clock, 380);
    this.slowmo.trigger(this.clock + 380, 900, 0.35);
    this.shake(0.9);
    // The wave itself starts after the freeze: expanding golden ring that erases everything
    const x = p.x;
    const z = p.z;
    setTimeout(() => {
      this.ultWave = { x, z, r: 0, prev: 0 };
      this.fx.ring(x, z, 52, 0xffe066, 0.8, 0.12);
      this.fx.ring(x, z, 40, 0xff4d8d, 0.7, 0.14);
      this.fx.disc(x, z, 8, 0xffffff, 0.5);
      this.particles.burst(x, 1, z, 80, 22, 0xffe066, 0.34, 1.0, 8);
      this.pickups.vacuum = true;
      this.sfx('boom', 0.7);
      setTimeout(() => (this.pickups.vacuum = false), 3500);
    }, 380);
  }

  private updateUltWave(dt: number): void {
    const w = this.ultWave;
    if (!w) return;
    w.prev = w.r;
    w.r += dt * 75;
    this.damageCircle(w.x, w.z, w.r, 1e6, { knock: 24, color: 0xffe066, minR: w.prev });
    if (w.r > 56) this.ultWave = null;
  }

  // ---- Spawning ---------------------------------------------------------

  private spawnWave(dt: number): void {
    const orders = this.director.update(this.t, dt * ramped(this.diff.spawn, this.t), this.enemies.n, this.cap);
    for (const o of orders) this.spawnOrder(o);
    const b = this.director.bossDue(this.t);
    if (b >= 0) this.spawnBoss(b);
  }

  private spawnOrder(o: SpawnOrder): void {
    const p = this.player;
    const hpMul = hpScale(this.t) * ramped(this.diff.hp, this.t);
    if (o.type === 'ring') {
      this.hud.callout('HORDE INCOMING!', '#ff6a7a', 1.1);
      this.sfx('horde');
      const n = o.count;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        this.enemies.spawn(o.kind, p.x + Math.cos(a) * o.radius, p.z + Math.sin(a) * o.radius, ENEMY_DEFS[o.kind].hp * hpMul);
      }
      return;
    }
    const a = Math.random() * Math.PI * 2;
    const r = o.near ? 9 + Math.random() * 5 : 25 + Math.random() * 5;
    const hp = ENEMY_DEFS[o.kind].hp * hpMul * (o.elite ? ELITE_HP_MULT : 1);
    if (o.elite) {
      this.hud.banner('ELITE!', '#ffd633', 1000);
      this.sfx('warn');
    }
    this.enemies.spawn(o.kind, p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, hp, !!o.elite);
  }

  private spawnBoss(index: number): void {
    if (this.boss?.alive) return;
    const p = this.player;
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
    const final = index >= BOSS_TIMES.length - 1;
    this.hud.callout(final ? 'FINAL BOSS!' : 'BOSS INCOMING!', '#ff4d6d', 1.3);
    this.sfx('horde');
    this.shake(0.6);
    this.boss = new Boss(this.scene, index, p.x + Math.cos(a) * 15, p.z + Math.sin(a) * 15, bossHp(index) * this.diff.hp, {
      player: () => ({ x: this.player.x, z: this.player.z }),
      damagePlayer: (n) => this.hurtPlayer(n * dmgScale(this.t) * 0.8 * ramped(this.diff.dmg, this.t), false),
      summon: (n, x, z) => {
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2;
          this.enemies.spawn(i % 4 === 0 ? 'runner' : 'imp', x + Math.cos(ang) * 4, z + Math.sin(ang) * 4, ENEMY_DEFS.imp.hp * hpScale(this.t) * ramped(this.diff.hp, this.t));
        }
      },
      fx: this.fx,
      particles: this.particles,
      shake: (v) => this.shake(v),
      sfx: (n, pch) => this.sfx(n, pch),
      telegraph: (txt) => this.hud.banner(txt, '#ff5a6a', 800),
    });
  }

  // ---- Damage -----------------------------------------------------------

  private damageCircle(x: number, z: number, r: number, dmg: number, o: HitOpts = {}): number {
    let hits = 0;
    this.enemies.forEachInCircle(x, z, r, (i, dist) => {
      if (o.minR !== undefined && dist < o.minR) return;
      if (o.cone) {
        const ang = Math.atan2(this.enemies.z[i] - z, this.enemies.x[i] - x);
        let d = ang - o.cone.angle;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const slack = 0.12 + this.enemies.radius(i) / Math.max(1, dist);
        if (Math.abs(d) > o.cone.halfArc + slack) return;
      }
      this.hitEnemy(i, dmg, x, z, o);
      hits++;
    });
    const b = this.boss;
    if (b?.alive) {
      const dist = Math.hypot(b.x - x, b.z - z);
      let ok = dist <= r + b.radius && !(o.minR !== undefined && dist < o.minR);
      if (ok && o.cone) {
        let d = Math.atan2(b.z - z, b.x - x) - o.cone.angle;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        ok = Math.abs(d) <= o.cone.halfArc + 0.35;
      }
      if (ok) {
        this.hitBoss(dmg >= 1e5 ? b.maxHp * 0.1 : dmg, o);
        hits++;
      }
    }
    return hits;
  }

  private hitEnemy(i: number, dmg: number, ox: number, oz: number, o: HitOpts): void {
    const crit = Math.random() < this.mods.critChance;
    const d = Math.max(1, Math.round(dmg * (crit ? 2.5 : 1) * (0.92 + Math.random() * 0.16)));
    const ex = this.enemies.x[i];
    const ez = this.enemies.z[i];
    const dx = ex - ox;
    const dz = ez - oz;
    const l = Math.hypot(dx, dz) || 1;
    const k = o.knock ?? 6;
    this.enemies.damage(i, d, (dx / l) * k, (dz / l) * k);
    if (d < 1e5) this.dn.spawn(ex, 1.9, ez, d.toLocaleString(), crit ? 'crit' : 'normal', this.clock);
    this.particles.burst(ex, 0.9, ez, crit ? 7 : 3, 6, crit ? 0xffe066 : (o.color ?? 0xffffff), 0.2, 0.4, 3);
    this.sfx(crit ? 'hitHeavy' : 'hit', 0.9 + Math.random() * 0.3);
    if (crit) this.shake(0.12);
  }

  private hitBoss(dmg: number, o: HitOpts): void {
    const b = this.boss;
    if (!b) return;
    const crit = Math.random() < this.mods.critChance;
    const d = Math.round(dmg * (crit ? 2.5 : 1));
    this.dn.spawn(b.x, 4.8, b.z, d.toLocaleString(), crit ? 'crit' : 'normal', this.clock);
    this.particles.burst(b.x + (Math.random() - 0.5) * 2, 2 + Math.random() * 2, b.z + (Math.random() - 0.5) * 2, 4, 7, o.color ?? 0xffffff, 0.24, 0.4, 3);
    this.sfx('hit', 0.7);
    if (b.hurt(d)) this.onBossDeath(b);
  }

  private hurtPlayer(amount: number, contact: boolean): void {
    if (this.state !== 'playing') return;
    const p = this.player;
    const a = Math.max(1, Math.round(amount));
    if (!p.hurt(a)) return;
    this.hurtCount++;
    this.sfx('hurt');
    this.shake(contact ? 0.3 : 0.55);
    this.hud.flash('#ff2244', 0.35, 260);
    this.dn.spawn(p.x, 2.8, p.z, `-${a}`, 'text', this.clock);
    this.particles.burst(p.x, 1, p.z, 10, 6, 0xff5577, 0.24, 0.5);
    this.ult.value = Math.min(this.ult.need, this.ult.value + 1.5);
    if (p.hp <= 0) this.die();
  }

  private die(): void {
    if (this.state === 'dying' || this.state === 'over') return;
    this.state = 'dying';
    this.dying = 0;
    const p = this.player;
    this.sfx('boom', 0.5);
    this.shake(1);
    this.hud.flash('#ffffff', 0.9, 500);
    this.particles.burst(p.x, 1, p.z, 90, 14, 0xff6a3d, 0.34, 1.0, 8);
    this.fx.ring(p.x, p.z, 12, 0xff6a3d, 0.8);
    p.group.visible = false;
    this.slowmo.trigger(this.clock, 1800, 0.25);
  }

  // ---- Kills and loot ---------------------------------------------------

  private processDeaths(): void {
    const dead = this.enemies.takeDead();
    if (dead.length === 0) return;
    for (const i of dead) {
      this.onEnemyKilled(i);
      this.enemies.removeAt(i);
    }
    this.enemies.rehash();
  }

  private onEnemyKilled(i: number): void {
    const x = this.enemies.x[i];
    const z = this.enemies.z[i];
    const kind = (['imp', 'runner', 'brute'] as EnemyKind[])[this.enemies.kind[i]];
    const elite = this.enemies.elite[i] === 1;
    const def = ENEMY_DEFS[kind];
    this.kills++;
    this.ult.addKill();
    const callout = this.streak.kill(this.clock);
    if (callout) {
      this.hud.callout(callout.text, callout.color, 1 + callout.at / 500);
      this.sfx('multikill', 1);
      this.coins += callout.coins;
      this.shake(0.3);
      if (callout.at >= 100) {
        this.hud.flash(callout.color, 0.35, 350);
        this.slowmo.trigger(this.clock, 350, 0.45);
      }
    }
    this.particles.burst(x, 0.8, z, elite ? 40 : 11, elite ? 12 : 8, elite ? 0xffd633 : def.color, 0.24, 0.65);
    this.sfx('kill', 0.85 + Math.random() * 0.3);
    // Loot
    const gemValue = elite ? ELITE_GEM : def.gem;
    if (!this.pickups.addGem(x, z, gemValue)) this.collectGem(gemValue);
    const coinChance = (kind === 'brute' ? 0.6 : 0.16) * this.mods.goldMult;
    if (Math.random() < coinChance) this.pickups.addCoin(x, z, 1);
    if (elite) {
      for (let k = 0; k < 8; k++) this.pickups.addCoin(x, z, 2);
      this.pickups.addChest(x, z, 1, this.t);
      this.hitStop.trigger(this.clock, 90);
      this.fx.ring(x, z, 6, 0xffd633, 0.5);
      this.shake(0.4);
      this.sfx('chest');
    }
    const lowHp = this.player.hp < this.player.maxHp * 0.35;
    if (Math.random() < (lowHp ? 0.04 : 0.006)) this.pickups.addHeart(x, z, 12 + this.player.maxHp * 0.06);
  }

  private collectGem(value: number): void {
    const gained = addXp(this.level, value * this.meta.xpMult);
    this.pickChain('gem');
    if (gained > 0) {
      this.pendingLevels += gained;
      this.hud.callout('LEVEL UP!', '#8af6ff', 1);
      this.fx.ring(this.player.x, this.player.z, 9, 0x8af6ff, 0.55);
      this.particles.burst(this.player.x, 1, this.player.z, 40, 10, 0x8af6ff, 0.28, 0.9, 7);
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * 0.08);
      this.sfx('levelup');
    }
  }

  private collectCoin(value: number): void {
    const v = Math.max(1, Math.round(value * this.mods.goldMult));
    this.coins += v;
    this.pickChain('coin');
  }

  private collectHeart(value: number, x: number, z: number): void {
    const before = this.player.hp;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + value);
    this.dn.spawn(x, 1.8, z, `+${Math.round(this.player.hp - before)}`, 'heal', this.clock);
    this.sfx('heal');
  }

  private pickChain(kind: 'gem' | 'coin'): void {
    this.pickStreak = this.clock - this.lastPick < 380 ? Math.min(this.pickStreak + 1, 16) : 0;
    this.lastPick = this.clock;
    this.sfx(kind, 1 + this.pickStreak * 0.05);
  }

  private onBossDeath(b: Boss): void {
    if (this.bossDeathPending) return;
    this.bossDeathPending = true;
    const x = b.x;
    const z = b.z;
    const final = b.index >= BOSS_TIMES.length - 1;
    this.hud.callout(final ? 'VICTORY!!' : 'BOSS DEFEATED!', '#ffe066', 1.5);
    this.hitStop.trigger(this.clock, 300);
    this.slowmo.trigger(this.clock + 300, 2000, 0.3);
    this.shake(1);
    this.hud.flash('#ffffff', 0.9, 700);
    this.sfx('boom', 0.6);
    for (let k = 0; k < 8; k++) {
      this.later(0.1 + k * 0.18, () => {
        const ox = x + (Math.random() - 0.5) * 5;
        const oz = z + (Math.random() - 0.5) * 5;
        this.particles.burst(ox, 1 + Math.random() * 3, oz, 40, 13, k % 2 ? 0xff9a3d : 0xffe066, 0.36, 0.9, 7);
        this.fx.ring(ox, oz, 6, 0xffffff, 0.45);
        this.sfx('kill', 0.5 + k * 0.08);
        this.shake(0.6);
      });
    }
    this.later(1.6, () => {
      b.dispose();
      this.boss = null;
      this.bossDeathPending = false;
      for (let k = 0; k < 40; k++) this.pickups.addCoin(x, z, 3);
      for (let k = 0; k < 30; k++) this.pickups.addGem(x, z, BOSS_GEM / 30 + 2);
      this.pickups.addChest(x, z, 2, this.t);
      this.pickups.addHeart(x, z, this.player.maxHp * 0.4);
      this.pickups.vacuum = true;
      this.later(2.5, () => (this.pickups.vacuum = false));
      // wipe whatever is still alive
      this.ultWave = { x: this.player.x, z: this.player.z, r: 0, prev: 0 };
      if (final) this.later(2.2, () => this.winRun());
    });
  }

  private updateTimers(): void {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.t >= this.timers[i].at) {
        const f = this.timers.splice(i, 1)[0];
        f.fn();
      }
    }
  }

  // ---- Level-up and chests ---------------------------------------------

  private afterPickups(): void {
    if (this.state !== 'playing') return;
    if (this.pendingLevels > 0) {
      this.pendingLevels--;
      this.openLevelUp();
    } else if (this.pendingChests.length > 0) {
      this.openChest(this.pendingChests.shift()!);
    }
  }

  private cardLevel(c: Card): number {
    return c.kind === 'weapon' ? this.loadout.weapons[c.id as WeaponId] ?? 0 : this.loadout.passives[c.id as PassiveId] ?? 0;
  }

  private openLevelUp(): void {
    const cards = rollCards(this.rand, this.loadout, this.mods.luck, 3);
    if (cards.length === 0) {
      this.coins += 25;
      this.hud.toast('All maxed! +25 coins');
      return;
    }
    this.state = 'modal';
    this.input.clearTaps();
    this.hud.showCards(
      'LEVEL UP!',
      `Level ${this.level.level}  ·  choose a power`,
      cards.map((c) => cardView(c, this.cardLevel(c))),
      this.rerolls,
      (i) => {
        applyCard(this.loadout, cards[i]);
        this.sfx('buy');
        this.afterCard(cards[i]);
        this.closeModal();
      },
      () => {
        this.rerolls--;
        this.pendingLevels++;
        this.closeModal();
      },
    );
  }

  private afterCard(c: Card): void {
    this.syncWeapons();
    this.recalcMods();
    const name = c.kind === 'weapon' ? c.id : c.id;
    this.fx.ring(this.player.x, this.player.z, 5, 0xffffff, 0.4);
    if (c.rarity === 'legendary' || c.rarity === 'epic') {
      this.hud.flash(c.rarity === 'legendary' ? '#ffc933' : '#c264ff', 0.5, 400);
      this.shake(0.3);
    }
    void name;
  }

  private openChest(tier: number): void {
    const n = tier >= 2 ? 4 : 2;
    const picked: Card[] = [];
    const tmp: Loadout = { weapons: { ...this.loadout.weapons }, passives: { ...this.loadout.passives } };
    for (let k = 0; k < n; k++) {
      const c = rollCards(this.rand, tmp, this.mods.luck + 0.55 + tier * 0.2, 1)[0];
      if (!c) break;
      picked.push(c);
      applyCard(tmp, c);
    }
    const views = picked.map((c) => {
      const lv = c.kind === 'weapon' ? this.loadout.weapons[c.id as WeaponId] ?? 0 : this.loadout.passives[c.id as PassiveId] ?? 0;
      return cardView(c, lv);
    });
    const bonus = Math.round((tier >= 2 ? 120 : 40) * this.mods.goldMult);
    this.state = 'modal';
    this.input.clearTaps();
    this.sfx('chest');
    this.hud.showChest(views, bonus, () => {
      picked.forEach((c) => applyCard(this.loadout, c));
      this.coins += bonus;
      this.syncWeapons();
      this.recalcMods();
      this.closeModal();
    });
  }

  private closeModal(): void {
    this.hud.closeModal();
    this.input.clearTaps();
    this.state = 'playing';
  }

  private openPause(): void {
    this.state = 'modal';
    this.hud.showPause(
      () => this.closeModal(),
      () => {
        this.hud.closeModal();
        this.die();
        this.finishRun();
      },
    );
  }

  // ---- End of run -------------------------------------------------------

  private winRun(): void {
    if (this.state === 'over') return;
    this.win = true;
    this.finishRun();
  }

  private finishRun(): void {
    if (this.state === 'over') return;
    this.state = 'over';
    this.victory = this.win;
    const result = { timeSec: this.t, kills: this.kills, coins: this.coins, level: this.level.level, victory: this.victory };
    const banked = Math.round(bankedCoins(result) * this.diff.reward);
    const rec = recordRun(this.save, result);
    this.save = rec.save;
    this.save.coins += banked;
    writeSave(this.save);
    this.hud.showHud(false);
    this.hud.showResults(
      { victory: this.victory, time: this.t, kills: this.kills, level: this.level.level, coins: this.coins, banked, bestTime: rec.newBestTime, bestKills: rec.newBestKills, maxStreak: this.streak.best },
      () => {
        this.hud.closeModal();
        this.startRun(this.hero);
      },
      () => {
        this.hud.closeModal();
        this.save = loadSave();
        this.enemies.clear();
        this.pickups.clear();
        this.boss?.dispose();
        this.boss = null;
        this.weapons.forEach((w) => w.dispose());
        this.weapons.clear();
        this.player.group.visible = true;
        this.openTitle();
      },
    );
  }

  // ---- HUD --------------------------------------------------------------

  private hudState() {
    const nextBossIdx = this.director.bossesSpawned;
    const nb = nextBossIdx < BOSS_TIMES.length ? BOSS_TIMES[nextBossIdx] - this.t : -1;
    const lvName = (id: WeaponId) => ({ id, level: this.loadout.weapons[id] ?? 0 });
    return {
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      xp: this.level.xp,
      xpNeed: xpToNext(this.level.level),
      level: this.level.level,
      time: this.t,
      kills: this.kills,
      coins: this.coins,
      ult: this.ult.percent,
      dashReady: 1 - this.player.dashCd / this.player.dashCooldown,
      weapons: WEAPON_IDS.map(lvName).filter((w) => w.level > 0),
      passives: PASSIVE_IDS.map((id) => ({ id, level: this.loadout.passives[id] ?? 0 })).filter((p) => p.level > 0),
      streak: this.streak.current(this.clock),
      streakRemain: this.streak.remaining(this.clock),
      boss: this.boss?.alive ? { name: this.boss.name, ratio: this.boss.hp / this.boss.maxHp } : null,
      nextBoss: this.boss?.alive ? '' : nb > 0 ? `BOSS in ${Math.ceil(nb)}s` : this.t >= GAME_LENGTH ? '' : '',
      touch: this.input.touch,
    };
  }

  // ---- Test hooks -------------------------------------------------------

  /** Snapshot for automated play-testing (?debug). */
  debugState() {
    return {
      state: this.state,
      t: this.t,
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      level: this.level.level,
      kills: this.kills,
      coins: this.coins,
      enemies: this.enemies.n,
      gems: this.pickups.gemCount,
      ult: this.ult.percent,
      boss: this.boss?.alive ? { hp: this.boss.hp, max: this.boss.maxHp } : null,
      weapons: { ...this.loadout.weapons },
      passives: { ...this.loadout.passives },
      px: this.player.x,
      pz: this.player.z,
      lowFx: this.lowFx,
      particles: 0,
      pendingLevels: this.pendingLevels,
      hurts: this.hurtCount,
      minHp: this.minHpRatio,
      modal: this.hud.modalOpen,
    };
  }

  debugEnemies(): Array<{ x: number; z: number }> {
    const out: Array<{ x: number; z: number }> = [];
    for (let i = 0; i < this.enemies.n; i++) out.push({ x: this.enemies.x[i], z: this.enemies.z[i] });
    return out;
  }

  debugGive(what: 'ult' | 'xp' | 'time', v: number): void {
    if (what === 'ult') this.ult.value = (v / 100) * this.ult.need;
    else if (what === 'xp') this.collectGem(v);
    else this.t = v;
  }

  debugPickCard(i: number): void {
    (document.querySelectorAll('.card')[i] as HTMLElement | undefined)?.dispatchEvent(new PointerEvent('pointerdown'));
  }

  debugClick(sel: string): void {
    (document.querySelector(sel) as HTMLElement | null)?.dispatchEvent(new PointerEvent('pointerdown'));
  }
}
