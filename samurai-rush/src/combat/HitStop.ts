/** Tracks a freeze window. The scene skips its simulation while active(). */
export class HitStop {
  private until = 0;

  trigger(now: number, ms: number): void {
    this.until = Math.max(this.until, now + ms);
  }

  active(now: number): boolean {
    return now < this.until;
  }
}
