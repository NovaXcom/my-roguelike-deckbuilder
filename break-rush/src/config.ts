export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;
export const WORLD_WIDTH = 1800;
export const GROUND_Y = 480;

export const PLAYER = {
  maxHp: 100,
  speed: 320,
  jumpVelocity: -560,
  gravity: 1400,
  invulnMs: 700,
};

export type EnemyKind = 'grunt' | 'rusher' | 'guard';

export interface EnemyStats {
  maxHp: number;
  maxBreak: number;
  speed: number;
  attackDamage: number;
  points: number;
  /** Attack cycle timing (ms). */
  windupMs: number;
  activeMs: number;
  recoverMs: number;
  cooldownMs: [number, number];
  /** Distance band in which the attack may be started. */
  startRangeMin: number;
  startRangeMax: number;
  /** Starts competing for an attack slot when this close. */
  engageDist: number;
  /** Forward speed during the active phase (lunge / dash). */
  lungeSpeed: number;
}

export const ENEMY_STATS: Record<EnemyKind, EnemyStats> = {
  grunt: { maxHp: 90, maxBreak: 30, speed: 170, attackDamage: 10, points: 100, windupMs: 380, activeMs: 200, recoverMs: 500, cooldownMs: [400, 1100], startRangeMin: 0, startRangeMax: 80, engageDist: 280, lungeSpeed: 380 },
  rusher: { maxHp: 70, maxBreak: 24, speed: 210, attackDamage: 16, points: 200, windupMs: 650, activeMs: 420, recoverMs: 850, cooldownMs: [1200, 2400], startRangeMin: 150, startRangeMax: 400, engageDist: 520, lungeSpeed: 740 },
  guard: { maxHp: 140, maxBreak: 50, speed: 100, attackDamage: 14, points: 250, windupMs: 560, activeMs: 260, recoverMs: 700, cooldownMs: [1000, 2000], startRangeMin: 0, startRangeMax: 90, engageDist: 260, lungeSpeed: 220 },
};

/** At most this many enemies may be attacking at once (the rest circle and wait). */
export const MAX_ATTACKERS = 3;

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
  { damage: 10, breakDamage: 7, knockback: 170, hitStopMs: 35, durationMs: 150, cooldownMs: 150, range: 95, lunge: 160, shake: 0.003 },
  { damage: 12, breakDamage: 7, knockback: 190, hitStopMs: 35, durationMs: 150, cooldownMs: 150, range: 95, lunge: 160, shake: 0.004 },
  { damage: 22, breakDamage: 14, knockback: 520, hitStopMs: 90, durationMs: 240, cooldownMs: 400, range: 130, lunge: 260, shake: 0.009 },
];
/** Time after cooldown ends in which the next J continues the chain. */
export const CHAIN_WINDOW_MS = 450;

export const COMBO = { windowMs: 2500, minWindowMs: 1000, maxDamageBonus: 0.5, bonusCapHits: 50 };

export const DODGE = {
  durationMs: 220,
  speed: 620,
  cooldownMs: 450,
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

export const BOSS = {
  maxHp: 2000,
  maxBreak: 280,
  walkSpeed: 55,
  chargeSpeed: 520,
  slamRadius: 170,
  contactDamage: 12,
  chargeDamage: 22,
  slamDamage: 20,
  missileDamage: 10,
  missileSpeed: 340,
  /** Boss HP at or below this fraction = enraged. */
  enrageAt: 0.5,
};
