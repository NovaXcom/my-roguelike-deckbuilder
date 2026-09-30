import { makeItem, templatesFor, type EquipItem } from './equipment';
import type { Role } from './types';

/** 拠点での永続成長。ラン(挑戦)をまたいで保存される。 */
export interface MetaState {
  stones: number; // 魔導石
  smith: number; // 鍛冶屋Lv: 初期装備の品質
  alchemy: number; // 錬金所Lv: ポーション所持数
  training: number; // 訓練所Lv: パッシブ解放
  runs: number;
  clears: number;
}

export type Facility = 'smith' | 'alchemy' | 'training';
export const MAX_LEVEL = 5;
export const UPGRADE_COST: Record<Facility, number[]> = {
  smith: [20, 40, 70, 110, 160],
  alchemy: [15, 30, 50, 80, 120],
  training: [25, 45, 70, 100, 140],
};
export const FACILITY_NAME: Record<Facility, string> = { smith: '鍛冶屋', alchemy: '錬金所', training: '訓練所' };

export const newMeta = (): MetaState => ({ stones: 0, smith: 0, alchemy: 0, training: 0, runs: 0, clears: 0 });

export function upgradeCost(meta: MetaState, f: Facility): number | null {
  const lv = meta[f];
  return lv >= MAX_LEVEL ? null : UPGRADE_COST[f][lv];
}

export function upgrade(meta: MetaState, f: Facility): boolean {
  const cost = upgradeCost(meta, f);
  if (cost === null || meta.stones < cost) return false;
  meta.stones -= cost;
  meta[f] += 1;
  return true;
}

/** 鍛冶屋Lv: 初期装備の品質（レア度と数値倍率） */
export function startGearQuality(smith: number): { rarity: 'common' | 'rare' | 'legendary'; scale: number } {
  return { rarity: smith >= 5 ? 'legendary' : smith >= 3 ? 'rare' : 'common', scale: 1 + 0.1 * smith };
}

/** 初期装備（各キャラの武器と防具）。決定的（揺らぎなし）。 */
export function startingGear(role: Role, smith: number, nextUid: () => number): { weapon: EquipItem; armor: EquipItem } {
  const q = startGearQuality(smith);
  // 初期装備は固有スキル付きの武器が出過ぎないよう、Legendary は武器のみ、防具は Rare を上限とする
  const wpool = templatesFor(q.rarity, { slot: 'weapon', role });
  const apool = templatesFor(q.rarity === 'legendary' ? 'rare' : q.rarity, { slot: 'armor', role });
  return {
    weapon: makeItem(wpool[0], nextUid(), null, q.scale),
    armor: makeItem(apool[0], nextUid(), null, q.scale),
  };
}

export const startingPotions = (alchemy: number): number => 1 + alchemy;

export interface PassiveMods {
  hp: number;
  power: number;
  breakBonus: number;
  chainBonus: number;
  knightOpeningGuard: number;
}

export const PASSIVES: { level: number; name: string; text: string }[] = [
  { level: 1, name: '基礎体力', text: '全員の最大HP+8' },
  { level: 2, name: '守りの心得', text: 'ナイトは戦闘開始時にガード8を得る' },
  { level: 3, name: '属性共鳴', text: 'チェインの倍率+0.25' },
  { level: 4, name: '破砕の技術', text: '全員のブレイク+3' },
  { level: 5, name: '英雄の器', text: '全員の攻撃+2' },
];

export function passivesFor(training: number): PassiveMods {
  return {
    hp: training >= 1 ? 8 : 0,
    knightOpeningGuard: training >= 2 ? 8 : 0,
    chainBonus: training >= 3 ? 0.25 : 0,
    breakBonus: training >= 4 ? 3 : 0,
    power: training >= 5 ? 2 : 0,
  };
}

/** localStorage の保存文字列を安全に復元する（壊れていたら初期状態） */
export function parseMeta(raw: string | null): MetaState {
  const base = newMeta();
  if (!raw) return base;
  try {
    const o = JSON.parse(raw) as Partial<Record<keyof MetaState, unknown>>;
    const num = (v: unknown, max: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0);
    return {
      stones: num(o.stones, 1e9),
      smith: num(o.smith, MAX_LEVEL),
      alchemy: num(o.alchemy, MAX_LEVEL),
      training: num(o.training, MAX_LEVEL),
      runs: num(o.runs, 1e9),
      clears: num(o.clears, 1e9),
    };
  } catch {
    return base;
  }
}
