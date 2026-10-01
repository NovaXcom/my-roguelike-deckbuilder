import { WeaponId } from './Upgrades';

export type HeroId = 'blaze' | 'sparky' | 'tank';

export interface HeroDef {
  name: string;
  tagline: string;
  startWeapon: WeaponId;
  hp: number;
  speed: number;
  cost: number;
  color: number;
}

export const HEROES: Record<HeroId, HeroDef> = {
  blaze: { name: 'BLAZE', tagline: 'Balanced slasher', startWeapon: 'slash', hp: 110, speed: 7.5, cost: 0, color: 0xff6a3d },
  sparky: { name: 'SPARKY', tagline: 'Fast & fragile, calls thunder', startWeapon: 'lightning', hp: 80, speed: 8.6, cost: 250, color: 0x7a8cff },
  tank: { name: 'TANK-O', tagline: 'Slow & sturdy, quake stomp', startWeapon: 'stomp', hp: 170, speed: 6.4, cost: 500, color: 0x3ddc84 },
};
export const HERO_IDS = Object.keys(HEROES) as HeroId[];

export type MetaId = 'hp' | 'power' | 'speed' | 'magnet' | 'xp' | 'greed' | 'luck';

export interface MetaDef {
  name: string;
  desc: string;
  icon: string;
  max: number;
  baseCost: number;
}

export const META_DEFS: Record<MetaId, MetaDef> = {
  hp: { name: 'TOUGHNESS', desc: '+10% max HP per level', icon: '❤', max: 5, baseCost: 60 },
  power: { name: 'MIGHT', desc: '+6% damage per level', icon: '💪', max: 5, baseCost: 80 },
  speed: { name: 'AGILITY', desc: '+4% move speed per level', icon: '👟', max: 5, baseCost: 60 },
  magnet: { name: 'MAGNETISM', desc: '+12% pickup range per level', icon: '🧲', max: 5, baseCost: 50 },
  xp: { name: 'WISDOM', desc: '+8% XP per level', icon: '📘', max: 5, baseCost: 70 },
  greed: { name: 'FORTUNE', desc: '+10% coins per level', icon: '💰', max: 5, baseCost: 70 },
  luck: { name: 'LUCK', desc: 'Better card rarity', icon: '🍀', max: 5, baseCost: 100 },
};
export const META_IDS = Object.keys(META_DEFS) as MetaId[];

export type MetaLevels = Partial<Record<MetaId, number>>;

export function metaLevel(levels: MetaLevels, id: MetaId): number {
  const v = Math.floor(Number(levels[id] ?? 0));
  return Number.isFinite(v) ? Math.min(META_DEFS[id].max, Math.max(0, v)) : 0;
}

export function metaCost(levels: MetaLevels, id: MetaId): number {
  return META_DEFS[id].baseCost * (metaLevel(levels, id) + 1);
}

export function canBuyMeta(coins: number, levels: MetaLevels, id: MetaId): boolean {
  return metaLevel(levels, id) < META_DEFS[id].max && coins >= metaCost(levels, id);
}

export function buyMeta(coins: number, levels: MetaLevels, id: MetaId): { coins: number; levels: MetaLevels } | null {
  if (!canBuyMeta(coins, levels, id)) return null;
  return { coins: coins - metaCost(levels, id), levels: { ...levels, [id]: metaLevel(levels, id) + 1 } };
}

export interface MetaBonuses {
  hpMult: number;
  damageMult: number;
  speedMult: number;
  magnetMult: number;
  xpMult: number;
  goldMult: number;
  luck: number;
}

export function metaBonuses(levels: MetaLevels): MetaBonuses {
  const l = (id: MetaId) => metaLevel(levels, id);
  return {
    hpMult: 1 + 0.1 * l('hp'),
    damageMult: 1 + 0.06 * l('power'),
    speedMult: 1 + 0.04 * l('speed'),
    magnetMult: 1 + 0.12 * l('magnet'),
    xpMult: 1 + 0.08 * l('xp'),
    goldMult: 1 + 0.1 * l('greed'),
    luck: 0.1 * l('luck'),
  };
}

export interface RunResult {
  timeSec: number;
  kills: number;
  coins: number;
  level: number;
  victory: boolean;
}

/** Coins banked at the end of a run: what you picked up, plus a bonus for surviving and winning. */
export function bankedCoins(r: RunResult): number {
  return Math.round(r.coins + r.timeSec / 6 + r.kills / 25 + (r.victory ? 150 : 0));
}
