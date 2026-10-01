export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;
export const WORLD_WIDTH = 2400;
export const GROUND_Y = 480;

export const PLAYER = {
  maxHp: 100,
  speed: 260,
  jumpVelocity: -560,
  gravity: 1400,
  invulnMs: 700,
};

export const GRUNT = {
  maxHp: 60,
  maxBreak: 20,
  speed: 90,
  contactDamage: 8,
  contactCooldown: 900, // ms
  knockback: 220,
};

export interface AttackStepConfig {
  damage: number;
  breakDamage: number;
  knockback: number;
  hitStopMs: number;
  durationMs: number;
  cooldownMs: number;
  range: number;
  lunge: number;
  shake: number;
}

/** 3-hit chain on J. The 3rd hit is the heavy finisher. */
export const ATTACK_STEPS: AttackStepConfig[] = [
  { damage: 10, breakDamage: 7, knockback: 140, hitStopMs: 30, durationMs: 170, cooldownMs: 200, range: 70, lunge: 120, shake: 0.002 },
  { damage: 12, breakDamage: 7, knockback: 160, hitStopMs: 30, durationMs: 170, cooldownMs: 200, range: 70, lunge: 120, shake: 0.003 },
  { damage: 20, breakDamage: 14, knockback: 420, hitStopMs: 80, durationMs: 260, cooldownMs: 480, range: 95, lunge: 200, shake: 0.007 },
];
/** Time after cooldown ends in which the next J continues the chain. */
export const CHAIN_WINDOW_MS = 350;

export const COMBO = { windowMs: 2500, maxDamageBonus: 0.5, bonusCapHits: 50 };

export const DODGE = {
  durationMs: 220,
  speed: 620,
  cooldownMs: 600,
  invulnMs: 260,
  counterWindowMs: 450,
  counterMult: 2,
  counterKnockback: 520,
  counterBreakDamage: 14,
  counterHitStopMs: 80,
};

export const RUSH = {
  range: 650,
  windowMs: 1500,
  speed: 1100,
  maxMs: 500,
  arriveDist: 45,
  damage: 25,
  breakDamage: 20,
  knockback: 300,
  hitStopMs: 90,
};

export const BREAK = { durationMs: 2500, damageMult: 2 };

export const COMBO_MILESTONES = [10, 25, 50, 100];

/** Kills inside windowMs chain into a multi-kill. tiers = kill counts that start tier 1, 2, 3. */
export const MULTIKILL = { windowMs: 1000, tiers: [3, 6, 10] };

/** Periodic "BREAK CHANCE": a large group of grunts appears at once. */
export const HORDE = { firstMs: 12000, intervalMs: 22000, count: 12 };
