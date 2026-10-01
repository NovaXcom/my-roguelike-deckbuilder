import Phaser from 'phaser';
import { ATTACK_STEPS, DODGE, PLAYER, RUSH } from '../config';
import { Health, Rect, applyDamage, isDead } from '../combat/DamageSystem';
import { AttackState, attackHitbox, canAttack, isAttackActive, newAttackState, startAttack } from './PlayerAttack';
import { DodgeState, canDodge, consumeCounter, counterReady, isDodging, newDodgeState, startDodge } from './Dodge';
import { afterImage } from '../effects/HitEffect';

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
    this.slash = scene.add.rectangle(0, 0, 70, 50, 0xffee88, 0.6).setVisible(false).setDepth(30);
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
        this.setVelocityX(left ? -PLAYER.speed : PLAYER.speed);
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
      const lunge = ATTACK_STEPS[this.attack.step].lunge * (counter ? 1.5 : 1);
      this.setVelocityX(this.facing * lunge);
      this.emit('attack', this.attack.step, counter);
      this.moveLockUntil = now + 110;
    }

    const hb = this.hitbox;
    this.slash
      .setVisible(this.attacking)
      .setPosition(hb.x + hb.w / 2, hb.y + hb.h / 2)
      .setDisplaySize(hb.w, hb.h)
      .setFillStyle(this.attack.counter ? 0xff8844 : this.attack.step === ATTACK_STEPS.length - 1 ? 0xffffff : 0xffee88, 0.6);

    if (dodging) this.setAlpha(0.5);
    else this.setAlpha(now < this.invulnUntil ? (Math.floor(now / 80) % 2 ? 0.4 : 1) : 1);
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
