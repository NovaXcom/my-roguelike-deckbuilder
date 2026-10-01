import { DODGE } from '../config';

export interface DodgeState {
  activeUntil: number;
  readyAt: number;
  counterUntil: number;
}

export function newDodgeState(): DodgeState {
  return { activeUntil: 0, readyAt: 0, counterUntil: 0 };
}

export function canDodge(s: DodgeState, now: number): boolean {
  return now >= s.readyAt;
}

export function startDodge(s: DodgeState, now: number): void {
  s.activeUntil = now + DODGE.durationMs;
  s.readyAt = now + DODGE.cooldownMs;
  s.counterUntil = s.activeUntil + DODGE.counterWindowMs;
}

export function isDodging(s: DodgeState, now: number): boolean {
  return now < s.activeUntil;
}

/** True from dodge start until the counter window after it closes. */
export function counterReady(s: DodgeState, now: number): boolean {
  return now < s.counterUntil;
}

/** Ends the dodge early and uses up the counter window. */
export function consumeCounter(s: DodgeState): void {
  s.counterUntil = 0;
  s.activeUntil = 0;
}
