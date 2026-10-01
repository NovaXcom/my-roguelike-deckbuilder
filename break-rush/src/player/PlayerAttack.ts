import { PLAYER } from '../config';
import { Rect } from '../combat/DamageSystem';

export interface AttackState {
  activeUntil: number;
  readyAt: number;
  hitIds: Set<unknown>;
}

export function newAttackState(): AttackState {
  return { activeUntil: 0, readyAt: 0, hitIds: new Set() };
}

export function canAttack(s: AttackState, now: number): boolean {
  return now >= s.readyAt;
}

export function startAttack(s: AttackState, now: number): void {
  s.activeUntil = now + PLAYER.attackDuration;
  s.readyAt = now + PLAYER.attackCooldown;
  s.hitIds.clear();
}

export function isAttackActive(s: AttackState, now: number): boolean {
  return now < s.activeUntil;
}

/** Hitbox in front of the player. facing: 1 = right, -1 = left. */
export function attackHitbox(cx: number, cy: number, facing: 1 | -1): Rect {
  const w = PLAYER.attackRange;
  const h = 50;
  const x = facing === 1 ? cx + 12 : cx - 12 - w;
  return { x, y: cy - h / 2, w, h };
}
