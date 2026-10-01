import Phaser from 'phaser';
import { ATTACK_STEPS, DODGE, PLAYER, RUSH } from '../config';
import { Health, Rect, applyDamage, isDead } from '../combat/DamageSystem';
import { AttackState, attackHitbox, canAttack, isAttackActive, newAttackState, startAttack } from './PlayerAttack';
import { DodgeState, canDodge, consumeCounter, counterReady, isDodging, newDodgeState, startDodge } from './Dodge';
import { BASE_STATS, PlayerStats } from '../systems/UpgradeSystem';
import { afterImage, dust } from '../effects/HitEffect';

export interface RushTarget {
  x: number;
  y: number;
  active: boolean;
}

export class Player extends Phaser.Physics.Arcade.Sprite implements Health {
  hp = PLAYER.maxHp;
  maxHp = PLAYER.maxHp;
  facing: 1 | -1 = 1;
  readonly attack: AttackState = newAttackState();
  readonly dodge: DodgeState = newDodgeState();
  stats: PlayerStats = BASE_STATS;
  /** Where auto-aim should look: enemy positions. Set by the scene. */
  targets: () => Array<{ x: number; y: number }> = () => [];
  private wasGrounded = true;
  private nextDustAt = 0;
  private invulnUntil = 0;
  private moveLockUntil = 0;
  private dodgeActive = false;
  private nextGhostAt = 0;
  private rushTarget: RushTarget | null = null;
  private rushEndAt = 0;
  private rushArrive: (() => void) | null = null;
  private keys: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    jump: Phaser.Input.Keyboard.Key;
    attack: Phaser.Input.Keyboard.Key;
    dash: Phaser.Input.Keyboard.Key;
  };
  private slash: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    this.setGravityY(PLAYER.gravity);

    const kb = scene.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      left: kb.addKey(K.LEFT),
      right: kb.addKey(K.RIGHT),
      a: kb.addKey(K.A),
      d: kb.addKey(K.D),
      jump: kb.addKey(K.SPACE),
      attack: kb.addKey(K.J),
      dash: kb.addKey(K.SHIFT),
    };
    this.slash = scene.add.rectangle(0, 0, 70, 50, 0xffee88, 0).setVisible(false).setDepth(30);
  }

  get dead(): boolean {
    return isDead(this);
  }

  get hitbox(): Rect {
    return attackHitbox(this.x, this.y, this.facing, ATTACK_STEPS[this.attack.step].range);
  }

  get attacking(): boolean {
    return isAttackActive(this.attack, this.scene.time.now);
  }

  get rushing(): boolean {
    return this.rushTarget !== null;
  }

  /** True once per Shift press. The scene decides whether it means RUSH or dodge. */
  dashPressed(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.keys.dash);
  }

  /** Returns true if damage was taken (i.e. not invulnerable). */
  takeDamage(amount: number, fromX: number): boolean {
    const now = this.scene.time.now;
    if (now < this.invulnUntil || this.dead) return false;
    applyDamage(this, amount);
    this.invulnUntil = now + PLAYER.invulnMs;
    this.moveLockUntil = now + 200;
    this.endDodge();
    this.setVelocity(Math.sign(this.x - fromX) * 260, -250);
    return true;
  }

  tryDodge(): boolean {
    const now = this.scene.time.now;
    if (this.rushing || this.dead || !canDodge(this.dodge, now)) return false;
    const left = this.keys.left.isDown || this.keys.a.isDown;
    const right = this.keys.right.isDown || this.keys.d.isDown;
    if (left !== right) this.facing = left ? -1 : 1;
    startDodge(this.dodge, now);
    this.invulnUntil = Math.max(this.invulnUntil, now + DODGE.invulnMs);
    this.dodgeActive = true;
    (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    this.setVelocity(this.facing * DODGE.speed, 0);
    dust(this.scene, this.x, this.y + 24, 8);
    return true;
  }

  startRush(target: RushTarget, onArrive: () => void): void {
    const now = this.scene.time.now;
    this.endDodge();
    this.rushTarget = target;
    this.rushArrive = onArrive;
    this.rushEndAt = now + RUSH.maxMs;
    this.invulnUntil = Math.max(this.invulnUntil, now + RUSH.maxMs + 150);
    (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
  }

  update(): void {
    const now = this.scene.time.now;
    if (this.dead) {
      this.setVelocityX(0);
      this.slash.setVisible(false);
      return;
    }
    if (this.rushing) {
      this.updateRush(now);
      return;
    }

    const body = this.body as Phaser.Physics.Arcade.Body;
    const dodging = isDodging(this.dodge, now);
    if (this.dodgeActive && !dodging) this.endDodge();

    if (dodging) {
      this.ghost(now);
    } else if (now >= this.moveLockUntil) {
      const left = this.keys.left.isDown || this.keys.a.isDown;
      const right = this.keys.right.isDown || this.keys.d.isDown;
      if (left === right) this.setVelocityX(0);
      else {
        this.setVelocityX((left ? -1 : 1) * PLAYER.speed * this.stats.speedMult);
        this.facing = left ? -1 : 1;
      }
    }
    this.setFlipX(this.facing === -1);

    if (!dodging && Phaser.Input.Keyboard.JustDown(this.keys.jump) && body.blocked.down) {
      this.setVelocityY(PLAYER.jumpVelocity);
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.attack) && canAttack(this.attack, now)) {
      const counter = counterReady(this.dodge, now);
      if (counter) {
        consumeCounter(this.dodge);
        this.endDodge();
      }
      startAttack(this.attack, now, counter);
      this.lungeAtTarget(now, ATTACK_STEPS[this.attack.step].lunge * (counter ? 1.5 : 1));
      this.emit('attack', this.attack.step, counter);
    }

    const hb = this.hitbox;
    this.slash.setPosition(hb.x + hb.w / 2, hb.y + hb.h / 2).setDisplaySize(hb.w, hb.h);
    this.animate(now, dodging, body);

    if (dodging) this.setAlpha(0.5);
    else this.setAlpha(now < this.invulnUntil ? (Math.floor(now / 80) % 2 ? 0.4 : 1) : 1);
  }

  /** Auto-aim: step toward the nearest enemy in front so swings connect instead of whiffing. */
  private lungeAtTarget(now: number, baseLunge: number): void {
    let best: { x: number; y: number } | null = null;
    let bestD = 260;
    for (const t of this.targets()) {
      const d = Math.abs(t.x - this.x);
      if (d < bestD && Math.abs(t.y - this.y) < 110) {
        best = t;
        bestD = d;
      }
    }
    let speed = baseLunge;
    if (best) {
      this.facing = best.x >= this.x ? 1 : -1;
      // close the gap to ~50px over the 110ms lock
      speed = bestD > 55 ? Math.min(680, Math.max(baseLunge, (bestD - 50) * 9)) : baseLunge * 0.35;
    }
    this.setVelocityX(this.facing * speed);
    this.moveLockUntil = now + 110;
  }

  /** Lean / dust feedback. Rotation only: scaling would resize the physics body. */
  private animate(now: number, dodging: boolean, body: Phaser.Physics.Arcade.Body): void {
    const grounded = body.blocked.down;
    if (grounded && !this.wasGrounded) dust(this.scene, this.x, this.y + 24, 7);
    this.wasGrounded = grounded;

    const moving = Math.abs(body.velocity.x) > 40;
    if (grounded && moving && !dodging && now >= this.nextDustAt) {
      this.nextDustAt = now + 140;
      dust(this.scene, this.x - this.facing * 8, this.y + 24, 2);
    }
    let lean = moving ? 6 : 0;
    if (this.attacking) lean = this.attack.step === ATTACK_STEPS.length - 1 ? 20 : 12;
    if (dodging) lean = 24;
    if (!grounded) lean += body.velocity.y < 0 ? -4 : 4;
    this.setAngle(Phaser.Math.Linear(this.angle, this.facing * lean, 0.35));
  }

  /** Knocked back by a blocked hit. */
  recoil(vx: number): void {
    this.setVelocityX(vx);
    this.moveLockUntil = this.scene.time.now + 90;
  }

  private updateRush(now: number): void {
    const t = this.rushTarget!;
    this.slash.setVisible(false);
    if (!t.active) return this.finishRush(false);
    const dx = t.x - this.x;
    const dy = t.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= RUSH.arriveDist) return this.finishRush(true);
    if (now >= this.rushEndAt) return this.finishRush(false);
    this.facing = dx >= 0 ? 1 : -1;
    this.setFlipX(this.facing === -1);
    this.setVelocity((dx / dist) * RUSH.speed, (dy / dist) * RUSH.speed);
    this.setAlpha(0.6);
    this.ghost(now);
  }

  private finishRush(arrived: boolean): void {
    const cb = this.rushArrive;
    this.rushTarget = null;
    this.rushArrive = null;
    (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);
    this.setVelocity(0, 0);
    this.setAlpha(1);
    this.invulnUntil = Math.max(this.invulnUntil, this.scene.time.now + 250);
    if (arrived && cb) cb();
  }

  private endDodge(): void {
    if (!this.dodgeActive) return;
    this.dodgeActive = false;
    this.dodge.activeUntil = 0;
    (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);
  }

  private ghost(now: number): void {
    if (now < this.nextGhostAt) return;
    this.nextGhostAt = now + 35;
    afterImage(this.scene, this.x, this.y, 32, 48, 0x4aa8ff);
  }
}
