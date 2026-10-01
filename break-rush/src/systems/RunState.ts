import { Difficulty } from './Difficulty';
import { MetaBonuses, MetaLevels, metaBonuses } from './Meta';
import { RELIC_IDS, RelicId } from './Relics';
import { Progress, RoomType } from './RunMap';
import { UpgradeId } from './UpgradeSystem';

export const BASE_MAX_HP = 100;

/** Everything that carries from room to room within one run. */
export interface RunState {
  difficulty: Difficulty;
  progress: Progress;
  roomType: RoomType;
  hp: number;
  gold: number;
  level: number;
  xp: number;
  ult: number;
  owned: UpgradeId[];
  relics: RelicId[];
  kills: number;
  maxCombo: number;
  score: number;
  damageTaken: number;
  timeMs: number;
  /** Upgrades offered at the previous level-up, avoided next time so offers vary. */
  lastOffered: UpgradeId[];
  phoenixUsed: boolean;
  meta: MetaBonuses;
}

export function newRun(difficulty: Difficulty = 'normal', metaLevels: MetaLevels = {}, rand: () => number = Math.random): RunState {
  const meta = metaBonuses(metaLevels);
  const relics: RelicId[] = meta.startRelic ? [RELIC_IDS[Math.floor(rand() * RELIC_IDS.length)]] : [];
  return {
    difficulty,
    progress: { zone: 1, room: 0 },
    roomType: 'combat',
    hp: BASE_MAX_HP + meta.maxHp,
    gold: meta.startGold,
    level: 1,
    xp: 0,
    ult: meta.startUlt,
    owned: [],
    relics,
    kills: 0,
    maxCombo: 0,
    score: 0,
    damageTaken: 0,
    timeMs: 0,
    lastOffered: [],
    phoenixUsed: false,
    meta,
  };
}

export interface RunSummary {
  victory: boolean;
  zone: number;
  room: number;
  level: number;
  kills: number;
  gold: number;
  maxCombo: number;
  score: number;
  timeSec: number;
  shards: number;
  bestBefore: number;
  newRecord: boolean;
  unlocked: string[];
  relics: RelicId[];
  rooms: number;
}
