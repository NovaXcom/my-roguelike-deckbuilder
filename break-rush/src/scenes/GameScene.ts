import Phaser from 'phaser';
import { ATTACK_STEPS, BOSS, DODGE, ENEMY_STATS, GAME_HEIGHT, GAME_WIDTH, GROUND_Y, RUSH, WORLD_WIDTH } from '../config';
import { Player } from '../player/Player';
import { HUD } from '../ui/HUD';
import { ComboDisplay } from '../ui/ComboDisplay';
import { EnemyBars } from '../ui/EnemyBars';
import { RushMarker } from '../ui/RushMarker';
import { BossBar } from '../ui/BossBar';
import { EnemySpawner } from '../systems/EnemySpawner';
import { Enemy } from '../enemies/Enemy';
import { IronBeast } from '../enemies/IronBeast';
import { MeleeEnemy } from '../enemies/MeleeEnemy';
import { calcDamage, rectsOverlap } from '../combat/DamageSystem';
import { ComboSystem, milestoneCrossed } from '../combat/ComboSystem';
import { MassKillTracker } from '../combat/MassKill';
import { SlowMo } from '../combat/SlowMo';
import { HitStop } from '../combat/HitStop';
import { RushSystem, pickNearest } from '../combat/RushSystem';
import { POINTS, ScoreSystem, calcRank } from '../systems/ScoreSystem';
import { RunState, newRun } from '../systems/RunState';
import { DIFFICULTIES, DifficultyDef } from '../systems/Difficulty';
import { SaveData, loadSave, recordRun, writeSave } from '../systems/SaveSystem';
import { evaluateUnlocks, unlockedUpgrades } from '../systems/Unlocks';
import { ROUTES, RouteDef, StageRunner, bossHpScale, buildStage } from '../systems/StageScript';
import { BASE_UPGRADE_IDS, UPGRADES, UpgradeId, completesSynergy, rollChoices, statsFrom, PlayerStats } from '../systems/UpgradeSystem';
import { audio, SfxName } from '../audio/AudioSystem';
import { spawnDamageNumber } from '../effects/DamageNumber';
import { burst, deathEffect, directionalBurst, punchZoom, ring, slashArc, slashFx } from '../effects/HitEffect';

interface HitOptions {
  baseDamage: number;
  breakDamage: number;
  knockback: number;
  hitStopMs: number;
  shake: number;
  counter?: boolean;
  rush?: boolean;
  /** Chain step (0-2) for light/heavy distinction; undefined for RUSH etc. */
  step?: number;
  /** Heavy launch: spins the enemy into the air with a screen flash. */
  launch?: boolean;
  color: number;
  sfx: SfxName;
}

interface Missile {
  obj: Phaser.GameObjects.Rectangle;
  vx: number;
  vy: number;
  expireAt: number;
}

type Phase = 'between' | 'fighting' | 'upgrade' | 'ended';

const HEAL_ON_UPGRADE = 30;

export class GameScene extends Phaser.Scene {
  private run!: RunState;
  private stats!: PlayerStats;
  private diff!: DifficultyDef;
  private route!: RouteDef;
  private save!: SaveData;
  private recorded = false;
  private player!: Player;
  private hud!: HUD;
  private comboDisplay!: ComboDisplay;
  private enemyBars!: EnemyBars;
  private rushMarker!: RushMarker;
  private bossBar!: BossBar;
  private shadows!: Phaser.GameObjects.Graphics;
  private bgFar!: Phaser.GameObjects.TileSprite;
  private bgNear!: Phaser.GameObjects.TileSprite;
  private scoreText!: Phaser.GameObjects.Text;
  private spawner!: EnemySpawner;
  private runner!: StageRunner;
  private combo = new ComboSystem();
  private score = new ScoreSystem();
  private hitStop = new HitStop();
  private rush = new RushSystem<Enemy>();
  private slowmo = new SlowMo();
  private kills = new MassKillTracker();
  private missiles: Missile[] = [];
  private boss: IronBeast | null = null;
  private bossEnraged = false;
  private phase: Phase = 'between';
  private nextAt = 0;
  private pendingDelay: number | null = null;
  private advanceOnNext = false;
  private damageTaken = 0;
  private elapsedMs = 0;
  private timeScale = 1;
  private physicsFrozen = false;
  private gameOverShown = false;

  constructor() {
    super('Game');
  }

  init(data: { run?: RunState }): void {
    this.run = data?.run ?? newRun();
  }

  create(): void {
    this.gameOverShown = false;
    this.physicsFrozen = false;
    this.timeScale = 1;
    this.save = loadSave();
    this.diff = DIFFICULTIES[this.run.difficulty];
    this.route = ROUTES[this.run.route];
    this.recorded = false;
    this.stats = statsFrom(this.run.owned);
    this.combo = new ComboSystem();
    this.combo.windowBonusMs = this.stats.comboBonusMs + this.diff.comboWindowDelta;
    this.score = new ScoreSystem(this.diff.scoreMult * this.route.scoreMult);
    this.hitStop = new HitStop();
    this.rush = new RushSystem<Enemy>();
    this.slowmo = new SlowMo();
    this.kills = new MassKillTracker();
    this.missiles = [];
    this.boss = null;
    this.bossEnraged = false;
    this.damageTaken = 0;
    this.elapsedMs = 0;
    this.physics.world.timeScale = 1;
    this.tweens.timeScale = 1;

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, GAME_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, GAME_HEIGHT);
    this.cameras.main.setBackgroundColor(0x0b0820);

    // Backdrop: sky + two parallax skylines, drifting embers, glowing floor
    this.add.image(0, 0, 'bg_sky').setOrigin(0, 0).setScrollFactor(0).setDepth(-30);
    this.bgFar = this.add.tileSprite(0, GROUND_Y, GAME_WIDTH, 300, 'bg_far').setOrigin(0, 1).setScrollFactor(0).setDepth(-20);
    this.bgNear = this.add.tileSprite(0, GROUND_Y, GAME_WIDTH, 340, 'bg_near').setOrigin(0, 1).setScrollFactor(0).setDepth(-10);
    this.add
      .particles(0, 0, 'spark', {
        x: { min: 0, max: GAME_WIDTH },
        y: { min: 120, max: GROUND_Y },
        lifespan: 4500,
        speedY: { min: -14, max: -4 },
        speedX: { min: -8, max: 8 },
        scale: { start: 0.7, end: 0 },
        alpha: { start: 0.6, end: 0 },
        tint: [0xff7acb, 0x7af0ff, 0xffd27a],
        frequency: 180,
        blendMode: 'ADD',
      })
      .setScrollFactor(0)
      .setDepth(-5);
    this.add.tileSprite(WORLD_WIDTH / 2, GROUND_Y + (GAME_HEIGHT - GROUND_Y) / 2, WORLD_WIDTH, GAME_HEIGHT - GROUND_Y, 'ground').setDepth(-4);
    this.shadows = this.add.graphics().setDepth(-1);
    const ground = this.add.rectangle(WORLD_WIDTH / 2, GROUND_Y + 30, WORLD_WIDTH, 60, 0x000000, 0);
    this.physics.add.existing(ground, true);

    this.player = new Player(this, 300, GROUND_Y - 60);
    this.player.stats = this.stats;
    this.spawner = new EnemySpawner(this, this.player, this.diff.enemyHpMult);
    this.spawner.onSpawn = (e) => this.wireEnemy(e);
    this.player.targets = () => this.spawner.enemies.filter((e) => e.active && !e.dead);
    this.hud = new HUD(this, this.player);
    this.comboDisplay = new ComboDisplay(this);
    this.enemyBars = new EnemyBars(this);
    this.rushMarker = new RushMarker(this);
    this.bossBar = new BossBar(this);
    this.scoreText = this.add
      .text(GAME_WIDTH - 24, 14, '', { fontFamily: 'monospace', fontSize: '22px', fontStyle: 'bold', color: '#fff', stroke: '#000', strokeThickness: 4 })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);

    this.physics.add.collider(this.player, ground);
    this.physics.add.collider(this.spawner.group, ground);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    // Browsers only allow audio after a user gesture: unlock on input.
    const unlock = () => audio.unlock();
    this.input.keyboard!.on('keydown', unlock);
    this.input.on('pointerdown', unlock);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', unlock);
      this.game.events.off('upgrade-picked', this.onUpgradePicked, this);
      this.setTimeScale(1);
    });
    this.input.keyboard!.on('keydown-M', () => {
      audio.muted = !audio.muted;
      this.save.settings.muted = audio.muted;
      writeSave(this.save);
      spawnDamageNumber(this, this.player.x, this.player.y - 70, audio.muted ? 'SOUND OFF' : 'SOUND ON', '#aab', 16);
    });
    this.player.on('attack', (step: number, counter: boolean) => {
      audio.play('swing', counter ? 0.8 : 1 + step * 0.1);
      const f = this.player.facing;
      slashArc(this, this.player.x + f * 6, this.player.y - 2, f, ATTACK_STEPS[step].range * 0.78, step, counter ? 0xff8844 : step === ATTACK_STEPS.length - 1 ? 0xffffff : 0xffee88);
    });

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 8, 'A/D Move   Space Jump   J Attack x3   Shift Dodge / RUSH   M Sound', { fontFamily: 'monospace', fontSize: '13px', color: '#9a96c0' })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(100);

    // Stage script. Dev shortcut: ?start=upgrade|boss skips ahead.
    const steps = buildStage(this.run.stage, this.run.route);
    const startParam = new URLSearchParams(location.search).get('start');
    const startIndex = startParam === 'boss' ? steps.length - 1 : startParam === 'upgrade' ? steps.findIndex((s) => s.type === 'upgrade') : 0;
    this.runner = new StageRunner(steps, startIndex);
    this.phase = 'between';
    this.advanceOnNext = false;
    this.pendingDelay = 700;
    this.banner(this.run.route === 'standard' ? `STAGE ${this.run.stage}` : `STAGE ${this.run.stage}  ${this.route.name}`, '#44ffee');
  }

  update(_time: number, delta: number): void {
    const now = this.time.now;
    if (this.pendingDelay !== null) {
      this.nextAt = now + this.pendingDelay;
      this.pendingDelay = null;
    }
    this.setTimeScale(this.slowmo.scale(now));

    // Hit stop: freeze simulation. Key presses stay buffered (JustDown persists until read).
    if (this.hitStop.active(now)) {
      if (!this.physicsFrozen) {
        this.physics.world.pause();
        this.physicsFrozen = true;
      }
      this.updateUI(now);
      return;
    }
    if (this.physicsFrozen) {
      this.physics.world.resume();
      this.physicsFrozen = false;
    }
    if (this.phase === 'fighting') this.elapsedMs += delta;

    if (!this.player.dead && !this.player.rushing && this.player.dashPressed()) this.handleDash(now);
    this.player.update();

    for (const e of this.spawner.enemies) {
      if (!e.active || e.dead) continue;
      e.tick(this.player);

      if (this.player.attacking && !this.player.attack.hitIds.has(e)) {
        const b = e.body as Phaser.Physics.Arcade.Body;
        if (rectsOverlap(this.player.hitbox, { x: b.x, y: b.y, w: b.width, h: b.height })) {
          this.player.attack.hitIds.add(e);
          this.onPlayerAttackHit(e);
          if (!e.active) continue;
        }
      }

      // Telegraphed melee strikes: one chance to hurt the player per attack
      if (e instanceof MeleeEnemy && this.phase !== 'ended') {
        const box = e.attackBox;
        const pb = this.player.body as Phaser.Physics.Arcade.Body;
        if (box && rectsOverlap(box, { x: pb.x, y: pb.y, w: pb.width, h: pb.height })) {
          e.hitConnected = true;
          this.damagePlayer(e.attackDamage, e.x);
        }
      }
      // The boss still hurts on contact
      if (e.contactDamage > 0 && this.phase !== 'ended' && !e.disabled && now >= e.nextContactAt && this.physics.overlap(this.player, e)) {
        if (this.damagePlayer(e.contactDamage, e.x)) e.nextContactAt = now + e.contactCooldown;
      }
    }

    this.updateMissiles(now, (delta / 1000) * this.timeScale);
    this.updateBossState();
    this.updateFlow(now);
    this.updateUI(now);
    if (this.player.dead && !this.gameOverShown) this.showGameOver();
  }

  // ---- Stage flow -------------------------------------------------------

  private updateFlow(now: number): void {
    if (this.player.dead) return;
    if (this.phase === 'between') {
      if (now < this.nextAt) return;
      if (this.advanceOnNext) this.runner.advance();
      this.advanceOnNext = true;
      this.beginStep();
    } else if (this.phase === 'fighting') {
      if (this.runner.current.type === 'wave' && this.spawner.aliveCount() === 0) {
        this.phase = 'between';
        this.pendingDelay = 600;
      }
    }
  }

  private beginStep(): void {
    const step = this.runner.current;
    if (step.type === 'wave') {
      const { n, total } = this.runner.waveProgress();
      this.banner(step.label ?? `WAVE ${n}/${total}`, step.horde ? '#ff5566' : '#ffffff');
      if (step.horde) audio.play('horde');
      this.spawner.spawnWave(step.spawns.map((g) => ({ kind: g.kind, count: Math.max(1, Math.round(g.count * this.diff.countMult)) })));
      this.phase = 'fighting';
    } else if (step.type === 'upgrade') {
      this.phase = 'upgrade';
      this.game.events.once('upgrade-picked', this.onUpgradePicked, this);
      const pool = [...BASE_UPGRADE_IDS, ...unlockedUpgrades(this.save)];
      const choices = rollChoices(Math.random, 3, pool, this.run.lastOffered);
      this.run.lastOffered = choices;
      const synergies = choices.map((id) => completesSynergy(this.run.owned, id));
      this.scene.launch('Upgrade', { choices, owned: this.run.owned, synergies });
      this.scene.pause();
    } else {
      this.banner('WARNING', '#ff3344');
      audio.play('horde');
      const x = Phaser.Math.Clamp(this.player.x + 520, 200, WORLD_WIDTH - 100);
      this.boss = new IronBeast(this, x, GROUND_Y - 55, bossHpScale(this.run.stage) * this.route.bossHpMult * this.diff.enemyHpMult);
      this.spawner.add(this.boss);
      this.wireBoss(this.boss);
      this.phase = 'fighting';
    }
  }

  private onUpgradePicked(id: UpgradeId): void {
    this.run.owned.push(id);
    this.stats = statsFrom(this.run.owned);
    this.player.stats = this.stats;
    this.combo.windowBonusMs = this.stats.comboBonusMs + this.diff.comboWindowDelta;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + HEAL_ON_UPGRADE);
    this.phase = 'between';
    this.pendingDelay = 500;
    this.scene.resume();
    spawnDamageNumber(this, this.player.x, this.player.y - 50, `${UPGRADES[id].name} UP!`, '#ffdd44', 26);
  }

  // ---- Boss -------------------------------------------------------------

  private wireBoss(boss: IronBeast): void {
    boss.on('windup', (attack: string, ms: number) => {
      spawnDamageNumber(this, boss.x, boss.y - 80, '!', '#ff3344', 40);
      if (attack === 'slam') {
        const zone = this.add.circle(boss.x, GROUND_Y - 4, BOSS.slamRadius, 0xff3344, 0.12).setStrokeStyle(3, 0xff3344, 0.8).setDepth(5);
        this.tweens.add({ targets: zone, alpha: 0.4, duration: 120, yoyo: true, repeat: Math.floor(ms / 240) });
        this.time.delayedCall(ms, () => zone.destroy());
      }
    });
    boss.on('attack', (attack: string) => {
      if (attack === 'slam') this.onBossSlam(boss);
      else if (attack === 'missile') this.fireMissiles(boss);
      else audio.play('rush', 0.6);
    });
  }

  private onBossSlam(boss: IronBeast): void {
    audio.play('hitHeavy', 0.6);
    ring(this, boss.x, GROUND_Y - 6, 0xff8844, BOSS.slamRadius);
    burst(this, boss.x, GROUND_Y - 10, 0xff8844, 24, 220);
    this.cameras.main.shake(250, 0.012);
    const grounded = this.player.y > GROUND_Y - 110;
    if (grounded && Math.abs(this.player.x - boss.x) < BOSS.slamRadius) this.damagePlayer(BOSS.slamDamage, boss.x);
  }

  private fireMissiles(boss: IronBeast): void {
    audio.play('rush', 1.4);
    const base = Math.atan2(this.player.y - boss.y, this.player.x - boss.x);
    for (const off of [-0.25, 0, 0.25]) {
      const a = base + off;
      const obj = this.add.rectangle(boss.x, boss.y - 30, 18, 8, 0xff8844).setDepth(30).setRotation(a);
      this.missiles.push({ obj, vx: Math.cos(a) * BOSS.missileSpeed, vy: Math.sin(a) * BOSS.missileSpeed, expireAt: this.time.now + 2500 });
    }
  }

  private updateMissiles(now: number, dt: number): void {
    const b = this.player.body as Phaser.Physics.Arcade.Body;
    const pr = { x: b.x, y: b.y, w: b.width, h: b.height };
    this.missiles = this.missiles.filter((m) => {
      m.obj.x += m.vx * dt;
      m.obj.y += m.vy * dt;
      const hit = !this.player.dead && rectsOverlap({ x: m.obj.x - 9, y: m.obj.y - 4, w: 18, h: 8 }, pr);
      const dead = now >= m.expireAt || m.obj.y > GROUND_Y || (hit && this.damagePlayer(BOSS.missileDamage, m.obj.x - Math.sign(m.vx)));
      if (dead) {
        burst(this, m.obj.x, m.obj.y, 0xff8844, 6, 60);
        m.obj.destroy();
      }
      return !dead;
    });
  }

  private updateBossState(): void {
    const boss = this.boss;
    if (!boss || !boss.active || this.bossEnraged || !boss.enraged) return;
    this.bossEnraged = true;
    this.banner('ENRAGED!', '#ff3344');
    audio.play('horde');
    this.cameras.main.shake(300, 0.01);
    this.spawner.spawnWave([{ kind: 'grunt', count: 4 }]);
  }

  private onBossDefeated(boss: IronBeast): void {
    const now = this.time.now;
    this.phase = 'ended';
    this.boss = null;
    const { x, y } = boss;
    boss.destroy();
    this.score.add(POINTS.boss, this.combo.current(now));
    if (this.damageTaken === 0) this.score.addFlat(POINTS.noDamageBonus);

    // Wipe remaining adds, then a chain of explosions.
    for (const e of this.spawner.enemies) {
      if (e.active) {
        deathEffect(this, e.x, e.y);
        e.destroy();
      }
    }
    this.missiles.forEach((m) => m.obj.destroy());
    this.missiles = [];

    this.hitStop.trigger(now, 250);
    this.slowmo.trigger(now, 2200, 0.25);
    this.cameras.main.flash(300, 255, 255, 255);
    this.cameras.main.shake(1500, 0.012);
    punchZoom(this, 0.12, 600);
    audio.play('multikill');
    for (let i = 0; i < 9; i++) {
      this.time.delayedCall(250 + i * 170, () => {
        const ex = x + Phaser.Math.Between(-60, 60);
        const ey = y + Phaser.Math.Between(-60, 40);
        burst(this, ex, ey, i % 2 ? 0xff8844 : 0xffdd44, 30, 260);
        ring(this, ex, ey, 0xffffff, 90);
        audio.play('kill', 0.6 + (i % 3) * 0.2);
      });
    }
    this.banner('BOSS DEFEATED', '#ffdd44', 3000);

    this.time.delayedCall(3600, () => {
      const timeSec = Math.round(this.elapsedMs / 1000);
      this.run.totalScore += this.score.total;
      const rec = this.recordProgress(this.run.stage);
      const summary = {
        stage: this.run.stage,
        score: this.score.total,
        maxCombo: this.combo.max,
        damageTaken: this.damageTaken,
        timeSec,
        rank: calcRank({ score: this.score.total, maxCombo: this.combo.max, damageTaken: this.damageTaken, timeSec }),
        bestBefore: rec.bestBefore,
        newRecord: rec.newRecord,
        unlocked: rec.unlocked,
      };
      this.scene.start('Result', { run: this.run, summary });
    });
  }

  /** Folds this run into the save once (clear or game over) and applies any unlocks. */
  private recordProgress(clearedStage: number, runScore = this.run.totalScore): { bestBefore: number; newRecord: boolean; unlocked: string[] } {
    if (this.recorded) return { bestBefore: runScore, newRecord: false, unlocked: [] };
    this.recorded = true;
    const rec = recordRun(this.save, { difficulty: this.run.difficulty, runScore, maxCombo: this.combo.max, clearedStage });
    const ev = evaluateUnlocks(rec.save);
    this.save = ev.save;
    writeSave(this.save);
    return { bestBefore: rec.bestBefore, newRecord: rec.newRecord, unlocked: ev.newly.map((r) => r.label) };
  }

  // ---- Combat -----------------------------------------------------------

  /** Central place for the player taking damage. Returns true if it landed. */
  private damagePlayer(amount: number, fromX: number): boolean {
    if (this.phase === 'ended') return false;
    const dmg = Math.max(1, Math.round(amount * this.diff.enemyDmgMult * this.stats.damageTakenMult));
    if (!this.player.takeDamage(dmg, fromX)) return false;
    this.damageTaken += dmg;
    audio.play('hurt');
    spawnDamageNumber(this, this.player.x, this.player.y - 40, dmg, '#ff6666');
    this.cameras.main.shake(100, 0.004 + dmg * 0.0002);
    return true;
  }

  private handleDash(now: number): void {
    const target = this.rush.available(now) ? this.rush.target : null;
    if (target && target.active && !target.dead) {
      this.rush.clear();
      spawnDamageNumber(this, this.player.x, this.player.y - 50, 'RUSH!', '#44ffee', 26);
      audio.play('rush');
      this.player.startRush(target, () => this.onRushArrive(target));
    } else {
      if (this.player.tryDodge()) audio.play('dodge');
    }
  }

  private onPlayerAttackHit(e: Enemy): void {
    const step = ATTACK_STEPS[this.player.attack.step];
    const counter = this.player.attack.counter;
    if (counter) spawnDamageNumber(this, this.player.x, this.player.y - 50, 'COUNTER!', '#ff8844', 26);
    this.hitEnemy(e, {
      baseDamage: step.damage,
      breakDamage: counter ? DODGE.counterBreakDamage : step.breakDamage,
      knockback: counter ? DODGE.counterKnockback : step.knockback,
      hitStopMs: counter ? DODGE.counterHitStopMs : step.hitStopMs,
      shake: counter ? 0.007 : step.shake,
      counter,
      color: counter ? 0xff8844 : 0xffee88,
      step: this.player.attack.step,
      launch: counter || this.player.attack.step === ATTACK_STEPS.length - 1,
      sfx: counter ? 'counter' : step.hitStopMs >= 80 ? 'hitHeavy' : 'hit',
    });
  }

  private onRushArrive(e: Enemy): void {
    if (!e.active || e.dead) return;
    this.score.add(POINTS.rush, this.combo.current(this.time.now));
    this.hitEnemy(e, {
      baseDamage: RUSH.damage,
      breakDamage: RUSH.breakDamage,
      knockback: RUSH.knockback,
      hitStopMs: RUSH.hitStopMs,
      shake: 0.008,
      rush: true,
      color: 0x44ffee,
      sfx: 'rushHit',
    });
  }

  /** Shared hit pipeline: damage calc, upgrades, combo, score, feedback, break and kill handling. */
  private hitEnemy(e: Enemy, o: HitOptions): void {
    const now = this.time.now;
    if (e.blocksLightHit(this.player.x, o.step ?? 99, !!o.counter, !!o.rush)) {
      this.onBlocked(e);
      return;
    }
    const st = this.stats;
    const crit = Math.random() < st.critChance;
    const base = o.baseDamage * st.damageMult * (o.rush ? st.rushMult : 1);
    let dmg = calcDamage(base, { comboHits: this.combo.current(now), broken: e.broken, counter: !!o.counter });
    if (crit) dmg *= 2;
    if (e.broken) dmg = Math.round(dmg * st.brokenDamageMult);
    const res = e.takeHit({ damage: dmg, breakDamage: o.breakDamage * st.breakMult, knockbackX: this.player.facing * o.knockback, knockbackY: o.launch ? -300 : undefined });
    const prevCombo = this.combo.current(now);
    const nextCombo = this.combo.add(now);
    this.score.add(POINTS.hit, nextCombo);

    spawnDamageNumber(this, e.x, e.y - 30, res.dealt, crit ? '#ff4455' : e.broken || res.justBroken ? '#ff9933' : '#ffee88', Math.min(44, (crit ? 26 : 18) + res.dealt * 0.4));
    if (crit) spawnDamageNumber(this, e.x, e.y - 60, 'CRITICAL!!', '#ff4455', 22);
    directionalBurst(this, e.x, e.y, o.color, 8 + Math.round(o.hitStopMs / 5), 110 + o.hitStopMs, this.player.facing);
    if (o.launch) {
      this.cameras.main.flash(70, 255, 255, 255);
      punchZoom(this, 0.025, 180);
    }
    this.hitStop.trigger(now, o.hitStopMs);
    this.cameras.main.shake(80, o.shake);
    audio.play(o.sfx, 1 + Math.min(nextCombo, 50) * 0.01);
    slashFx(this, e.x, e.y, 0xffffff, 50 + o.hitStopMs);
    if (o.hitStopMs >= 80) ring(this, e.x, e.y, o.color, 50);

    const milestone = milestoneCrossed(prevCombo, nextCombo);
    if (milestone) {
      this.comboDisplay.milestone(milestone);
      audio.play('milestone');
      this.cameras.main.shake(160, 0.006);
      if (milestone >= 25) punchZoom(this, 0.04, 200);
    }

    if (res.justBroken) {
      spawnDamageNumber(this, e.x, e.y - 70, 'BREAK!!', '#ffcc00', 30);
      burst(this, e.x, e.y, 0xffcc00, 16, 140);
      this.hitStop.trigger(now, 100);
      this.cameras.main.shake(150, 0.008);
      audio.play('break');
      ring(this, e.x, e.y, 0xffcc00, 90);
      this.score.add(POINTS.break, nextCombo);
    }
    if (e.dead) this.killEnemy(e, now);
  }

  /** Light hit bounced off a guard's shield: no damage, no combo, but a satisfying clang. */
  private onBlocked(e: Enemy): void {
    const f = this.player.facing;
    const sx = e.x + e.facing * 16;
    directionalBurst(this, sx, e.y, 0x9fd0ff, 10, 150, (e.facing * -1) as 1 | -1);
    ring(this, sx, e.y, 0x9fd0ff, 36);
    spawnDamageNumber(this, e.x, e.y - 40, 'BLOCKED', '#9fd0ff', 16);
    audio.play('hit', 0.55);
    this.hitStop.trigger(this.time.now, 40);
    this.cameras.main.shake(70, 0.003);
    e.setVelocityX(f * 110);
    this.player.recoil(-f * 220);
  }

  /** Warning effects for an enemy's wind-up so attacks can be read and dodged. */
  private wireEnemy(e: Enemy): void {
    e.on('windup', (kind: string, ms: number, dir: number) => {
      spawnDamageNumber(this, e.x, e.y - 46, '!', '#ff3344', 32);
      audio.play('warn');
      if (kind !== 'rusher') return;
      const st = ENEMY_STATS.rusher;
      const len = (st.lungeSpeed * st.activeMs) / 1000;
      const lane = this.add.rectangle(e.x + (dir * len) / 2, GROUND_Y - 22, len, 44, 0xff2233, 0.2).setDepth(4);
      this.tweens.add({ targets: lane, alpha: 0.5, duration: 110, yoyo: true, repeat: Math.floor(ms / 220) });
      this.time.delayedCall(ms, () => lane.destroy());
    });
  }

  private killEnemy(e: Enemy, now: number): void {
    if (e instanceof IronBeast) {
      this.onBossDefeated(e);
      return;
    }
    deathEffect(this, e.x, e.y);
    audio.play('kill');
    this.hitStop.trigger(now, 60);
    const gained = this.score.add(e.points, this.combo.current(now));
    spawnDamageNumber(this, e.x, e.y - 50, `+${gained}`, '#88ff88', 18);
    const mk = this.kills.record(now);
    if (mk.tierUp) this.onMultiKill(mk.count, mk.tier);
    const others = this.spawner.enemies.filter((o) => o !== e && o.active && !o.dead);
    const next = pickNearest(this.player, others, RUSH.range);
    if (next) this.rush.offer(next, now, RUSH.windowMs + this.stats.rushWindowBonusMs);
    if (this.stats.killHeal > 0 && this.player.hp < this.player.maxHp) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.stats.killHeal);
      spawnDamageNumber(this, this.player.x, this.player.y - 60, `+${this.stats.killHeal} HP`, '#44dd66', 16);
    }
    e.destroy();
  }

  /** Mass-kill payoff: slow motion, flash, zoom punch, banner and a gold shower. */
  private onMultiKill(count: number, tier: number): void {
    const now = this.time.now;
    this.slowmo.trigger(now, 400 + tier * 250, tier >= 3 ? 0.25 : 0.4);
    this.hitStop.trigger(now, 60 + tier * 30);
    this.cameras.main.flash(180, 255, 255, 255);
    this.cameras.main.shake(300 + tier * 100, 0.008 + tier * 0.004);
    punchZoom(this, 0.05 + tier * 0.03, 350);
    audio.play('multikill');
    const colors = ['#ffdd44', '#ff9933', '#ff4455'];
    const t = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, `${count} KILLS!`, {
        fontFamily: 'monospace', fontStyle: 'bold', fontSize: `${56 + tier * 12}px`, color: colors[tier - 1], stroke: '#000', strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(120)
      .setScale(0.4);
    this.tweens.add({ targets: t, scale: 1.1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, delay: 900, duration: 400, onComplete: () => t.destroy() });
    burst(this, this.player.x, this.player.y - 20, 0xffdd44, 30 + tier * 20, 320);
    ring(this, this.player.x, this.player.y, 0xffdd44, 160 + tier * 40);
  }

  // ---- UI ---------------------------------------------------------------

  private banner(text: string, color: string, holdMs = 1200): void {
    const t = this.add
      .text(GAME_WIDTH / 2, 150, text, { fontFamily: 'monospace', fontStyle: 'bold', fontSize: '48px', color, stroke: '#000', strokeThickness: 8 })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(120)
      .setScale(0.5);
    this.tweens.add({ targets: t, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, delay: holdMs, duration: 400, onComplete: () => t.destroy() });
  }

  /** scale < 1 = slow motion. Arcade's timeScale is inverted (2 = half speed). */
  private setTimeScale(scale: number): void {
    if (scale === this.timeScale) return;
    this.timeScale = scale;
    this.physics.world.timeScale = 1 / scale;
    this.tweens.timeScale = scale;
  }

  private updateUI(now: number): void {
    const cam = this.cameras.main;
    this.bgFar.tilePositionX = cam.scrollX * 0.12;
    this.bgNear.tilePositionX = cam.scrollX * 0.3;
    this.shadows.clear();
    for (const a of [this.player, ...this.spawner.enemies]) {
      if (!a.active) continue;
      const feetY = a.y + a.displayHeight / 2;
      const lift = Phaser.Math.Clamp((GROUND_Y - feetY) / 220, 0, 1);
      this.shadows.fillStyle(0x000000, 0.4 * (1 - lift * 0.6)).fillEllipse(a.x, GROUND_Y + 4, a.displayWidth * (1.1 - lift * 0.5), 9);
    }
    this.hud.update();
    this.scoreText.setText(`SCORE ${this.score.total.toLocaleString()}`);
    this.comboDisplay.update(this.combo.current(now), this.combo.remainingRatio(now));
    this.enemyBars.update(this.spawner.enemies.filter((e) => e !== this.boss), now);
    this.bossBar.update(this.boss && this.boss.active ? this.boss : null, now);
    const t = this.rush.available(now) && this.rush.target?.active ? this.rush.target : null;
    this.rushMarker.update(t, now);
  }

  private showGameOver(): void {
    this.gameOverShown = true;
    const total = this.run.totalScore + this.score.total;
    const rec = this.recordProgress(this.run.stage - 1, total);
    const best = Math.max(rec.bestBefore, total);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, 'GAME OVER', { fontFamily: 'monospace', fontSize: '64px', fontStyle: 'bold', color: '#ff4466', stroke: '#000', strokeThickness: 8 })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200);
    this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2 + 50,
        `STAGE ${this.run.stage}  SCORE ${total.toLocaleString()}  MAX COMBO ${this.combo.max}\n${rec.newRecord ? 'NEW RECORD!' : `BEST ${best.toLocaleString()} (${(best - total).toLocaleString()} TO GO)`}${rec.unlocked.length ? `\nUNLOCKED: ${rec.unlocked.join(', ')}` : ''}\n\nR: retry   T: title`,
        { fontFamily: 'monospace', fontSize: '18px', color: '#fff', align: 'center' },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200);
    this.input.keyboard!.once('keydown-R', () => this.scene.start('Game', { run: newRun(this.run.difficulty) }));
    this.input.keyboard!.once('keydown-T', () => this.scene.start('Title'));
  }
}
