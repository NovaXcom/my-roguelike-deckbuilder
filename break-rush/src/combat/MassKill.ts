import { MULTIKILL } from '../config';

/** 0 = no multi-kill, 1..n = increasing tiers. */
export function multiKillTier(count: number): number {
  let tier = 0;
  MULTIKILL.tiers.forEach((t, i) => {
    if (count >= t) tier = i + 1;
  });
  return tier;
}

export interface KillRecord {
  count: number;
  tier: number;
  tierUp: boolean;
}

/** Counts kills inside a rolling window; flags when a higher tier is reached. */
export class MassKillTracker {
  private times: number[] = [];
  private tier = 0;

  record(now: number): KillRecord {
    this.times = this.times.filter((t) => now - t < MULTIKILL.windowMs);
    if (this.times.length === 0) this.tier = 0;
    this.times.push(now);
    const count = this.times.length;
    const tier = multiKillTier(count);
    const tierUp = tier > this.tier;
    this.tier = Math.max(this.tier, tier);
    return { count, tier, tierUp };
  }
}
