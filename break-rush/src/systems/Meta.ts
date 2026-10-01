/** Permanent upgrades bought with shards between runs. */
export type MetaId = 'vit' | 'atk' | 'gold' | 'xp' | 'ult' | 'relic';

export interface MetaDef {
  name: string;
  desc: string;
  max: number;
  baseCost: number;
}

export const META_DEFS: Record<MetaId, MetaDef> = {
  vit: { name: 'VITALITY', desc: '+10 max HP per level', max: 5, baseCost: 25 },
  atk: { name: 'MIGHT', desc: '+6% attack per level', max: 5, baseCost: 30 },
  gold: { name: 'FORTUNE', desc: '+30 starting gold per level', max: 5, baseCost: 20 },
  xp: { name: 'WISDOM', desc: '+8% XP per level', max: 5, baseCost: 25 },
  ult: { name: 'FURY', desc: 'Start with +20 ultimate charge per level', max: 3, baseCost: 35 },
  relic: { name: 'HERITAGE', desc: 'Start the run with a random relic', max: 1, baseCost: 120 },
};

export const META_IDS = Object.keys(META_DEFS) as MetaId[];

export type MetaLevels = Partial<Record<MetaId, number>>;

export function metaLevel(levels: MetaLevels, id: MetaId): number {
  return Math.min(META_DEFS[id].max, Math.max(0, Math.floor(levels[id] ?? 0)));
}

/** Cost of the next level of `id`; each level costs more. */
export function metaCost(levels: MetaLevels, id: MetaId): number {
  return META_DEFS[id].baseCost * (metaLevel(levels, id) + 1);
}

export function canBuyMeta(shards: number, levels: MetaLevels, id: MetaId): boolean {
  return metaLevel(levels, id) < META_DEFS[id].max && shards >= metaCost(levels, id);
}

export function buyMeta(shards: number, levels: MetaLevels, id: MetaId): { shards: number; levels: MetaLevels } | null {
  if (!canBuyMeta(shards, levels, id)) return null;
  return { shards: shards - metaCost(levels, id), levels: { ...levels, [id]: metaLevel(levels, id) + 1 } };
}

export interface MetaBonuses {
  maxHp: number;
  damageMult: number;
  startGold: number;
  xpMult: number;
  startUlt: number;
  startRelic: boolean;
}

export function metaBonuses(levels: MetaLevels): MetaBonuses {
  return {
    maxHp: 10 * metaLevel(levels, 'vit'),
    damageMult: 1 + 0.06 * metaLevel(levels, 'atk'),
    startGold: 30 * metaLevel(levels, 'gold'),
    xpMult: 1 + 0.08 * metaLevel(levels, 'xp'),
    startUlt: 20 * metaLevel(levels, 'ult'),
    startRelic: metaLevel(levels, 'relic') > 0,
  };
}

export interface RunOutcome {
  roomsCleared: number;
  zonesCleared: number;
  kills: number;
  victory: boolean;
}

/** Shards earned from a run (win or lose), so every run makes the next one stronger. */
export function shardsEarned(o: RunOutcome): number {
  return o.roomsCleared * 4 + o.zonesCleared * 15 + Math.floor(o.kills / 4) + (o.victory ? 50 : 0);
}
