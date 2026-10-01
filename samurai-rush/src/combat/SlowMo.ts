/** Time-scale request window. scale < 1 slows the game. Uses the same clock as the caller. */
export class SlowMo {
  private until = 0;
  private value = 1;

  trigger(now: number, ms: number, scale: number): void {
    this.value = now < this.until ? Math.min(this.value, scale) : scale;
    this.until = Math.max(this.until, now + ms);
  }

  scale(now: number): number {
    return now < this.until ? this.value : 1;
  }
}
