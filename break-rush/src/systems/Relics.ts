import { PlayerStats } from './UpgradeSystem';

export type RelicId = 'blast' | 'storm' | 'quake' | 'thorns' | 'phoenix' | 'idol' | 'overcharge' | 'anklet';

export interface RelicDef {
  name: string;
  desc: string;
  /** Single capital letter shown on the HUD icon. */
  glyph: string;
  color: number;
}

export const RELICS: Record<RelicId, RelicDef> = {
  blast: { name: 'BLAST CORE', desc: 'Enemies explode when they die', glyph: 'B', color: 0xff7a33 },
  storm: { name: 'STORM CHARM', desc: 'Crits call lightning on 2 nearby foes', glyph: 'S', color: 0x66ccff },
  quake: { name: 'QUAKE BOOTS', desc: 'Dodging sends out a shockwave', glyph: 'Q', color: 0xd9a066 },
  thorns: { name: 'SPIKED PLATE', desc: 'Getting hit releases a shockwave', glyph: 'T', color: 0xcccccc },
  phoenix: { name: 'PHOENIX FEATHER', desc: 'Revive once with half HP', glyph: 'P', color: 0xff5566 },
  idol: { name: 'GOLD IDOL', desc: 'Gold x1.5, loot magnet +50%', glyph: 'G', color: 0xffd633 },
  overcharge: { name: 'OVERCHARGER', desc: 'Ultimate charges 60% faster', glyph: 'O', color: 0xb06cff },
  anklet: { name: 'WIND ANKLET', desc: 'Skill cooldown -35%', glyph: 'W', color: 0x7affc8 },
};

export const RELIC_IDS = Object.keys(RELICS) as RelicId[];

export function hasRelic(owned: RelicId[], id: RelicId): boolean {
  return owned.includes(id);
}

/** Applies the numeric parts of relics on top of perk stats. Effect-type relics are checked where they trigger. */
export function applyRelics(stats: PlayerStats, owned: RelicId[]): PlayerStats {
  const st = { ...stats };
  if (hasRelic(owned, 'idol')) {
    st.goldMult *= 1.5;
    st.magnetMult *= 1.5;
  }
  if (hasRelic(owned, 'overcharge')) st.ultGainMult *= 1.6;
  if (hasRelic(owned, 'anklet')) st.cooldownMult *= 0.65;
  return st;
}

/** Picks n distinct relics the player does not own yet. */
export function rollRelics(rand: () => number, owned: RelicId[], n = 3): RelicId[] {
  const pool = RELIC_IDS.filter((r) => !owned.includes(r));
  const out: RelicId[] = [];
  while (out.length < n && pool.length > 0) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}
