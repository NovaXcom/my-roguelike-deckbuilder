export interface LevelState {
  level: number;
  xp: number;
}

/** XP needed for the next level. Tuned so the first level-up lands within seconds, then keeps coming. */
export function xpToNext(level: number): number {
  const n = level - 1;
  return Math.round(3 + 3.2 * n + 1.0 * n * n);
}

/** Adds XP (mutates). Returns the number of levels gained. */
export function addXp(s: LevelState, amount: number): number {
  s.xp += Math.max(0, amount);
  let gained = 0;
  while (s.xp >= xpToNext(s.level)) {
    s.xp -= xpToNext(s.level);
    s.level++;
    gained++;
  }
  return gained;
}

export interface Callout {
  at: number;
  text: string;
  color: string;
  /** Bonus coins for reaching it. */
  coins: number;
}

export const CALLOUTS: Callout[] = [
  { at: 10, text: 'NICE!', color: '#ffffff', coins: 0 },
  { at: 25, text: 'GREAT!', color: '#7af0ff', coins: 3 },
  { at: 50, text: 'AWESOME!', color: '#9dff7a', coins: 6 },
  { at: 100, text: 'INSANE!!', color: '#ffe066', coins: 12 },
  { at: 200, text: 'GODLIKE!!!', color: '#ff9a3d', coins: 25 },
  { at: 400, text: 'UNREAL!!!!', color: '#ff4d8d', coins: 50 },
  { at: 800, text: 'LEGENDARY!!!!!', color: '#c264ff', coins: 100 },
];

/** Kill streak: kills chained within `windowMs` of each other. */
export class KillStreak {
  count = 0;
  best = 0;
  private lastAt = -Infinity;

  constructor(readonly windowMs = 2500) {}

  /** Registers a kill. Returns the callout reached by it, if any. */
  kill(now: number): Callout | null {
    if (now - this.lastAt > this.windowMs) this.count = 0;
    const prev = this.count;
    this.count++;
    this.lastAt = now;
    this.best = Math.max(this.best, this.count);
    let hit: Callout | null = null;
    for (const c of CALLOUTS) if (prev < c.at && this.count >= c.at) hit = c;
    return hit;
  }

  current(now: number): number {
    return now - this.lastAt > this.windowMs ? 0 : this.count;
  }

  /** 1 → 0 as the streak timer runs out. */
  remaining(now: number): number {
    return Math.max(0, 1 - (now - this.lastAt) / this.windowMs);
  }
}

/** Ultimate charge: kills and time fill it. Every cast makes the next one a bit more expensive. */
export const ULT_PER_KILL = 0.9;
export const ULT_PER_SECOND = 0.45;
export const ULT_BASE = 100;
export const ULT_STEP = 0.35;
export const ULT_MAX_NEED = 300;

export class UltCharge {
  value = 0;
  casts = 0;

  /** Charge needed for the next cast. */
  get need(): number {
    return Math.min(ULT_MAX_NEED, ULT_BASE * (1 + ULT_STEP * this.casts));
  }

  addKill(mult = 1): void {
    this.value = Math.min(this.need, this.value + ULT_PER_KILL * mult);
  }

  addTime(dt: number): void {
    this.value = Math.min(this.need, this.value + ULT_PER_SECOND * dt);
  }

  /** 0-100 for display. */
  get percent(): number {
    return (this.value / this.need) * 100;
  }

  get ready(): boolean {
    return this.value >= this.need;
  }

  consume(): boolean {
    if (!this.ready) return false;
    this.value = 0;
    this.casts++;
    return true;
  }
}
