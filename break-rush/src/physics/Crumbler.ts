import { Box } from './Controller';
import { MOVE } from './config';

/** Makes `crumble` boxes drop out of the world shortly after the player stands on them. */
export class Crumbler {
  private timers = new Map<Box, number>();
  /** Boxes that have fallen (ghost = true) and how long ago, for rendering. */
  fallen = new Map<Box, number>();

  /** Call every physics step with the box the player stands on (or null). */
  update(dt: number, standing: Box | null): void {
    if (standing?.crumble && !standing.ghost && !this.timers.has(standing)) this.timers.set(standing, MOVE.crumbleDelay);
    for (const [b, t] of this.timers) {
      const n = t - dt;
      if (n <= 0) {
        b.ghost = true;
        this.timers.delete(b);
        this.fallen.set(b, 0);
      } else this.timers.set(b, n);
    }
    for (const [b, t] of this.fallen) this.fallen.set(b, t + dt);
  }

  /** 0..1 progress toward collapse (for shaking the tile). */
  progress(b: Box): number {
    const t = this.timers.get(b);
    return t === undefined ? 0 : 1 - t / MOVE.crumbleDelay;
  }

  /** Bring everything back (checkpoint respawn). */
  reset(boxes: Box[]): void {
    this.timers.clear();
    this.fallen.clear();
    for (const b of boxes) if (b.crumble) b.ghost = false;
  }
}
