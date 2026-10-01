import Phaser from 'phaser';
import { ATTACK_STEPS, DODGE, GAME_HEIGHT, GAME_WIDTH, GROUND_Y, RUSH, WORLD_WIDTH } from '../config';
import { Player } from '../player/Player';
import { HUD } from '../ui/HUD';
import { ComboDisplay } from '../ui/ComboDisplay';
import { EnemyBars } from '../ui/EnemyBars';
import { RushMarker } from '../ui/RushMarker';
import { EnemySpawner } from '../systems/EnemySpawner';
import { Enemy } from '../enemies/Enemy';
import { calcDamage, rectsOverlap } from '../combat/DamageSystem';
import { ComboSystem } from '../combat/ComboSystem';
import { HitStop } from '../combat/HitStop';
import { RushSystem, pickNearest } from '../combat/RushSystem';
import { spawnDamageNumber } from '../effects/DamageNumber';
import { burst, deathEffect } from '../effects/HitEffect';

interface HitOptions {
  baseDamage: number;
  breakDamage: number;
  knockback: number;
  hitStopMs: number;
  shake: number;
  counter?: boolean;
  color: number;
}

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private hud!: HUD;
  private comboDisplay!: ComboDisplay;
  private enemyBars!: EnemyBars;
  private rushMarker!: RushMarker;
  private spawner!: EnemySpawner;
  private combo = new ComboSystem();
  private hitStop = new HitStop();
  private rush = new RushSystem<Enemy>();
  private physicsFrozen = false;
  private gameOverShown = false;

  constructor() {
    super('Game');
  }

  create(): void {
    this.gameOverShown = false;
    this.physicsFrozen = false;
    this.combo = new ComboSystem();
    this.hitStop = new HitStop();
    this.rush = new RushSystem<Enemy>();
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, GAME_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, GAME_HEIGHT);
    this.cameras.main.setBackgroundColor(0x12121f);

    this.add.tileSprite(WORLD_WIDTH / 2, GROUND_Y + (GAME_HEIGHT - GROUND_Y) / 2, WORLD_WIDTH, GAME_HEIGHT - GROUND_Y, 'ground');
    const ground = this.add.rectangle(WORLD_WIDTH / 2, GROUND_Y + 30, WORLD_WIDTH, 60, 0x000000, 0);
    this.physics.add.existing(ground, true);

    this.player = new Player(this, 300, GROUND_Y - 60);
    this.spawner = new EnemySpawner(this, this.player);
    this.hud = new HUD(this, this.player);
    this.comboDisplay = new ComboDisplay(this);
    this.enemyBars = new EnemyBars(this);
    this.rushMarker = new RushMarker(this);

    this.physics.add.collider(this.player, ground);
    this.physics.add.collider(this.spawner.group, ground);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.add
      .text(GAME_WIDTH / 2, 20, 'A/D: Move  Space: Jump  J: Attack (x3 combo)  Shift: Dodge / RUSH', { fontFamily: 'monospace', fontSize: '14px', color: '#aab' })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(100);
  }

  update(): void {
    const now = this.time.now;

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

    if (!this.player.dead && !this.player.rushing && this.player.dashPressed()) this.handleDash(now);
    this.player.update();
    this.spawner.update();

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

      if (!e.disabled && now >= e.nextContactAt && this.physics.overlap(this.player, e)) {
        if (this.player.takeDamage(e.contactDamage, e.x)) {
          e.nextContactAt = now + e.contactCooldown;
          spawnDamageNumber(this, this.player.x, this.player.y - 40, e.contactDamage, '#ff6666');
          this.cameras.main.shake(100, 0.004);
        }
      }
    }

    this.updateUI(now);
    if (this.player.dead && !this.gameOverShown) this.showGameOver();
  }

  private handleDash(now: number): void {
    const target = this.rush.available(now) ? this.rush.target : null;
    if (target && target.active && !target.dead) {
      this.rush.clear();
      spawnDamageNumber(this, this.player.x, this.player.y - 50, 'RUSH!', '#44ffee', 26);
      this.player.startRush(target, () => this.onRushArrive(target));
    } else {
      this.player.tryDodge();
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
    });
  }

  private onRushArrive(e: Enemy): void {
    if (!e.active || e.dead) return;
    this.hitEnemy(e, {
      baseDamage: RUSH.damage,
      breakDamage: RUSH.breakDamage,
      knockback: RUSH.knockback,
      hitStopMs: RUSH.hitStopMs,
      shake: 0.008,
      color: 0x44ffee,
    });
  }

  /** Shared hit pipeline: damage calc, combo, feedback, break and kill handling. */
  private hitEnemy(e: Enemy, o: HitOptions): void {
    const now = this.time.now;
    const dmg = calcDamage(o.baseDamage, { comboHits: this.combo.current(now), broken: e.broken, counter: !!o.counter });
    const res = e.takeHit({ damage: dmg, breakDamage: o.breakDamage, knockbackX: this.player.facing * o.knockback });
    this.combo.add(now);

    spawnDamageNumber(this, e.x, e.y - 30, res.dealt, e.broken || res.justBroken ? '#ff9933' : '#ffee88');
    burst(this, e.x, e.y, o.color, 6 + Math.round(o.hitStopMs / 10), 60 + o.hitStopMs);
    this.hitStop.trigger(now, o.hitStopMs);
    this.cameras.main.shake(80, o.shake);

    if (res.justBroken) {
      spawnDamageNumber(this, e.x, e.y - 70, 'BREAK!!', '#ffcc00', 30);
      burst(this, e.x, e.y, 0xffcc00, 16, 140);
      this.hitStop.trigger(now, 100);
      this.cameras.main.shake(150, 0.008);
    }
    if (e.dead) this.killEnemy(e, now);
  }

  private killEnemy(e: Enemy, now: number): void {
    deathEffect(this, e.x, e.y);
    this.hitStop.trigger(now, 60);
    const others = this.spawner.enemies.filter((o) => o !== e && o.active && !o.dead);
    const next = pickNearest(this.player, others, RUSH.range);
    if (next) this.rush.offer(next, now);
    e.destroy();
  }

  private updateUI(now: number): void {
    this.hud.update();
    this.comboDisplay.update(this.combo.current(now), this.combo.remainingRatio(now));
    this.enemyBars.update(this.spawner.enemies, now);
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
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, `MAX COMBO ${this.combo.max}   Press R to restart`, { fontFamily: 'monospace', fontSize: '20px', color: '#fff' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200);
    this.input.keyboard!.once('keydown-R', () => this.scene.restart());
  }
}
