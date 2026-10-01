import { EnemyKind } from './data';
import { Rng } from '../game/Rng';

export type PropKind = 'car' | 'dumpster' | 'crate' | 'barrier' | 'lamp' | 'bin' | 'bench' | 'vending' | 'pillar' | 'barrel' | 'planter' | 'stall';
export interface Prop {
  kind: PropKind;
  x: number;
  z: number;
  /** Half extents of the collision box (world axes). */
  hw: number;
  hd: number;
  rot?: number;
  color?: number;
  /** False for decoration the fighters can walk through. */
  solid?: boolean;
}

export type Look = 'alley' | 'street' | 'garage' | 'plaza';

export interface WaveSpec {
  kind: EnemyKind;
  n: number;
}

export interface StageDef {
  id: number;
  name: string;
  blurb: string;
  look: Look;
  /** Playable length along x and width along z. */
  w: number;
  d: number;
  props: Prop[];
  weapons: { kind: 'bat' | 'pipe'; x: number; z: number }[];
  waves: WaveSpec[][];
  tokens: number;
  hints: string[];
}

const car = (x: number, z: number, along = true, color = 0x8a1f1f): Prop => ({ kind: 'car', x, z, hw: along ? 2.3 : 1.05, hd: along ? 1.05 : 2.3, rot: along ? 0 : Math.PI / 2, color });
const P = (kind: PropKind, x: number, z: number, hw: number, hd: number, extra: Partial<Prop> = {}): Prop => ({ kind, x, z, hw, hd, ...extra });

export const STAGES: StageDef[] = [
  {
    id: 1, name: 'BACK ALLEY', blurb: '雨上がりの路地裏。まずは数を減らせ。', look: 'alley', w: 30, d: 11, tokens: 2,
    props: [
      P('dumpster', -8, -4.6, 1.1, 0.7), P('dumpster', 6, 4.7, 1.1, 0.7), P('crate', 11, -4.5, 0.7, 0.7), P('crate', 12.2, -4.4, 0.6, 0.6),
      P('bin', -12, 4.8, 0.35, 0.35), P('barrel', 3, -4.7, 0.45, 0.45), P('lamp', -4, 5.1, 0.2, 0.2, { solid: false }), P('lamp', 9, -5.1, 0.2, 0.2, { solid: false }),
    ],
    weapons: [{ kind: 'pipe', x: -9.5, z: -3.9 }],
    waves: [[{ kind: 'thug', n: 3 }], [{ kind: 'thug', n: 3 }, { kind: 'knife', n: 1 }], [{ kind: 'thug', n: 2 }, { kind: 'knife', n: 2 }]],
    hints: ['LEFT CLICK: ATTACK — chain 4 hits', 'RIGHT CLICK just as the BLUE ring closes: COUNTER', 'SPACE: DODGE (red attacks!)'],
  },
  {
    id: 2, name: 'SHOPPING STREET', blurb: '夕暮れの商店街。バット持ちに注意。', look: 'street', w: 40, d: 16, tokens: 2,
    props: [
      car(-9, 6.2, true, 0x2f4f8a), car(7, 6.2, true, 0xb8b8b8), car(-1, -6.4, true, 0x1c1c1c),
      P('vending', 14, -7.1, 0.5, 0.45), P('bench', -14, 7, 0.9, 0.35), P('bin', 17, 7, 0.35, 0.35), P('barrier', 0, 1.2, 1.4, 0.3),
      P('lamp', -12, -7.4, 0.2, 0.2, { solid: false }), P('lamp', 3, 7.6, 0.2, 0.2, { solid: false }), P('lamp', 16, -7.4, 0.2, 0.2, { solid: false }),
    ],
    weapons: [{ kind: 'bat', x: -15, z: -5.5 }, { kind: 'pipe', x: 15, z: 4.5 }],
    waves: [[{ kind: 'thug', n: 3 }, { kind: 'bat', n: 1 }], [{ kind: 'knife', n: 3 }, { kind: 'thug', n: 2 }], [{ kind: 'bat', n: 2 }, { kind: 'gunman', n: 1 }, { kind: 'thug', n: 2 }]],
    hints: ['Gunmen show a YELLOW laser — dodge, or counter to reflect the bullet', 'Press F next to an enemy to GRAB and throw'],
  },
  {
    id: 3, name: 'UNDERPASS', blurb: '高架下の駐車場。柱を盾に撃ってくる。', look: 'garage', w: 42, d: 18, tokens: 3,
    props: [
      P('pillar', -10, -4, 0.6, 0.6), P('pillar', -10, 4, 0.6, 0.6), P('pillar', 4, -4, 0.6, 0.6), P('pillar', 4, 4, 0.6, 0.6), P('pillar', 16, -4, 0.6, 0.6), P('pillar', 16, 4, 0.6, 0.6),
      car(-16, -7.4, true, 0x6a6a2a), car(-4, 7.6, true, 0x1b3a2a), car(10, -7.4, true, 0x7a1a1a), P('barrier', 1, 0, 0.3, 1.8), P('barrel', 19, 7, 0.45, 0.45), P('barrel', 19.9, 6.4, 0.45, 0.45),
    ],
    weapons: [{ kind: 'pipe', x: 12, z: 7.5 }],
    waves: [[{ kind: 'gunman', n: 2 }, { kind: 'thug', n: 3 }], [{ kind: 'brute', n: 1 }, { kind: 'knife', n: 2 }], [{ kind: 'bat', n: 2 }, { kind: 'gunman', n: 2 }, { kind: 'knife', n: 2 }]],
    hints: ['BRUTE: red slam can only be dodged. Counter his blue hook to stagger him'],
  },
  {
    id: 4, name: 'CENTRAL PLAZA', blurb: '街の中心。親玉が待っている。', look: 'plaza', w: 44, d: 28, tokens: 3,
    props: [
      P('planter', -10, -8, 1.6, 0.8), P('planter', -10, 8, 1.6, 0.8), P('planter', 10, -8, 1.6, 0.8), P('planter', 10, 8, 1.6, 0.8),
      P('bench', -4, -11.5, 0.9, 0.35), P('bench', 4, 11.5, 0.9, 0.35), P('stall', 15, 0, 1.2, 1.0), P('stall', -16, 3, 1.2, 1.0),
      P('planter', 0, 0, 2.2, 2.2), P('lamp', -18, -12.4, 0.2, 0.2, { solid: false }), P('lamp', 0, 12.6, 0.2, 0.2, { solid: false }), P('lamp', 18, -12.4, 0.2, 0.2, { solid: false }),
    ],
    weapons: [{ kind: 'bat', x: 0, z: -11 }, { kind: 'pipe', x: -17, z: -4 }],
    waves: [[{ kind: 'thug', n: 4 }, { kind: 'knife', n: 2 }], [{ kind: 'brute', n: 1 }, { kind: 'gunman', n: 2 }, { kind: 'bat', n: 2 }], [{ kind: 'boss', n: 1 }, { kind: 'thug', n: 3 }]],
    hints: ['BOSS: counter the blue combo, dodge the red smash and charge'],
  },
];

/** Endless mode: an ever-growing mix. */
export function endlessWave(n: number, rng: Rng): WaveSpec[] {
  const out: WaveSpec[] = [];
  const budget = 3 + n * 1.2;
  let spent = 0;
  const pool: [EnemyKind, number, number][] = [['thug', 1, 0], ['knife', 1.3, 1], ['bat', 1.6, 2], ['gunman', 1.5, 3], ['brute', 4, 5]];
  while (spent < budget) {
    const avail = pool.filter((p) => p[2] <= n);
    const [k, cost] = rng.pick(avail);
    const e = out.find((o) => o.kind === k);
    if (e) e.n++;
    else out.push({ kind: k, n: 1 });
    spent += cost;
  }
  if (n > 0 && n % 5 === 4) out.push({ kind: 'boss', n: 1 });
  return out;
}

export function endlessStage(base: StageDef): StageDef {
  return { ...base, id: 99, name: 'ENDLESS', blurb: '何波まで耐えられる？', waves: [] };
}
