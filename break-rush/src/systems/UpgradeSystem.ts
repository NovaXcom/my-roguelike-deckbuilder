export type UpgradeId = 'power' | 'speed' | 'breaker' | 'combo' | 'rush' | 'critical' | 'vampire' | 'armor' | 'vitality' | 'magnet' | 'fortune' | 'wisdom';

export interface PlayerStats {
  damageMult: number;
  speedMult: number;
  breakMult: number;
  comboBonusMs: number;
  rushMult: number;
  critChance: number;
  /** HP restored per kill. */
  killHeal: number;
  /** Multiplier on damage taken (< 1 = tankier). */
  damageTakenMult: number;
  /** Extra time the RUSH prompt stays up. */
  rushWindowBonusMs: number;
  /** Extra damage multiplier against broken enemies. */
  brokenDamageMult: number;
  /** Extra max HP from perks / relics / meta. */
  maxHpBonus: number;
  magnetMult: number;
  goldMult: number;
  xpMult: number;
  ultGainMult: number;
  /** < 1 = faster skill cooldowns. */
  cooldownMult: number;
}

export const BASE_STATS: PlayerStats = {
  damageMult: 1, speedMult: 1, breakMult: 1, comboBonusMs: 0, rushMult: 1, critChance: 0,
  killHeal: 0, damageTakenMult: 1, rushWindowBonusMs: 0, brokenDamageMult: 1,
  maxHpBonus: 0, magnetMult: 1, goldMult: 1, xpMult: 1, ultGainMult: 1, cooldownMult: 1,
};

export const UPGRADES: Record<UpgradeId, { name: string; desc: string }> = {
  power: { name: 'POWER', desc: 'Attack +20%' },
  speed: { name: 'SPEED', desc: 'Move speed +15%' },
  breaker: { name: 'BREAKER', desc: 'Break damage +30%' },
  combo: { name: 'COMBO', desc: 'Combo time +1s' },
  rush: { name: 'RUSH', desc: 'RUSH damage +50%' },
  critical: { name: 'CRITICAL', desc: 'Crit chance +10%' },
  vampire: { name: 'VAMPIRE', desc: 'Heal 2 HP per kill' },
  armor: { name: 'ARMOR', desc: 'Damage taken -20%' },
  vitality: { name: 'VITALITY', desc: 'Max HP +20 (and heal 20)' },
  magnet: { name: 'MAGNET', desc: 'Loot pull range +60%' },
  fortune: { name: 'FORTUNE', desc: 'Gold found +25%' },
  wisdom: { name: 'WISDOM', desc: 'XP gained +15%' },
};

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];
/** Always available. The rest must be unlocked first. */
export const BASE_UPGRADE_IDS: UpgradeId[] = ['power', 'speed', 'breaker', 'combo', 'rush', 'critical', 'vitality', 'magnet', 'fortune', 'wisdom'];

/** Combo time bonus is capped so the full window stays at 5s (spec). */
export const MAX_COMBO_BONUS_MS = 2500;

export interface Synergy {
  id: string;
  name: string;
  desc: string;
  needs: UpgradeId[];
}

/** Owning at least one of every required upgrade activates the synergy. */
export const SYNERGIES: Synergy[] = [
  { id: 'blitz', name: 'BLITZ RUSHER', desc: 'RUSH prompt +1s, crit +10%', needs: ['rush', 'critical', 'speed'] },
  { id: 'breakmaster', name: 'BREAK MASTER', desc: 'Broken enemies take +50% damage', needs: ['breaker', 'power', 'combo'] },
  { id: 'juggernaut', name: 'JUGGERNAUT', desc: 'Kill heal x2, damage taken -10%', needs: ['armor', 'vampire', 'power'] },
];

export function activeSynergies(owned: UpgradeId[]): Synergy[] {
  return SYNERGIES.filter((s) => s.needs.every((n) => owned.includes(n)));
}

/** The synergy that picking `id` would newly complete, if any. */
export function completesSynergy(owned: UpgradeId[], id: UpgradeId): Synergy | null {
  const before = activeSynergies(owned).map((s) => s.id);
  return activeSynergies([...owned, id]).find((s) => !before.includes(s.id)) ?? null;
}

export function statsFrom(owned: UpgradeId[]): PlayerStats {
  const n = (id: UpgradeId) => owned.filter((o) => o === id).length;
  const st: PlayerStats = {
    ...BASE_STATS,
    damageMult: 1 + 0.2 * n('power'),
    speedMult: 1 + 0.15 * n('speed'),
    breakMult: 1 + 0.3 * n('breaker'),
    comboBonusMs: Math.min(MAX_COMBO_BONUS_MS, 1000 * n('combo')),
    rushMult: 1 + 0.5 * n('rush'),
    critChance: 0.1 * n('critical'),
    killHeal: 2 * n('vampire'),
    damageTakenMult: 1 - 0.2 * n('armor'),
    maxHpBonus: 20 * n('vitality'),
    magnetMult: 1 + 0.6 * n('magnet'),
    goldMult: 1 + 0.25 * n('fortune'),
    xpMult: 1 + 0.15 * n('wisdom'),
  };
  for (const s of activeSynergies(owned)) {
    if (s.id === 'blitz') {
      st.rushWindowBonusMs += 1000;
      st.critChance += 0.1;
    } else if (s.id === 'breakmaster') {
      st.brokenDamageMult *= 1.5;
    } else if (s.id === 'juggernaut') {
      st.killHeal *= 2;
      st.damageTakenMult -= 0.1;
    }
  }
  st.critChance = Math.min(1, st.critChance);
  st.damageTakenMult = Math.max(0.3, st.damageTakenMult);
  return st;
}

/**
 * Picks n distinct upgrades from `pool`, preferring ones not in `avoid` (last stage's offer) so
 * consecutive offers differ. rand must return [0,1).
 */
export function rollChoices(rand: () => number, n = 3, pool: UpgradeId[] = BASE_UPGRADE_IDS, avoid: UpgradeId[] = []): UpgradeId[] {
  const take = (from: UpgradeId[], count: number): UpgradeId[] => {
    const bag = [...from];
    const out: UpgradeId[] = [];
    while (out.length < count && bag.length > 0) out.push(bag.splice(Math.floor(rand() * bag.length), 1)[0]);
    return out;
  };
  const fresh = take(pool.filter((p) => !avoid.includes(p)), n);
  if (fresh.length >= n) return fresh;
  return [...fresh, ...take(pool.filter((p) => avoid.includes(p)), n - fresh.length)];
}
