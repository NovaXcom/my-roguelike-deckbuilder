import Phaser from 'phaser';
import { BOSS } from '../config';
import { Enemy, HitInfo, HitResult } from './Enemy';
import { BossAI, isEnraged } from './BossAI';

/**
 * First boss. Emits 'windup' | 'attack' | 'recover' | 'idle' (attack, durationMs) as its
 * attack cycle advances; the scene reacts to 'attack' for slam/missile and 'windup' for telegraphs.
 */
export class IronBeast extends Enemy {
  readonly speed = BOSS.walkSpeed;
  readonly contactCooldown = 900;
  readonly brain: BossAI;
  private chargeDir: 1 | -1 = 1;

  constructor(scene: Phaser.Scene, x: number, y: number, hpScale = 1) {
    super(scene, x, y, 'boss', Math.round(BOSS.maxHp * hpScale), Math.round(BOSS.maxBreak * hpScale));
    this.setCollideWorldBounds(true);
    this.brain = new BossAI(Math.random, scene.time.now);
  }

  get contactDamage(): number {
    return this.brain.phase === 'attack' && this.brain.attack === 'charge' ? BOSS.chargeDamage : BOSS.contactDamage;
  }

  get enraged(): boolean {
    return isEnraged(this.hp / this.maxHp);
  }

  /** Too heavy to flinch or be launched; only a break stops it. */
  override takeHit(info: HitInfo): HitResult {
    return super.takeHit({ ...info, knockbackX: info.knockbackX * 0.08, knockbackY: 0, stunMs: 0 });
  }

  override tick(target: Phaser.GameObjects.Components.Transform): void {
    super.tick(target);
    if (this.disabled) this.brain.interrupt(this.scene.time.now);
  }

  protected ai(target: Phaser.GameObjects.Components.Transform): void {
    const now = this.scene.time.now;
    const dir: 1 | -1 = target.x >= this.x ? 1 : -1;
    const ev = this.brain.update(now, this.hp / this.maxHp);
    if (ev) {
      if (ev.type === 'windup') this.chargeDir = dir;
      this.emit(ev.type, ev.attack, ev.durationMs);
    }

    const { phase, attack } = this.brain;
    if (phase === 'idle') {
      this.setVelocityX(dir * this.speed * (this.enraged ? 1.6 : 1));
      this.setFlipX(dir < 0);
    } else if (phase === 'attack' && attack === 'charge') {
      this.setVelocityX(this.chargeDir * BOSS.chargeSpeed * (this.enraged ? 1.2 : 1));
      this.setFlipX(this.chargeDir < 0);
    } else {
      this.setVelocityX(0);
      if (phase === 'windup') {
        this.setFlipX(dir < 0);
        // Telegraph: pulse red unless a hit flash is showing
        if (now >= this.flashUntil) this.setTint(Math.floor(now / 90) % 2 ? 0xff5555 : 0xffaaaa);
      }
    }
  }
}
