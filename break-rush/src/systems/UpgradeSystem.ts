export type UpgradeId = 'power' | 'speed' | 'breaker' | 'combo' | 'rush' | 'critical';

export interface PlayerStats {
  damageMult: number;
  speedMult: number;
  breakMult: number;
  comboBonusMs: number;
  rushMult: number;
  critChance: number;
}

export const BASE_STATS: PlayerStats = { damageMult: 1, speedMult: 1, breakMult: 1, comboBonusMs: 0, rushMult: 1, critChance: 0 };

export const UPGRADES: Record<UpgradeId, { name: string; desc: string }> = {
  power: { name: 'POWER', desc: 'Attack +20%' },
  speed: { name: 'SPEED', desc: 'Move speed +15%' },
  breaker: { name: 'BREAKER', desc: 'Break damage +30%' },
  combo: { name: 'COMBO', desc: 'Combo time +1s' },
  rush: { name: 'RUSH', desc: 'RUSH damage +50%' },
  critical: { name: 'CRITICAL', desc: 'Crit chance +10%' },
};

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

/** Combo time bonus is capped so the full window stays at 5s (spec). */
export const MAX_COMBO_BONUS_MS = 2500;

export function statsFrom(owned: UpgradeId[]): PlayerStats {
  const n = (id: UpgradeId) => owned.filter((o) => o === id).length;
  return {
    damageMult: 1 + 0.2 * n('power'),
    speedMult: 1 + 0.15 * n('speed'),
    breakMult: 1 + 0.3 * n('breaker'),
    comboBonusMs: Math.min(MAX_COMBO_BONUS_MS, 1000 * n('combo')),
    rushMult: 1 + 0.5 * n('rush'),
    critChance: Math.min(1, 0.1 * n('critical')),
  };
}

/** Picks n distinct upgrades. rand must return [0,1). */
export function rollChoices(rand: () => number, n = 3): UpgradeId[] {
  const pool = [...UPGRADE_IDS];
  const out: UpgradeId[] = [];
  while (out.length < n && pool.length > 0) {
    out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  }
  return out;
}
