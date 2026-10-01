import Phaser from 'phaser';
import { ATTACK_STEPS, BOSS, DODGE, GAME_HEIGHT, GAME_WIDTH, GROUND_Y, RUSH, WORLD_WIDTH } from '../config';
import { Player } from '../player/Player';
import { HUD } from '../ui/HUD';
import { ComboDisplay } from '../ui/ComboDisplay';
import { EnemyBars } from '../ui/EnemyBars';
import { RushMarker } from '../ui/RushMarker';
import { BossBar } from '../ui/BossBar';
import { EnemySpawner } from '../systems/EnemySpawner';
import { Enemy } from '../enemies/Enemy';
import { IronBeast } from '../enemies/IronBeast';
import { calcDamage, rectsOverlap } from '../combat/DamageSystem';
import { ComboSystem, milestoneCrossed } from '../combat/ComboSystem';
import { MassKillTracker } from '../combat/MassKill';
import { SlowMo } from '../combat/SlowMo';
import { HitStop } from '../combat/HitStop';
import { RushSystem, pickNearest } from '../combat/RushSystem';
import { POINTS, ScoreSystem, calcRank } from '../systems/ScoreSystem';
import { RunState, newRun } from '../systems/RunState';
import { StageRunner, bossHpScale, buildStage } from '../systems/StageScript';
import { UPGRADES, UpgradeId, rollChoices, statsFrom, PlayerStats } from '../systems/UpgradeSystem';
import { audio, SfxName } from '../audio/AudioSystem';
import { spawnDamageNumber } from '../effects/DamageNumber';
import { burst, deathEffect, punchZoom, ring, slashFx } from '../effects/HitEffect';

interface HitOptions {
  baseDamage: number;
  breakDamage: number;
  knockback: number;
  hitStopMs: number;
  shake: number;
  counter?: boolean;
  rush?: boolean;
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
  private player!: Player;
  private hud!: HUD;
  private comboDisplay!: ComboDisplay;
  private enemyBars!: EnemyBars;
  private rushMarker!: RushMarker;
  private bossBar!: BossBar;
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
    this.stats = statsFrom(this.run.owned);
    this.combo = new ComboSystem();
    this.combo.windowBonusMs = this.stats.comboBonusMs;
    this.score = new ScoreSystem();
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
    this.cameras.main.setBackgroundColor(0x12121f);

    this.add.tileSprite(WORLD_WIDTH / 2, GROUND_Y + (GAME_HEIGHT - GROUND_Y) / 2, WORLD_WIDTH, GAME_HEIGHT - GROUND_Y, 'ground');
    const ground = this.add.rectangle(WORLD_WIDTH / 2, GROUND_Y + 30, WORLD_WIDTH, 60, 0x000000, 0);
    this.physics.add.existing(ground, true);

    this.player = new Player(this, 300, GROUND_Y - 60);
    this.player.stats = this.stats;
    this.spawner = new EnemySpawner(this, this.player);
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
    this.player.on('attack', (step: number, counter: boolean) => audio.play('swing', counter ? 0.8 : 1 + step * 0.1));

    this.add
      .text(GAME_WIDTH / 2, 20, 'A/D: Move  Space: Jump  J: Attack (x3 combo)  Shift: Dodge / RUSH', { fontFamily: 'monospace', fontSize: '14px', color: '#aab' })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(100);

    // Stage script. Dev shortcut: ?start=upgrade|boss skips ahead.
    const steps = buildStage(this.run.stage);
    const startParam = new URLSearchParams(location.search).get('start');
    const startIndex = startParam === 'boss' ? steps.length - 1 : startParam === 'upgrade' ? steps.findIndex((s) => s.type === 'upgrade') : 0;
    this.runner = new StageRunner(steps, startIndex);
    this.phase = 'between';
    this.advanceOnNext = false;
    this.pendingDelay = 1500;
    this.banner(`STAGE ${this.run.stage}`, '#44ffee');
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

      if (this.phase !== 'ended' && !e.disabled && now >= e.nextContactAt && this.physics.overlap(this.player, e)) {
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
        this.pendingDelay = 1200;
      }
    }
  }

  private beginStep(): void {
    const step = this.runner.current;
    if (step.type === 'wave') {
      const { n, total } = this.runner.waveProgress();
      this.banner(step.label ?? `WAVE ${n}/${total}`, step.horde ? '#ff5566' : '#ffffff');
      if (step.horde) audio.play('horde');
      this.spawner.spawn(step.count);
      this.phase = 'fighting';
    } else if (step.type === 'upgrade') {
      this.phase = 'upgrade';
      this.game.events.once('upgrade-picked', this.onUpgradePicked, this);
      this.scene.launch('Upgrade', { choices: rollChoices(Math.random), owned: this.run.owned });
      this.scene.pause();
    } else {
      this.banner('WARNING', '#ff3344');
      audio.play('horde');
      const x = Phaser.Math.Clamp(this.player.x + 520, 200, WORLD_WIDTH - 100);
      this.boss = new IronBeast(this, x, GROUND_Y - 55, bossHpScale(this.run.stage));
      this.spawner.add(this.boss);
      this.wireBoss(this.boss);
      this.phase = 'fighting';
    }
  }

  private onUpgradePicked(id: UpgradeId): void {
    this.run.owned.push(id);
    this.stats = statsFrom(this.run.owned);
    this.player.stats = this.stats;
    this.combo.windowBonusMs = this.stats.comboBonusMs;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + HEAL_ON_UPGRADE);
    this.phase = 'between';
    this.pendingDelay = 800;
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
    this.spawner.spawn(4);
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
      const summary = {
        stage: this.run.stage,
        score: this.score.total,
        maxCombo: this.combo.max,
        damageTaken: this.damageTaken,
        timeSec,
        rank: calcRank({ score: this.score.total, maxCombo: this.combo.max, damageTaken: this.damageTaken, timeSec }),
      };
      this.run.totalScore += this.score.total;
      this.scene.start('Result', { run: this.run, summary });
    });
  }

  // ---- Combat -----------------------------------------------------------

  /** Central place for the player taking damage. Returns true if it landed. */
  private damagePlayer(amount: number, fromX: number): boolean {
    if (this.phase === 'ended' || !this.player.takeDamage(amount, fromX)) return false;
    this.damageTaken += amount;
    audio.play('hurt');
    spawnDamageNumber(this, this.player.x, this.player.y - 40, amount, '#ff6666');
    this.cameras.main.shake(100, 0.004 + amount * 0.0002);
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
    const st = this.stats;
    const crit = Math.random() < st.critChance;
    const base = o.baseDamage * st.damageMult * (o.rush ? st.rushMult : 1);
    let dmg = calcDamage(base, { comboHits: this.combo.current(now), broken: e.broken, counter: !!o.counter });
    if (crit) dmg *= 2;
    const res = e.takeHit({ damage: dmg, breakDamage: o.breakDamage * st.breakMult, knockbackX: this.player.facing * o.knockback });
    const prevCombo = this.combo.current(now);
    const nextCombo = this.combo.add(now);
    this.score.add(POINTS.hit, nextCombo);

    spawnDamageNumber(this, e.x, e.y - 30, res.dealt, crit ? '#ff4455' : e.broken || res.justBroken ? '#ff9933' : '#ffee88', crit ? 30 : 22);
    if (crit) spawnDamageNumber(this, e.x, e.y - 60, 'CRITICAL!!', '#ff4455', 22);
    burst(this, e.x, e.y, o.color, 6 + Math.round(o.hitStopMs / 10), 60 + o.hitStopMs);
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

  private killEnemy(e: Enemy, now: number): void {
    if (e instanceof IronBeast) {
      this.onBossDefeated(e);
      return;
    }
    deathEffect(this, e.x, e.y);
    audio.play('kill');
    this.hitStop.trigger(now, 60);
    const gained = this.score.add(POINTS.grunt, this.combo.current(now));
    spawnDamageNumber(this, e.x, e.y - 50, `+${gained}`, '#88ff88', 18);
    const mk = this.kills.record(now);
    if (mk.tierUp) this.onMultiKill(mk.count, mk.tier);
    const others = this.spawner.enemies.filter((o) => o !== e && o.active && !o.dead);
    const next = pickNearest(this.player, others, RUSH.range);
    if (next) this.rush.offer(next, now);
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
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, 'GAME OVER', { fontFamily: 'monospace', fontSize: '64px', fontStyle: 'bold', color: '#ff4466', stroke: '#000', strokeThickness: 8 })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, `STAGE ${this.run.stage}  SCORE ${this.score.total.toLocaleString()}  MAX COMBO ${this.combo.max}   Press R to restart`, { fontFamily: 'monospace', fontSize: '18px', color: '#fff' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200);
    this.input.keyboard!.once('keydown-R', () => this.scene.start('Game', {}));
  }
}
