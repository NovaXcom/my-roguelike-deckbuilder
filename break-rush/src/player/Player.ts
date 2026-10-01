import Phaser from 'phaser';
import { PLAYER } from '../config';
import { Health, applyDamage, isDead } from '../combat/DamageSystem';
import { AttackState, attackHitbox, canAttack, isAttackActive, newAttackState, startAttack } from './PlayerAttack';
import { Rect } from '../combat/DamageSystem';

export class Player extends Phaser.Physics.Arcade.Sprite implements Health {
  hp = PLAYER.maxHp;
  maxHp = PLAYER.maxHp;
  facing: 1 | -1 = 1;
  readonly attack: AttackState = newAttackState();
  private invulnUntil = 0;
  private keys: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    jump: Phaser.Input.Keyboard.Key;
    attack: Phaser.Input.Keyboard.Key;
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
    };
    this.slash = scene.add.rectangle(0, 0, PLAYER.attackRange, 50, 0xffee88, 0.6).setVisible(false).setDepth(30);
  }

  get dead(): boolean {
    return isDead(this);
  }

  get hitbox(): Rect {
    return attackHitbox(this.x, this.y, this.facing);
  }

  get attacking(): boolean {
    return isAttackActive(this.attack, this.scene.time.now);
  }

  /** Returns true if damage was taken (i.e. not invulnerable). */
  takeDamage(amount: number, fromX: number): boolean {
    const now = this.scene.time.now;
    if (now < this.invulnUntil || this.dead) return false;
    applyDamage(this, amount);
    this.invulnUntil = now + PLAYER.invulnMs;
    this.setVelocity(Math.sign(this.x - fromX) * 260, -250);
    return true;
  }

  update(): void {
    const now = this.scene.time.now;
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (this.dead) {
      this.setVelocityX(0);
      this.slash.setVisible(false);
      return;
    }

    const left = this.keys.left.isDown || this.keys.a.isDown;
    const right = this.keys.right.isDown || this.keys.d.isDown;
    // Don't override knockback right after being hit
    const hurt = now < this.invulnUntil - (PLAYER.invulnMs - 200);
    if (!hurt) {
      if (left === right) this.setVelocityX(0);
      else {
        this.setVelocityX(left ? -PLAYER.speed : PLAYER.speed);
        this.facing = left ? -1 : 1;
      }
    }
    this.setFlipX(this.facing === -1);

    if (Phaser.Input.Keyboard.JustDown(this.keys.jump) && body.blocked.down) {
      this.setVelocityY(PLAYER.jumpVelocity);
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.attack) && canAttack(this.attack, now)) {
      startAttack(this.attack, now);
    }

    const hb = this.hitbox;
    this.slash.setVisible(this.attacking).setPosition(hb.x + hb.w / 2, hb.y + hb.h / 2);

    // Blink while invulnerable
    this.setAlpha(now < this.invulnUntil ? (Math.floor(now / 80) % 2 ? 0.4 : 1) : 1);
  }
}
