import { BREAK } from '../config';

export interface BreakState {
  gauge: number;
  max: number;
  brokenUntil: number;
}

export function createBreak(max: number): BreakState {
  return { gauge: max, max, brokenUntil: 0 };
}

export function isBroken(s: BreakState, now: number): boolean {
  return now < s.brokenUntil;
}

/** Refills the gauge once the broken period has ended. Call every frame. */
export function updateBreak(s: BreakState, now: number): void {
  if (s.brokenUntil > 0 && now >= s.brokenUntil) {
    s.gauge = s.max;
    s.brokenUntil = 0;
  }
}

/** Returns true only on the hit that breaks the enemy. */
export function applyBreakDamage(s: BreakState, amount: number, now: number): boolean {
  updateBreak(s, now);
  if (isBroken(s, now)) return false;
  s.gauge = Math.max(0, s.gauge - Math.max(0, amount));
  if (s.gauge > 0) return false;
  s.brokenUntil = now + BREAK.durationMs;
  return true;
}

/** Gauge ratio for UI. While broken it shows the remaining broken time instead. */
export function breakRatio(s: BreakState, now: number): number {
  if (isBroken(s, now)) return (s.brokenUntil - now) / BREAK.durationMs;
  return s.gauge / s.max;
}
