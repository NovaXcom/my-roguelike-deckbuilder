export interface MeleeTiming {
  windupMs: number;
  activeMs: number;
  recoverMs: number;
  cooldownMs: [number, number];
}

export type MeleePhase = 'approach' | 'windup' | 'active' | 'recover';

/**
 * Pure attack cycle for melee enemies: approach -> windup (telegraph) -> active (hits) -> recover
 * (vulnerable) -> approach. Movement/positioning is decided by the enemy; this only owns timing.
 */
export class MeleeBrain {
  phase: MeleePhase = 'approach';
  private until = 0;
  private readyAt: number;

  constructor(private t: MeleeTiming, private rand: () => number = Math.random, startAt = 0, initialDelayMs = 0) {
    this.readyAt = startAt + initialDelayMs;
  }

  /** Cooldown over and idle: may begin an attack. */
  ready(now: number): boolean {
    return this.phase === 'approach' && now >= this.readyAt;
  }

  start(now: number): boolean {
    if (!this.ready(now)) return false;
    this.phase = 'windup';
    this.until = now + this.t.windupMs;
    return true;
  }

  /** Advances timed phases. Returns the phase that just began, or null. */
  update(now: number): MeleePhase | null {
    if (this.phase === 'approach' || now < this.until) return null;
    switch (this.phase) {
      case 'windup':
        this.phase = 'active';
        this.until = now + this.t.activeMs;
        break;
      case 'active':
        this.phase = 'recover';
        this.until = now + this.t.recoverMs;
        break;
      case 'recover': {
        this.phase = 'approach';
        const [lo, hi] = this.t.cooldownMs;
        this.readyAt = now + lo + this.rand() * (hi - lo);
        break;
      }
    }
    return this.phase;
  }

  /** Flinch: a hit cancels whatever the enemy was doing and delays its next attack. */
  interrupt(now: number, staggerMs = 500): boolean {
    if (this.phase === 'approach') return false;
    this.phase = 'approach';
    this.readyAt = now + staggerMs;
    return true;
  }
}
