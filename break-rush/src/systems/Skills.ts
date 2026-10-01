/** Cooldown timer for an active skill. */
export class Cooldown {
  private readyAt = 0;

  constructor(readonly baseMs: number) {}

  ready(now: number): boolean {
    return now >= this.readyAt;
  }

  /** Starts the cooldown; `mult` < 1 = shorter (cooldown-reduction relics). */
  use(now: number, mult = 1): void {
    this.readyAt = now + this.baseMs * mult;
  }

  /** 1 = ready, 0 = just used. */
  progress(now: number, mult = 1): number {
    const total = this.baseMs * mult;
    return Math.min(1, Math.max(0, 1 - (this.readyAt - now) / total));
  }
}

export const ULT_MAX = 100;

/** Charge meter for the ultimate. */
export class UltGauge {
  constructor(public value = 0, readonly max = ULT_MAX) {}

  gain(amount: number, mult = 1): void {
    this.value = Math.min(this.max, this.value + Math.max(0, amount) * mult);
  }

  get ready(): boolean {
    return this.value >= this.max;
  }

  /** Spends the full gauge. Returns false if not ready. */
  consume(): boolean {
    if (!this.ready) return false;
    this.value = 0;
    return true;
  }
}

export const ULT_GAIN = { hit: 1.4, kill: 5, hurt: 4 };
