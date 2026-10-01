/** Movement tuning. Everything the level generator relies on is derived from these numbers. */
export const MOVE = {
  gravity: 30,
  runSpeed: 9.5,
  groundAccel: 80,
  groundFriction: 70,
  airAccel: 24,
  airDrag: 0.4,
  jumpSpeed: 10.2,
  /** Releasing jump early cuts the rise. */
  jumpCut: 0.45,
  coyote: 0.12,
  jumpBuffer: 0.12,
  stepUp: 0.5,
  halfWidth: 0.3,
  height: 1.8,
  slideHeight: 0.9,
  slideSpeed: 12,
  slideDecay: 7,
  slideMinSpeed: 3.2,
  dashSpeed: 27,
  dashTime: 0.2,
  dashCooldown: 0.35,
  wallRunGravity: 2.5,
  wallRunMax: 1.9,
  wallRunSpeed: 10,
  wallJumpAway: 7.5,
  wallJumpAlong: 9,
  wallJumpUp: 10.2,
  wallReattach: 0.25,
  wallProbe: 0.14,
  /** Air dashes available before touching ground or a wall again. */
  dashCharges: 1,
  killY: -30, padSpeed: 19, crumbleDelay: 0.5,
} as const;

/** Flat-ground distance covered by a running jump (feet leave and return to the same height). */
export function jumpRange(speed = MOVE.runSpeed): number {
  return speed * ((2 * MOVE.jumpSpeed) / MOVE.gravity);
}

/** Extra distance a mid-air dash adds. */
export function dashRange(): number {
  return MOVE.dashSpeed * MOVE.dashTime;
}

/** Highest platform a jump can reach. */
export function jumpHeight(): number {
  return (MOVE.jumpSpeed * MOVE.jumpSpeed) / (2 * MOVE.gravity);
}
