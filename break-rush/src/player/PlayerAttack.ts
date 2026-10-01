import { ATTACK_STEPS, CHAIN_WINDOW_MS } from '../config';
import { Rect } from '../combat/DamageSystem';

export interface AttackState {
  step: number;
  activeUntil: number;
  readyAt: number;
  chainUntil: number;
  counter: boolean;
  hitIds: Set<unknown>;
}

export function newAttackState(): AttackState {
  return { step: 0, activeUntil: 0, readyAt: 0, chainUntil: 0, counter: false, hitIds: new Set() };
}

export function canAttack(s: AttackState, now: number): boolean {
  return now >= s.readyAt;
}

/** Advances the 3-hit chain if pressed inside the chain window, otherwise restarts at step 0. */
export function startAttack(s: AttackState, now: number, counter = false): void {
  s.step = now < s.chainUntil ? (s.step + 1) % ATTACK_STEPS.length : 0;
  const cfg = ATTACK_STEPS[s.step];
  s.activeUntil = now + cfg.durationMs;
  s.readyAt = now + cfg.cooldownMs;
  s.chainUntil = s.readyAt + CHAIN_WINDOW_MS;
  s.counter = counter;
  s.hitIds.clear();
}

export function isAttackActive(s: AttackState, now: number): boolean {
  return now < s.activeUntil;
}

/** Hitbox in front of the player. facing: 1 = right, -1 = left. */
export function attackHitbox(cx: number, cy: number, facing: 1 | -1, range: number): Rect {
  const h = 50;
  const x = facing === 1 ? cx + 12 : cx - 12 - range;
  return { x, y: cy - h / 2, w: range, h };
}
