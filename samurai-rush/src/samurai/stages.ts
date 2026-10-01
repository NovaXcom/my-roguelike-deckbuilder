import { EKind } from './data';

export interface SpawnSpec {
  kind: EKind;
  n: number;
}
export interface Encounter {
  /** The fight starts when the player reaches this x. */
  x: number;
  waves: SpawnSpec[][];
  boss?: boolean;
}
export interface Patrol {
  x: number;
  kind: EKind;
  n?: number;
}
export type Theme = 'bamboo' | 'village' | 'bridge' | 'castle';

export interface StageDef {
  id: number;
  name: string;
  jp: string;
  blurb: string;
  theme: Theme;
  length: number;
  patrols: Patrol[];
  encounters: Encounter[];
}

const S = (kind: EKind, n: number): SpawnSpec => ({ kind, n });

export const STAGES: StageDef[] = [
  {
    id: 1, name: 'BAMBOO NIGHT', jp: '竹林の夜', blurb: '月夜の竹林。雑兵を斬り抜けろ。', theme: 'bamboo', length: 240,
    patrols: [{ x: 24, kind: 'ashigaru' }, { x: 34, kind: 'ashigaru', n: 2 }, { x: 48, kind: 'archer' }, { x: 92, kind: 'ashigaru', n: 2 }, { x: 104, kind: 'archer' }, { x: 112, kind: 'ashigaru', n: 3 }, { x: 165, kind: 'ashigaru', n: 3 }, { x: 178, kind: 'archer', n: 2 }, { x: 188, kind: 'swordsman' }],
    encounters: [
      { x: 68, waves: [[S('ashigaru', 3)], [S('ashigaru', 3), S('archer', 1)]] },
      { x: 140, waves: [[S('ashigaru', 4), S('archer', 1)], [S('swordsman', 2), S('ashigaru', 2)]] },
      { x: 212, waves: [[S('ashigaru', 4), S('archer', 2)], [S('swordsman', 3), S('ashigaru', 3)], [S('swordsman', 2), S('archer', 2), S('ashigaru', 4)]] },
    ],
  },
  {
    id: 2, name: 'BURNING VILLAGE', jp: '燃える村', blurb: '炎の中から忍びが来る。', theme: 'village', length: 260,
    patrols: [{ x: 22, kind: 'swordsman' }, { x: 36, kind: 'ashigaru', n: 3 }, { x: 52, kind: 'archer', n: 2 }, { x: 98, kind: 'ninja' }, { x: 112, kind: 'swordsman' }, { x: 126, kind: 'ninja' }, { x: 176, kind: 'swordsman', n: 2 }, { x: 190, kind: 'ninja', n: 2 }, { x: 204, kind: 'archer', n: 2 }],
    encounters: [
      { x: 70, waves: [[S('swordsman', 2), S('ashigaru', 2)], [S('ninja', 2), S('archer', 1)]] },
      { x: 150, waves: [[S('swordsman', 3), S('ninja', 1)], [S('ninja', 3), S('archer', 2), S('ashigaru', 2)]] },
      { x: 230, waves: [[S('ninja', 2), S('swordsman', 2)], [S('swordsman', 3), S('archer', 2), S('ninja', 2)], [S('ninja', 4), S('swordsman', 3)]] },
    ],
  },
  {
    id: 3, name: 'RAINY BRIDGE', jp: '雨の橋', blurb: '大橋の鬼を討て。', theme: 'bridge', length: 260,
    patrols: [{ x: 24, kind: 'ashigaru', n: 3 }, { x: 40, kind: 'swordsman', n: 2 }, { x: 56, kind: 'ninja' }, { x: 100, kind: 'archer', n: 2 }, { x: 118, kind: 'swordsman' }, { x: 132, kind: 'ninja', n: 2 }, { x: 186, kind: 'ashigaru', n: 4 }, { x: 200, kind: 'archer', n: 2 }],
    encounters: [
      { x: 76, waves: [[S('oni', 1), S('ashigaru', 3)], [S('swordsman', 2), S('ninja', 2)]] },
      { x: 160, waves: [[S('oni', 1), S('archer', 2), S('swordsman', 1)], [S('oni', 2), S('ninja', 2)]] },
      { x: 232, waves: [[S('swordsman', 3), S('ninja', 2), S('archer', 2)], [S('oni', 2), S('swordsman', 2)], [S('oni', 1), S('ninja', 3), S('archer', 2), S('ashigaru', 3)]] },
    ],
  },
  {
    id: 4, name: 'SHOGUN\'S KEEP', jp: '将軍の城', blurb: '最後の一太刀。', theme: 'castle', length: 220,
    patrols: [{ x: 24, kind: 'swordsman', n: 2 }, { x: 38, kind: 'ninja', n: 2 }, { x: 58, kind: 'archer', n: 2 }, { x: 100, kind: 'swordsman', n: 2 }, { x: 112, kind: 'ninja', n: 2 }],
    encounters: [
      { x: 70, waves: [[S('swordsman', 3), S('ninja', 2)], [S('oni', 1), S('archer', 2), S('ashigaru', 3)]] },
      { x: 136, waves: [[S('swordsman', 3), S('ninja', 3)], [S('oni', 2), S('archer', 2)], [S('swordsman', 3), S('ninja', 2), S('archer', 2), S('ashigaru', 4)]] },
      { x: 192, boss: true, waves: [[S('shogun', 1)]] },
    ],
  },
];

export const ENDLESS: StageDef = { id: 99, name: 'HYAKUNIN-GIRI', jp: '百人斬り', blurb: '百人を斬れ。', theme: 'bamboo', length: 0, patrols: [], encounters: [] };

export function endlessWave(n: number, rand: () => number): SpawnSpec[] {
  const pool: [EKind, number, number][] = [['ashigaru', 1, 0], ['archer', 1.2, 1], ['swordsman', 1.6, 2], ['ninja', 1.6, 3], ['oni', 4.5, 5]];
  const budget = 3 + n * 1.4;
  const out: SpawnSpec[] = [];
  let spent = 0;
  while (spent < budget) {
    const av = pool.filter((p) => p[2] <= n);
    const [k, c] = av[Math.floor(rand() * av.length)];
    const e = out.find((o) => o.kind === k);
    if (e) e.n++;
    else out.push({ kind: k, n: 1 });
    spent += c;
  }
  if (n > 0 && n % 6 === 5) out.push({ kind: 'shogun', n: 1 });
  return out;
}
