export type EnemyKind = 'thug' | 'knife' | 'bat' | 'brute' | 'gunman' | 'boss';

/** Blue = can be countered, red = unblockable (dodge it), yellow = ranged. */
export type Icon = 'blue' | 'red' | 'yellow';

export interface AttackDef {
  id: string;
  icon: Icon;
  wind: number;
  strike: number;
  rec: number;
  dmg: number;
  range: number;
  /** Half-angle of the hit cone (radians). */
  arc: number;
  /** Distance the attacker travels during wind-up + strike. */
  lunge: number;
  aoe?: number;
  ranged?: boolean;
  kb: number;
  knock?: boolean;
  anim: string;
}

export interface EnemyDef {
  kind: EnemyKind;
  hp: number;
  speed: number;
  radius: number;
  armored: boolean;
  attacks: AttackDef[];
  cd: [number, number];
  ring: number;
  pts: number;
  scale: number;
}

const A = (a: AttackDef): AttackDef => a;

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  thug: {
    kind: 'thug', hp: 34, speed: 3.6, radius: 0.45, armored: false, cd: [1.1, 2.0], ring: 3.4, pts: 100, scale: 1,
    attacks: [A({ id: 'punch', icon: 'blue', wind: 0.55, strike: 0.12, rec: 0.55, dmg: 8, range: 1.7, arc: 0.9, lunge: 1.1, kb: 1.5, anim: 'punch' })],
  },
  knife: {
    kind: 'knife', hp: 28, speed: 4.6, radius: 0.42, armored: false, cd: [0.9, 1.7], ring: 3.8, pts: 130, scale: 0.98,
    attacks: [A({ id: 'slash', icon: 'blue', wind: 0.42, strike: 0.15, rec: 0.5, dmg: 10, range: 1.7, arc: 0.8, lunge: 3.2, kb: 1.5, anim: 'slash' })],
  },
  bat: {
    kind: 'bat', hp: 46, speed: 3.3, radius: 0.5, armored: false, cd: [1.4, 2.4], ring: 3.8, pts: 160, scale: 1.04,
    attacks: [A({ id: 'swing', icon: 'blue', wind: 0.8, strike: 0.15, rec: 0.7, dmg: 15, range: 2.3, arc: 1.1, lunge: 1.2, kb: 3, knock: true, anim: 'swing' })],
  },
  brute: {
    kind: 'brute', hp: 130, speed: 2.8, radius: 0.72, armored: true, cd: [1.4, 2.4], ring: 3.6, pts: 320, scale: 1.3,
    attacks: [
      A({ id: 'hook', icon: 'blue', wind: 0.65, strike: 0.14, rec: 0.7, dmg: 14, range: 2.0, arc: 0.9, lunge: 1.2, kb: 3, anim: 'punch' }),
      A({ id: 'slam', icon: 'red', wind: 1.0, strike: 0.2, rec: 0.9, dmg: 22, range: 2.6, arc: Math.PI, aoe: 2.7, lunge: 0.6, kb: 5, knock: true, anim: 'slam' }),
    ],
  },
  gunman: {
    kind: 'gunman', hp: 26, speed: 3.4, radius: 0.42, armored: false, cd: [2.0, 3.2], ring: 9.5, pts: 150, scale: 1,
    attacks: [A({ id: 'shoot', icon: 'yellow', wind: 1.0, strike: 0.1, rec: 0.6, dmg: 10, range: 22, arc: 0.3, lunge: 0, ranged: true, kb: 2, anim: 'shoot' })],
  },
  boss: {
    kind: 'boss', hp: 420, speed: 3.6, radius: 0.8, armored: true, cd: [0.8, 1.5], ring: 3.4, pts: 1500, scale: 1.4,
    attacks: [
      A({ id: 'jab', icon: 'blue', wind: 0.45, strike: 0.12, rec: 0.45, dmg: 12, range: 2.1, arc: 0.9, lunge: 1.6, kb: 2, anim: 'punch' }),
      A({ id: 'cross', icon: 'blue', wind: 0.55, strike: 0.12, rec: 0.6, dmg: 16, range: 2.2, arc: 0.9, lunge: 2.0, kb: 3, anim: 'swing' }),
      A({ id: 'smash', icon: 'red', wind: 0.95, strike: 0.2, rec: 0.9, dmg: 24, range: 2.8, arc: Math.PI, aoe: 3.0, lunge: 0.8, kb: 6, knock: true, anim: 'slam' }),
      A({ id: 'charge', icon: 'red', wind: 0.8, strike: 0.35, rec: 0.9, dmg: 20, range: 2.0, arc: 0.7, lunge: 7.5, kb: 5, knock: true, anim: 'charge' }),
    ],
  },
};

export const PLAYER = {
  hp: 100,
  speed: 5.8,
  radius: 0.45,
  dodgeTime: 0.46,
  dodgeSpeed: 9.5,
  iFrom: 0.04,
  iTo: 0.36,
  dodgeCd: 0.15,
  guardTime: 0.46,
  perfect: 0.34,
  counterTime: 0.5,
  maxMeter: 100,
  comboWindow: 3.2,
};

export const PLAYER_ATTACKS: Record<string, AttackDef> = {
  l1: { id: 'l1', icon: 'blue', wind: 0.07, strike: 0.09, rec: 0.2, dmg: 8, range: 2.0, arc: 0.95, lunge: 2.4, kb: 1.2, anim: 'jabL' },
  l2: { id: 'l2', icon: 'blue', wind: 0.07, strike: 0.09, rec: 0.2, dmg: 8, range: 2.0, arc: 0.95, lunge: 2.4, kb: 1.2, anim: 'jabR' },
  l3: { id: 'l3', icon: 'blue', wind: 0.09, strike: 0.09, rec: 0.24, dmg: 10, range: 2.1, arc: 1.0, lunge: 2.4, kb: 1.8, anim: 'hook' },
  l4: { id: 'l4', icon: 'blue', wind: 0.12, strike: 0.1, rec: 0.36, dmg: 16, range: 2.3, arc: 1.3, lunge: 2.6, kb: 4.5, knock: true, anim: 'kick' },
  heavy: { id: 'heavy', icon: 'blue', wind: 0.28, strike: 0.12, rec: 0.4, dmg: 24, range: 2.5, arc: 1.2, lunge: 2.4, kb: 5.5, knock: true, anim: 'heavy' },
  ground: { id: 'ground', icon: 'blue', wind: 0.1, strike: 0.1, rec: 0.28, dmg: 12, range: 1.9, arc: 1.4, lunge: 1.2, kb: 0, anim: 'stomp' },
};

export const COMBO_CHAIN = ['l1', 'l2', 'l3', 'l4'];
