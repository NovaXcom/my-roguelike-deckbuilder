import { COMBO, COMBO_MILESTONES } from '../config';

export class ComboSystem {
  max = 0;
  /** Extra combo time from upgrades. */
  windowBonusMs = 0;
  private hits = 0;
  private expireAt = 0;

  /** Effective combo window (difficulty can shorten it, but never below the minimum). */
  get window(): number {
    return Math.max(COMBO.minWindowMs, COMBO.windowMs + this.windowBonusMs);
  }

  /** Current combo; 0 once the window has lapsed. */
  current(now: number): number {
    return now >= this.expireAt ? 0 : this.hits;
  }

  add(now: number, n = 1): number {
    this.hits = this.current(now) + n;
    this.expireAt = now + this.window;
    this.max = Math.max(this.max, this.hits);
    return this.hits;
  }

  /** 1 → 0 as the combo timer runs out. */
  remainingRatio(now: number): number {
    if (this.current(now) === 0) return 0;
    return (this.expireAt - now) / this.window;
  }

  reset(): void {
    this.hits = 0;
    this.expireAt = 0;
  }
}

/** Highest milestone passed when the combo goes prev -> next, or null. */
export function milestoneCrossed(prev: number, next: number): number | null {
  let hit: number | null = null;
  for (const m of COMBO_MILESTONES) if (prev < m && next >= m) hit = m;
  return hit;
}
