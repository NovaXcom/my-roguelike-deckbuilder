import type { Rng } from './rng';
import type { EquipEffectId, Role } from './types';

export type Slot = 'weapon' | 'armor' | 'accessory';
export type Rarity = 'common' | 'rare' | 'legendary';

export interface EquipStats {
  hp: number;
  /** ダメージ+（そのキャラの攻撃スキル全般） */
  power: number;
  /** ガード値+ */
  guard: number;
  /** シールドゲージ削りダメージ+ */
  breakBonus: number;
}

export interface EquipTemplate {
  id: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  role: Role | 'any';
  stats: Partial<EquipStats>;
  /** 装備すると使用可能になる固有スキル */
  skill?: string;
  /** 固有効果（この装備を軸にビルドを組むための仕組み） */
  effect?: EquipEffectId;
}

export const EFFECT_TEXT: Record<EquipEffectId, string> = {
  bleed_on_break: '敵をブレイクさせると出血(4×3ターン)',
  ignite: '火属性攻撃が敵を火傷にする(4×3ターン)',
  guard_power: 'ガード中は与ダメージ+20%',
  low_hp_cd: 'HP50%以下でターン開始時にCD-1',
  break_guard: 'ブレイク時に味方全員ガード+8',
  holy_break: 'ブレイク時に味方全員HP+6',
  freeze_ice: '氷属性攻撃が敵を凍結(復帰時シールド半減)',
  storm_chain: 'チェイン反応のダメージ・火傷が1.5倍',
};

export interface EquipItem {
  uid: number;
  templateId: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  role: Role | 'any';
  stats: EquipStats;
  skill?: string;
  effect?: EquipEffectId;
}

export const RARITY_LABEL: Record<Rarity, string> = { common: 'Common', rare: 'Rare', legendary: 'Legendary' };
export const RARITY_COLOR: Record<Rarity, number> = { common: 0xb8b8b8, rare: 0x4aa3ff, legendary: 0xffa726 };
export const SLOT_LABEL: Record<Slot, string> = { weapon: '武器', armor: '防具', accessory: '装飾' };
export const SELL_VALUE: Record<Rarity, number> = { common: 8, rare: 22, legendary: 55 };
export const BUY_PRICE: Record<Rarity, number> = { common: 25, rare: 60, legendary: 150 };

const t = (
  id: string, name: string, slot: Slot, rarity: Rarity, role: Role | 'any', stats: Partial<EquipStats>, skill?: string,
  effect?: EquipEffectId,
): EquipTemplate => ({ id, name, slot, rarity, role, stats, skill, effect });

export const EQUIP_TEMPLATES: EquipTemplate[] = [
  // ナイト武器
  t('iron_sword', '鉄の剣', 'weapon', 'common', 'knight', { power: 2 }),
  t('drill_sword', '訓練用ソード', 'weapon', 'common', 'knight', { power: 1, breakBonus: 2 }),
  t('knight_greatsword', '騎士の大剣', 'weapon', 'rare', 'knight', { power: 3, breakBonus: 2 }, 'cleave', 'break_guard'),
  t('bulwark_blade', '守護の剣', 'weapon', 'rare', 'knight', { power: 3, guard: 2 }, 'sword_guard', 'guard_power'),
  t('dragon_claw', '竜のツメ', 'weapon', 'legendary', 'knight', { power: 6, breakBonus: 3 }, 'dragon_slash'),
  t('holy_blade', '聖騎士の宝剣', 'weapon', 'legendary', 'knight', { power: 5, hp: 15 }, 'holy_strike', 'holy_break'),
  // ナイト防具
  t('leather_armor', '革の鎧', 'armor', 'common', 'knight', { hp: 10 }),
  t('iron_plate', '鉄の胸当て', 'armor', 'common', 'knight', { hp: 8, guard: 1 }),
  t('knight_armor', '騎士の鎧', 'armor', 'rare', 'knight', { hp: 22, guard: 2 }),
  t('dragon_scale', '竜鱗の鎧', 'armor', 'legendary', 'knight', { hp: 40, guard: 3 }),
  // エレメンタリスト武器
  t('novice_staff', '見習いの杖', 'weapon', 'common', 'elementalist', { power: 2 }),
  t('oak_wand', '樫のワンド', 'weapon', 'common', 'elementalist', { power: 1, hp: 5 }),
  t('frost_staff', '氷晶の杖', 'weapon', 'rare', 'elementalist', { power: 3 }, 'blizzard', 'freeze_ice'),
  t('flame_grimoire', '炎の魔導書', 'weapon', 'rare', 'elementalist', { power: 3 }, 'inferno', 'ignite'),
  t('star_staff', '星命の杖', 'weapon', 'legendary', 'elementalist', { power: 6 }, 'meteor', 'ignite'),
  t('storm_scepter', '嵐の王笏', 'weapon', 'legendary', 'elementalist', { power: 5, breakBonus: 2 }, 'thunderstorm', 'storm_chain'),
  // エレメンタリスト防具
  t('cloth_robe', '布のローブ', 'armor', 'common', 'elementalist', { hp: 8 }),
  t('mage_robe', '魔術師のローブ', 'armor', 'rare', 'elementalist', { hp: 16, power: 1 }),
  t('sage_robe', '賢者のローブ', 'armor', 'legendary', 'elementalist', { hp: 30, power: 2, guard: 2 }),
  // 装飾（誰でも）
  t('copper_ring', '銅の指輪', 'accessory', 'common', 'any', { hp: 6 }),
  t('guard_charm', '守りの護符', 'accessory', 'common', 'any', { guard: 1, hp: 3 }),
  t('power_pendant', '力のペンダント', 'accessory', 'rare', 'any', { power: 2, hp: 5 }),
  t('crusher_bangle', '砕きの腕輪', 'accessory', 'rare', 'any', { breakBonus: 3, hp: 8 }, undefined, 'bleed_on_break'),
  t('dragon_heart', '竜の心臓', 'accessory', 'legendary', 'any', { hp: 30, power: 3, breakBonus: 2 }, undefined, 'low_hp_cd'),
];

const zero = (): EquipStats => ({ hp: 0, power: 0, guard: 0, breakBonus: 0 });

/** 基本値に±の揺らぎを付けて個体を生成する（ハクスラ要素） */
export function makeItem(tpl: EquipTemplate, uid: number, rng: Rng | null, scale = 1): EquipItem {
  const stats = zero();
  for (const k of Object.keys(tpl.stats) as (keyof EquipStats)[]) {
    const base = (tpl.stats[k] ?? 0) * scale;
    const roll = rng ? 0.85 + rng.next() * 0.3 : 1;
    stats[k] = Math.max(1, Math.round(base * roll));
  }
  return { uid, templateId: tpl.id, name: tpl.name, slot: tpl.slot, rarity: tpl.rarity, role: tpl.role, stats, skill: tpl.skill, effect: tpl.effect };
}

export function templatesFor(rarity: Rarity, opts: { slot?: Slot; role?: Role } = {}): EquipTemplate[] {
  return EQUIP_TEMPLATES.filter(
    (e) => e.rarity === rarity && (!opts.slot || e.slot === opts.slot) && (!opts.role || e.role === 'any' || e.role === opts.role),
  );
}

export type DropSource = 'battle' | 'chest' | 'boss' | 'shop' | 'elite' | 'cursed';
const RARITY_WEIGHTS: Record<DropSource, Record<Rarity, number>> = {
  battle: { common: 70, rare: 27, legendary: 3 },
  chest: { common: 35, rare: 50, legendary: 15 },
  boss: { common: 0, rare: 0, legendary: 1 },
  shop: { common: 60, rare: 35, legendary: 5 },
  elite: { common: 0, rare: 78, legendary: 22 },
  cursed: { common: 0, rare: 30, legendary: 70 },
};

export function rollRarity(rng: Rng, source: DropSource): Rarity {
  return rng.weighted(RARITY_WEIGHTS[source]);
}

export function rollItem(rng: Rng, source: DropSource, uid: number, rarity?: Rarity): EquipItem {
  const r = rarity ?? rollRarity(rng, source);
  const slot = rng.weighted<Slot>({ weapon: 40, armor: 35, accessory: 25 });
  const pool = templatesFor(r, { slot });
  return makeItem(rng.pick(pool), uid, rng);
}

export function statLines(s: EquipStats): string[] {
  const out: string[] = [];
  if (s.hp) out.push(`最大HP +${s.hp}`);
  if (s.power) out.push(`攻撃 +${s.power}`);
  if (s.guard) out.push(`ガード +${s.guard}`);
  if (s.breakBonus) out.push(`ブレイク +${s.breakBonus}`);
  return out;
}
