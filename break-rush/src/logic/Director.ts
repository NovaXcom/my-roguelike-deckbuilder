import { EnemyKind } from './Enemies';

export const GAME_LENGTH = 480; // seconds until the final boss
export const BOSS_TIMES = [120, 240, 360, GAME_LENGTH];
export const ELITE_EVERY = 28;
export const RING_EVERY = 45;
export const FIRST_RING = 50;

export type SpawnOrder =
  | { type: 'edge'; kind: EnemyKind; elite?: boolean; near?: boolean }
  | { type: 'ring'; kind: EnemyKind; count: number; radius: number };

/** Enemies per second the game tries to throw at the player. */
export function spawnRate(t: number): number {
  return 4.0 + 0.2 * t;
}

export function kindWeights(t: number): Record<EnemyKind, number> {
  return {
    imp: 1,
    runner: t < 40 ? 0 : Math.min(0.7, (t - 40) / 200),
    brute: t < 90 ? 0 : Math.min(0.25, (t - 90) / 600),
  };
}

function pick(rand: () => number, w: Record<EnemyKind, number>): EnemyKind {
  const total = w.imp + w.runner + w.brute;
  let r = rand() * total;
  for (const k of ['imp', 'runner', 'brute'] as const) {
    r -= w[k];
    if (r <= 0) return k;
  }
  return 'imp';
}

/**
 * Decides what to spawn each frame: an instant opening burst (so there is something to hit within a
 * second), a steady stream that ramps up, periodic elites and surrounding horde rings.
 */
export class Director {
  private acc = 0;
  private opened = false;
  private nextElite = 28;
  private nextRing = FIRST_RING;
  private nextBoss = 0;

  constructor(private rand: () => number = Math.random) {}

  update(t: number, dt: number, alive: number, cap: number): SpawnOrder[] {
    const out: SpawnOrder[] = [];
    if (!this.opened && t >= 0.2) {
      this.opened = true;
      for (let i = 0; i < 16; i++) out.push({ type: 'edge', kind: 'imp', near: true });
    }
    this.acc += spawnRate(t) * dt;
    const w = kindWeights(t);
    while (this.acc >= 1) {
      this.acc -= 1;
      if (alive + out.length < cap) out.push({ type: 'edge', kind: pick(this.rand, w) });
    }
    if (t >= this.nextElite) {
      this.nextElite += ELITE_EVERY;
      // more elites at once as the run goes on
      const n = 1 + Math.floor(t / 150);
      for (let i = 0; i < n; i++) out.push({ type: 'edge', kind: t > 90 ? 'brute' : 'imp', elite: true });
    }
    if (t >= this.nextRing) {
      this.nextRing += RING_EVERY;
      out.push({ type: 'ring', kind: t > 100 && this.rand() < 0.4 ? 'runner' : 'imp', count: Math.round(34 + t / 4), radius: 15 });
    }
    return out;
  }

  /** Index of the boss that should appear now, or -1. Consumed once. */
  bossDue(t: number): number {
    if (this.nextBoss < BOSS_TIMES.length && t >= BOSS_TIMES[this.nextBoss]) return this.nextBoss++;
    return -1;
  }

  get bossesSpawned(): number {
    return this.nextBoss;
  }
}
