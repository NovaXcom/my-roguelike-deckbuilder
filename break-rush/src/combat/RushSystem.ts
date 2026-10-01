import { RUSH } from '../config';

/** Holds the RUSH target offered after a kill, for a limited window. */
export class RushSystem<T> {
  target: T | null = null;
  private expireAt = 0;

  offer(target: T, now: number): void {
    this.target = target;
    this.expireAt = now + RUSH.windowMs;
  }

  available(now: number): boolean {
    return this.target !== null && now < this.expireAt;
  }

  clear(): void {
    this.target = null;
  }
}

export function pickNearest<T extends { x: number; y: number }>(from: { x: number; y: number }, candidates: T[], range: number): T | null {
  let best: T | null = null;
  let bestD = range;
  for (const c of candidates) {
    const d = Math.hypot(c.x - from.x, c.y - from.y);
    if (d <= bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}
