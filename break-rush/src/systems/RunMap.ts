export type RoomType = 'combat' | 'elite' | 'treasure' | 'rest' | 'shop' | 'boss';

export const ZONES = 3;
/** Rooms per zone; the last one is the boss. */
export const ROOMS_PER_ZONE = 5;

export interface Progress {
  zone: number; // 1-based
  room: number; // 0-based within the zone
}

export const ROOM_INFO: Record<RoomType, { name: string; desc: string }> = {
  combat: { name: 'BATTLE', desc: 'Fight through. Gold & XP.' },
  elite: { name: 'ELITE', desc: 'Tough foes, rich loot, a relic.' },
  treasure: { name: 'TREASURE', desc: 'Choose a free relic.' },
  rest: { name: 'CAMPFIRE', desc: 'Heal, or train for a perk.' },
  shop: { name: 'MERCHANT', desc: 'Spend your gold.' },
  boss: { name: 'BOSS', desc: 'The zone guardian.' },
};

export function isBossRoom(p: Progress): boolean {
  return p.room === ROOMS_PER_ZONE - 1;
}

export function isFinalBoss(p: Progress): boolean {
  return p.zone === ZONES && isBossRoom(p);
}

/** The progress after clearing `p` (rolls into the next zone after its boss). */
export function nextProgress(p: Progress): Progress {
  return isBossRoom(p) ? { zone: p.zone + 1, room: 0 } : { zone: p.zone, room: p.room + 1 };
}

export function roomsClearedBefore(p: Progress): number {
  return (p.zone - 1) * ROOMS_PER_ZONE + p.room;
}

const WEIGHTS: Record<Exclude<RoomType, 'boss'>, number> = { combat: 5, elite: 2.2, treasure: 1.6, rest: 1.6, shop: 1.8 };

/**
 * Options offered after clearing room `p`. The room before the boss always offers a campfire; the boss is automatic.
 * Always at least one fighting room (combat/elite) so there is always a way forward that earns loot.
 */
export function doorChoices(p: Progress, rand: () => number): RoomType[] {
  const next = nextProgress(p);
  if (isBossRoom(next)) return ['boss'];
  const wantRest = next.room === ROOMS_PER_ZONE - 2;
  const pool = (Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>).filter((t) => (t === 'elite' || t === 'treasure' || t === 'shop' ? next.room >= 1 : true));
  const out: RoomType[] = [];
  const pick = (types: RoomType[]) => {
    const total = types.reduce((a, t) => a + WEIGHTS[t as keyof typeof WEIGHTS], 0);
    let r = rand() * total;
    for (const t of types) {
      r -= WEIGHTS[t as keyof typeof WEIGHTS];
      if (r <= 0) return t;
    }
    return types[types.length - 1];
  };
  out.push(pick(['combat', 'elite'].filter((t) => pool.includes(t as never)) as RoomType[]));
  if (wantRest) out.push('rest');
  const want = pool.length >= 3 ? 3 : pool.length;
  while (out.length < want) {
    const remaining = pool.filter((t) => !out.includes(t));
    if (remaining.length === 0) break;
    out.push(pick(remaining));
  }
  return out;
}

export interface DepthMods {
  hp: number;
  dmg: number;
  count: number;
}

/** Enemy scaling with depth. */
export function depthMods(p: Progress): DepthMods {
  const cleared = roomsClearedBefore(p);
  return {
    hp: 1 + 0.18 * cleared + 0.5 * (p.zone - 1),
    dmg: 1 + 0.08 * cleared + 0.3 * (p.zone - 1),
    count: 1 + 0.08 * cleared,
  };
}
