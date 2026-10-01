export type WeaponId = 'slash' | 'orbit' | 'lightning' | 'missile' | 'stomp';
export type PassiveId = 'power' | 'haste' | 'area' | 'speed' | 'magnet' | 'vitality' | 'regen' | 'crit' | 'greed' | 'luck';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export const MAX_WEAPONS = 5;
export const MAX_WEAPON_LEVEL = 8;
export const MAX_PASSIVE_LEVEL = 6;

export const WEAPON_IDS: WeaponId[] = ['slash', 'orbit', 'lightning', 'missile', 'stomp'];
export const PASSIVE_IDS: PassiveId[] = ['power', 'haste', 'area', 'speed', 'magnet', 'vitality', 'regen', 'crit', 'greed', 'luck'];

export const WEAPON_INFO: Record<WeaponId, { name: string; desc: string; icon: string; color: number }> = {
  slash: { name: 'SLASH WAVE', desc: 'Big arc slashes toward foes', icon: '⚔', color: 0xffe066 },
  orbit: { name: 'ORBIT BLADES', desc: 'Blades spin around you', icon: '✴', color: 0x66e0ff },
  lightning: { name: 'THUNDER', desc: 'Lightning strikes random foes', icon: '⚡', color: 0xb9a3ff },
  missile: { name: 'HOMING MISSILES', desc: 'Explosive seekers', icon: '🚀', color: 0xff8a4d },
  stomp: { name: 'QUAKE STOMP', desc: 'Shockwave rings knock back', icon: '◎', color: 0xff6ad5 },
};

export const PASSIVE_INFO: Record<PassiveId, { name: string; desc: string; icon: string }> = {
  power: { name: 'POWER', desc: '+15% damage', icon: '💪' },
  haste: { name: 'HASTE', desc: '-8% cooldowns', icon: '⏩' },
  area: { name: 'AREA', desc: '+10% attack size', icon: '⭕' },
  speed: { name: 'SPEED', desc: '+6% move speed', icon: '👟' },
  magnet: { name: 'MAGNET', desc: '+25% pickup range', icon: '🧲' },
  vitality: { name: 'VITALITY', desc: '+20 max HP & heal', icon: '❤' },
  regen: { name: 'REGEN', desc: '+0.6 HP per second', icon: '✚' },
  crit: { name: 'CRITICAL', desc: '+7% crit chance (x2.5)', icon: '🎯' },
  greed: { name: 'GREED', desc: '+20% coins', icon: '💰' },
  luck: { name: 'LUCK', desc: 'Better card rarity', icon: '🍀' },
};

export interface RarityDef {
  name: string;
  /** Levels granted by a card of this rarity (and a multiplier for passives). */
  levels: number;
  weight: number;
  color: string;
}

export const RARITY: Record<Rarity, RarityDef> = {
  common: { name: 'COMMON', levels: 1, weight: 70, color: '#b8c4d6' },
  rare: { name: 'RARE', levels: 1.5, weight: 22, color: '#4da6ff' },
  epic: { name: 'EPIC', levels: 2, weight: 7, color: '#c264ff' },
  legendary: { name: 'LEGENDARY', levels: 3, weight: 1.2, color: '#ffc933' },
};
export const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export interface Loadout {
  weapons: Partial<Record<WeaponId, number>>;
  passives: Partial<Record<PassiveId, number>>;
}

export interface Card {
  kind: 'weapon' | 'passive';
  id: WeaponId | PassiveId;
  rarity: Rarity;
  /** How many levels this card gives (rarity makes it bigger). */
  levels: number;
  isNew: boolean;
}

export function newLoadout(startWeapon: WeaponId): Loadout {
  return { weapons: { [startWeapon]: 1 }, passives: {} };
}

/** Luck shifts weight from common toward the rare tiers. */
export function rollRarity(rand: () => number, luck = 0): Rarity {
  const w = RARITY_ORDER.map((r, i) => (i === 0 ? Math.max(10, RARITY[r].weight - 40 * luck) : RARITY[r].weight * (1 + luck * (i + 0.5))));
  const total = w.reduce((a, b) => a + b, 0);
  let x = rand() * total;
  for (let i = 0; i < w.length; i++) {
    x -= w[i];
    if (x <= 0) return RARITY_ORDER[i];
  }
  return 'common';
}

function levelsFor(rarity: Rarity): number {
  return Math.round(RARITY[rarity].levels);
}

/** Everything the player could still pick, given what they have. */
function candidates(l: Loadout): Array<{ kind: 'weapon' | 'passive'; id: WeaponId | PassiveId; isNew: boolean }> {
  const out: Array<{ kind: 'weapon' | 'passive'; id: WeaponId | PassiveId; isNew: boolean }> = [];
  const owned = WEAPON_IDS.filter((w) => (l.weapons[w] ?? 0) > 0);
  for (const w of WEAPON_IDS) {
    const lv = l.weapons[w] ?? 0;
    if (lv > 0 && lv < MAX_WEAPON_LEVEL) out.push({ kind: 'weapon', id: w, isNew: false });
    if (lv === 0 && owned.length < MAX_WEAPONS) out.push({ kind: 'weapon', id: w, isNew: true });
  }
  for (const p of PASSIVE_IDS) {
    const lv = l.passives[p] ?? 0;
    if (lv < MAX_PASSIVE_LEVEL) out.push({ kind: 'passive', id: p, isNew: lv === 0 });
  }
  return out;
}

/** Three distinct cards. Weapons are favoured early so builds come together fast. */
export function rollCards(rand: () => number, l: Loadout, luck = 0, n = 3): Card[] {
  const pool = candidates(l);
  const cards: Card[] = [];
  while (cards.length < n && pool.length > 0) {
    const weights = pool.map((c) => (c.kind === 'weapon' ? 1.6 : 1) * (c.isNew && c.kind === 'weapon' ? 1.3 : 1));
    const total = weights.reduce((a, b) => a + b, 0);
    let x = rand() * total;
    let pickIdx = 0;
    for (let i = 0; i < pool.length; i++) {
      x -= weights[i];
      if (x <= 0) {
        pickIdx = i;
        break;
      }
    }
    const c = pool.splice(pickIdx, 1)[0];
    const rarity = rollRarity(rand, luck);
    cards.push({ ...c, rarity, levels: levelsFor(rarity) });
  }
  return cards;
}

export function applyCard(l: Loadout, card: Card): void {
  if (card.kind === 'weapon') {
    const id = card.id as WeaponId;
    l.weapons[id] = Math.min(MAX_WEAPON_LEVEL, (l.weapons[id] ?? 0) + card.levels);
  } else {
    const id = card.id as PassiveId;
    l.passives[id] = Math.min(MAX_PASSIVE_LEVEL, (l.passives[id] ?? 0) + card.levels);
  }
}

export interface Mods {
  damageMult: number;
  cooldownMult: number;
  areaMult: number;
  speedMult: number;
  magnetMult: number;
  maxHpBonus: number;
  regen: number;
  critChance: number;
  goldMult: number;
  luck: number;
}

export function modsFrom(l: Loadout): Mods {
  const p = (id: PassiveId) => l.passives[id] ?? 0;
  return {
    damageMult: 1 + 0.15 * p('power'),
    cooldownMult: Math.max(0.4, 1 - 0.08 * p('haste')),
    areaMult: 1 + 0.1 * p('area'),
    speedMult: 1 + 0.06 * p('speed'),
    magnetMult: 1 + 0.25 * p('magnet'),
    maxHpBonus: 20 * p('vitality'),
    regen: 0.6 * p('regen'),
    critChance: 0.07 * p('crit'),
    goldMult: 1 + 0.2 * p('greed'),
    luck: 0.15 * p('luck'),
  };
}

export interface WeaponStats {
  cooldown: number;
  damage: number;
  /** Projectiles / blades / strikes / extra slashes. */
  count: number;
  radius: number;
}

/** Base numbers per weapon level (1-8). Modifiers are applied by the caller via `mods`. */
export function weaponStats(id: WeaponId, level: number, mods: Mods): WeaponStats {
  const L = Math.max(1, Math.min(MAX_WEAPON_LEVEL, level));
  let s: WeaponStats;
  switch (id) {
    case 'slash':
      s = { cooldown: Math.max(0.45, 0.95 - 0.06 * L), damage: 16 + 7 * L, count: 1 + Math.floor(L / 3), radius: 5.0 + 0.4 * L };
      break;
    case 'orbit':
      s = { cooldown: 0.28, damage: 9 + 4 * L, count: 2 + Math.floor(L / 2), radius: 3 + 0.15 * L };
      break;
    case 'lightning':
      s = { cooldown: Math.max(0.6, 1.5 - 0.1 * L), damage: 28 + 9 * L, count: 1 + Math.floor((L + 1) / 2), radius: 1.8 + 0.1 * L };
      break;
    case 'missile':
      s = { cooldown: Math.max(0.7, 1.7 - 0.12 * L), damage: 24 + 8 * L, count: 1 + Math.ceil(L / 2), radius: 2.4 + 0.12 * L };
      break;
    case 'stomp':
      s = { cooldown: Math.max(1.4, 3.4 - 0.25 * L), damage: 20 + 7 * L, count: 1, radius: 6.5 + 0.7 * L };
      break;
  }
  return {
    cooldown: id === 'orbit' ? s.cooldown : s.cooldown * mods.cooldownMult,
    damage: s.damage * mods.damageMult,
    count: s.count,
    radius: s.radius * mods.areaMult,
  };
}
