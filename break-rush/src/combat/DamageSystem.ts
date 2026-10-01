/** Pure combat helpers (no Phaser dependency) so they stay easy to extend/test. */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Health {
  hp: number;
  maxHp: number;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Applies damage, clamping at 0. Returns the amount actually dealt. */
export function applyDamage(target: Health, amount: number): number {
  const dealt = Math.min(Math.max(0, amount), target.hp);
  target.hp -= dealt;
  return dealt;
}

export function isDead(target: Health): boolean {
  return target.hp <= 0;
}
