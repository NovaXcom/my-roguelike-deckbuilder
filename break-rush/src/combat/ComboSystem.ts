import { COMBO } from '../config';

export class ComboSystem {
  max = 0;
  private hits = 0;
  private expireAt = 0;

  /** Current combo; 0 once the window has lapsed. */
  current(now: number): number {
    return now >= this.expireAt ? 0 : this.hits;
  }

  add(now: number, n = 1): number {
    this.hits = this.current(now) + n;
    this.expireAt = now + COMBO.windowMs;
    this.max = Math.max(this.max, this.hits);
    return this.hits;
  }

  /** 1 → 0 as the combo timer runs out. */
  remainingRatio(now: number): number {
    if (this.current(now) === 0) return 0;
    return (this.expireAt - now) / COMBO.windowMs;
  }

  reset(): void {
    this.hits = 0;
    this.expireAt = 0;
  }
}
