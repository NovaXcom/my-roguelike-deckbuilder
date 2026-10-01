export type EKind = 'ashigaru' | 'swordsman' | 'archer' | 'ninja' | 'oni' | 'shogun';

/** blue = parryable, red = unblockable (dash or jump), shot = projectile. */
export type Icon = 'blue' | 'red' | 'shot';

export interface Atk {
  id: string;
  icon: Icon;
  wind: number;
  strike: number;
  rec: number;
  dmg: number;
  reach: number;
  lunge: number;
  /** Ground shockwave radius (jump over it). */
  aoe?: number;
  /** Number of hits in one attack (flurries). */
  hits?: number;
  proj?: 'arrow' | 'shuriken';
  anim: string;
}

export interface EDef {
  kind: EKind;
  hp: number;
  speed: number;
  /** Half width / height of the body box (metres). */
  w: number;
  h: number;
  armored: boolean;
  guard: boolean;
  atks: Atk[];
  cd: [number, number];
  /** Preferred distance band to the player. */
  ring: [number, number];
  pts: number;
}

const A = (a: Atk): Atk => a;

export const ENEMIES: Record<EKind, EDef> = {
  ashigaru: {
    kind: 'ashigaru', hp: 30, speed: 3.6, w: 0.45, h: 1.75, armored: false, guard: false, cd: [1.0, 1.9], ring: [2.8, 5.0], pts: 100,
    atks: [A({ id: 'thrust', icon: 'blue', wind: 0.55, strike: 0.12, rec: 0.6, dmg: 12, reach: 3.2, lunge: 1.0, anim: 'thrust' })],
  },
  swordsman: {
    kind: 'swordsman', hp: 54, speed: 4.8, w: 0.45, h: 1.78, armored: false, guard: true, cd: [0.9, 1.6], ring: [1.9, 3.4], pts: 170,
    atks: [A({ id: 'cut', icon: 'blue', wind: 0.4, strike: 0.1, rec: 0.5, dmg: 15, reach: 2.4, lunge: 1.5, hits: 2, anim: 'cut' })],
  },
  archer: {
    kind: 'archer', hp: 24, speed: 3.4, w: 0.42, h: 1.72, armored: false, guard: false, cd: [1.6, 2.6], ring: [7, 10], pts: 130,
    atks: [A({ id: 'shoot', icon: 'shot', wind: 0.9, strike: 0.05, rec: 0.8, dmg: 11, reach: 30, lunge: 0, proj: 'arrow', anim: 'shoot' })],
  },
  ninja: {
    kind: 'ninja', hp: 24, speed: 7.2, w: 0.4, h: 1.7, armored: false, guard: false, cd: [1.2, 2.0], ring: [3.5, 6.5], pts: 160,
    atks: [
      A({ id: 'kunai', icon: 'red', wind: 0.5, strike: 0.14, rec: 0.55, dmg: 14, reach: 3.4, lunge: 5.5, anim: 'stab' }),
      A({ id: 'stars', icon: 'shot', wind: 0.45, strike: 0.05, rec: 0.5, dmg: 8, reach: 30, lunge: 0, proj: 'shuriken', anim: 'throw' }),
    ],
  },
  oni: {
    kind: 'oni', hp: 170, speed: 2.7, w: 0.85, h: 2.7, armored: true, guard: false, cd: [1.3, 2.2], ring: [3.0, 4.5], pts: 400,
    atks: [
      A({ id: 'club', icon: 'blue', wind: 0.72, strike: 0.14, rec: 0.85, dmg: 22, reach: 4.0, lunge: 0.8, anim: 'club' }),
      A({ id: 'stomp', icon: 'red', wind: 1.0, strike: 0.2, rec: 1.0, dmg: 26, reach: 0, lunge: 0, aoe: 4.6, anim: 'stomp' }),
    ],
  },
  shogun: {
    kind: 'shogun', hp: 560, speed: 5.4, w: 0.6, h: 2.1, armored: true, guard: true, cd: [0.7, 1.3], ring: [2.2, 3.4], pts: 2200,
    atks: [
      A({ id: 'flurry', icon: 'blue', wind: 0.42, strike: 0.1, rec: 0.55, dmg: 14, reach: 3.0, lunge: 1.8, hits: 3, anim: 'cut' }),
      A({ id: 'iai', icon: 'red', wind: 0.95, strike: 0.15, rec: 0.9, dmg: 28, reach: 8.5, lunge: 8, anim: 'iai' }),
      A({ id: 'overhead', icon: 'blue', wind: 0.62, strike: 0.12, rec: 0.7, dmg: 24, reach: 3.2, lunge: 1.4, anim: 'overhead' }),
    ],
  },
};

export const P = {
  hp: 100,
  runSpeed: 9.6,
  accel: 95,
  airAccel: 60,
  friction: 85,
  gravity: 40,
  jumpV: 14.8,
  jump2V: 12.6,
  fallMax: 30,
  coyote: 0.09,
  jumpBuf: 0.1,
  half: 0.35,
  height: 1.75,
  pipsMax: 3,
  pipRegen: 0.34,
  dashDist: 12,
  dashTime: 0.13,
  shortDash: 5,
  dashInvuln: 0.3,
  dashCd: 0.16,
  parryPerfect: 0.22,
  parryTotal: 0.46,
  parryCd: 0.28,
  hurtInv: 0.75,
  iaiCharge: 0.42,
  iaiReach: 11,
  iaiCost: 2,
  comboWindow: 2.6,
};

export interface SlashDef {
  id: string;
  wind: number;
  active: number;
  rec: number;
  dmg: number;
  reach: number;
  yLo: number;
  yHi: number;
  lunge: number;
  knock: number;
  /** Visual angle of the cut in degrees (0 = horizontal, + = rising). */
  angle: number;
  launch?: boolean;
  air?: boolean;
  /** Breaks a guard. */
  heavy?: boolean;
}

export const SLASH: Record<string, SlashDef> = {
  s1: { id: 's1', wind: 0.03, active: 0.07, rec: 0.1, dmg: 22, reach: 3.0, yLo: -0.4, yHi: 2.3, lunge: 2.0, knock: 3, angle: -8 },
  s2: { id: 's2', wind: 0.03, active: 0.07, rec: 0.1, dmg: 22, reach: 3.0, yLo: -0.4, yHi: 2.3, lunge: 2.0, knock: 3, angle: 18 },
  s3: { id: 's3', wind: 0.07, active: 0.1, rec: 0.22, dmg: 42, reach: 4.2, yLo: -0.5, yHi: 2.6, lunge: 3.0, knock: 9, angle: -32, heavy: true },
  up: { id: 'up', wind: 0.04, active: 0.1, rec: 0.2, dmg: 26, reach: 2.8, yLo: -0.2, yHi: 3.8, lunge: 0.8, knock: 2, angle: 78, launch: true, heavy: true },
  a1: { id: 'a1', wind: 0.02, active: 0.06, rec: 0.08, dmg: 19, reach: 3.2, yLo: -1.0, yHi: 2.4, lunge: 1.2, knock: 2, angle: 0, air: true },
  a2: { id: 'a2', wind: 0.02, active: 0.06, rec: 0.08, dmg: 19, reach: 3.2, yLo: -1.0, yHi: 2.4, lunge: 1.2, knock: 2, angle: 24, air: true },
  a3: { id: 'a3', wind: 0.05, active: 0.08, rec: 0.14, dmg: 30, reach: 3.8, yLo: -1.2, yHi: 2.6, lunge: 1.6, knock: 6, angle: -40, air: true, heavy: true },
  plunge: { id: 'plunge', wind: 0.02, active: 0.5, rec: 0.12, dmg: 34, reach: 3.4, yLo: -1.0, yHi: 1.2, lunge: 0, knock: 8, angle: -85, air: true, heavy: true },
};

export const COMBO = ['s1', 's2', 's3'];
export const AIR_COMBO = ['a1', 'a2', 'a3'];
