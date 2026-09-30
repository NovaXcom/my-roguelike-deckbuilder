import {
  CHAIN_MULT, alive, createBattle, startPlayerTurn, type BattleSetup, type BattleState, type EnemyScale,
} from './battle';
import { MEMBERS, PARTY_ORDER } from './data';
import {
  BUY_PRICE, SELL_VALUE, rollItem, type EquipItem, type EquipStats, type Slot,
} from './equipment';
import { generateMap, startNodes, type DungeonMap, type MapNode } from './map';
import { passivesFor, startingGear, startingPotions, type MetaState, type PassiveMods } from './meta';
import { Rng } from './rng';
import type { Role } from './types';

export interface RunMember {
  role: Role;
  hp: number;
  gear: Record<Slot, EquipItem | null>;
}

export interface ShopStock {
  items: (EquipItem | null)[];
  potionsLeft: number;
}

export const POTION_PRICE = 30;
export const POTION_RATIO = 0.35;
export const REST_RATIO = 0.3;
export const REVIVE_RATIO = 0.25;

/** 1回の挑戦(ダンジョン攻略)の状態。UIから独立した純データ + 関数群。 */
export interface RunState {
  rng: Rng;
  map: DungeonMap;
  current: number | null;
  visited: number[];
  party: RunMember[];
  gold: number;
  stones: number; // このランで集めた魔導石（終了時に拠点へ加算）
  potions: number;
  bonusHp: number; // 休憩所の修練による最大HP加算
  passives: PassiveMods;
  nextUid: number;
  shops: Record<number, ShopStock>;
  finished: null | 'victory' | 'defeat';
  banked: boolean;
}

export function newRun(meta: MetaState, seed: number): RunState {
  const rng = new Rng(seed);
  let uid = 1;
  const nextUid = () => uid++;
  const run: RunState = {
    rng,
    map: generateMap(rng),
    current: null,
    visited: [],
    party: PARTY_ORDER.map((role) => {
      const g = startingGear(role, meta.smith, nextUid);
      return { role, hp: 1, gear: { weapon: g.weapon, armor: g.armor, accessory: null } };
    }),
    gold: 30,
    stones: 0,
    potions: startingPotions(meta.alchemy),
    bonusHp: 0,
    passives: passivesFor(meta.training),
    nextUid: 0,
    shops: {},
    finished: null,
    banked: false,
  };
  run.nextUid = uid;
  run.party.forEach((_, i) => { run.party[i].hp = memberMaxHp(run, i); });
  return run;
}

export const takeUid = (run: RunState): number => run.nextUid++;

// ------------------------------------------------------------------ ステータス
export function gearStats(m: RunMember): EquipStats {
  const t: EquipStats = { hp: 0, power: 0, guard: 0, breakBonus: 0 };
  for (const it of Object.values(m.gear)) {
    if (!it) continue;
    t.hp += it.stats.hp; t.power += it.stats.power; t.guard += it.stats.guard; t.breakBonus += it.stats.breakBonus;
  }
  return t;
}

export function memberMaxHp(run: RunState, i: number): number {
  return MEMBERS[run.party[i].role].maxHp + run.passives.hp + run.bonusHp + gearStats(run.party[i]).hp;
}

export function memberSkills(run: RunState, i: number): string[] {
  const m = run.party[i];
  const extra = m.gear.weapon?.skill;
  return extra ? [...MEMBERS[m.role].skills, extra] : [...MEMBERS[m.role].skills];
}

export function buildSetup(run: RunState): BattleSetup {
  return {
    chainMult: CHAIN_MULT + run.passives.chainBonus,
    members: run.party.map((m, i) => {
      const g = gearStats(m);
      return {
        role: m.role,
        hp: m.hp,
        maxHp: memberMaxHp(run, i),
        power: g.power + run.passives.power,
        guardBonus: g.guard,
        breakBonus: g.breakBonus + run.passives.breakBonus,
        openingGuard: m.role === 'knight' ? run.passives.knightOpeningGuard : 0,
        skills: memberSkills(run, i),
      };
    }),
  };
}

// ------------------------------------------------------------------ マップ移動
export function availableNodes(run: RunState): MapNode[] {
  if (run.finished) return [];
  if (run.current === null) return startNodes(run.map);
  return run.map.nodes[run.current].next.map((id) => run.map.nodes[id]);
}

export function enterNode(run: RunState, id: number): MapNode | null {
  const node = availableNodes(run).find((n) => n.id === id);
  if (!node) return null;
  run.current = id;
  run.visited.push(id);
  return node;
}

export function pickEnemy(run: RunState, node: MapNode): string {
  if (node.type === 'boss') return 'dragon';
  if (node.row <= 2) return run.rng.pick(['slime', 'bat']);
  if (node.row <= 5) return run.rng.pick(['bat', 'skeleton', 'slime']);
  return run.rng.pick(['skeleton', 'golem']);
}

/** 階層が深いほど敵のHP・攻撃力が上がる */
export function enemyScale(node: MapNode): EnemyScale {
  if (node.type === 'boss') return { hp: 1.9, atk: 1.8 };
  return { hp: 1 + 0.26 * node.row, atk: 1 + 0.2 * node.row };
}

/** ノードの戦闘を開始（敵の抽選・装備補正・階層補正込み。プレイヤーターン1開始済み） */
export function startBattle(run: RunState, node: MapNode): BattleState {
  const s = createBattle(pickEnemy(run, node), buildSetup(run), enemyScale(node));
  startPlayerTurn(s);
  return s;
}

// ------------------------------------------------------------------ 戦闘結果と報酬
export interface Reward {
  gold: number;
  stones: number;
  item: EquipItem | null;
}

/** 戦闘終了を反映: HP持ち越し(戦闘不能者は復活)、報酬付与、ボス撃破/全滅でラン終了 */
export function finishBattle(run: RunState, s: BattleState, node: MapNode): Reward {
  run.party.forEach((m, i) => {
    const b = s.party[i];
    m.hp = alive(b) ? b.hp : Math.max(1, Math.round(memberMaxHp(run, i) * REVIVE_RATIO));
  });
  const none: Reward = { gold: 0, stones: 0, item: null };
  if (s.phase === 'lost') {
    run.finished = 'defeat';
    return none;
  }
  const boss = node.type === 'boss';
  const r = run.rng;
  const reward: Reward = {
    gold: r.range(12, 22) + node.row * 2 + (boss ? 50 : 0),
    stones: 3 + node.row + (boss ? 40 : 0),
    item: boss ? rollItem(r, 'boss', takeUid(run)) : r.next() < 0.55 ? rollItem(r, 'battle', takeUid(run)) : null,
  };
  run.gold += reward.gold;
  run.stones += reward.stones;
  if (boss) {
    run.stones += 20; // 踏破ボーナス
    run.finished = 'victory';
  }
  return reward;
}

export function openChest(run: RunState): Reward {
  const reward: Reward = { gold: run.rng.range(20, 40), stones: 5, item: rollItem(run.rng, 'chest', takeUid(run)) };
  run.gold += reward.gold;
  run.stones += reward.stones;
  return reward;
}

// ------------------------------------------------------------------ 装備
export function canEquip(run: RunState, member: number, item: EquipItem): boolean {
  const m = run.party[member];
  return !!m && (item.role === 'any' || item.role === m.role);
}

/** 装備する。旧装備は自動売却。最大HPの増減分だけ現在HPも動かす。 */
export function equip(run: RunState, member: number, item: EquipItem): { replaced: EquipItem | null; sold: number } {
  if (!canEquip(run, member, item)) throw new Error('この装備は装備できません');
  const m = run.party[member];
  const before = memberMaxHp(run, member);
  const replaced = m.gear[item.slot];
  m.gear[item.slot] = item;
  const delta = memberMaxHp(run, member) - before;
  m.hp = Math.min(memberMaxHp(run, member), Math.max(1, m.hp + delta));
  const sold = replaced ? SELL_VALUE[replaced.rarity] : 0;
  run.gold += sold;
  return { replaced, sold };
}

export function sellItem(run: RunState, item: EquipItem): number {
  run.gold += SELL_VALUE[item.rarity];
  return SELL_VALUE[item.rarity];
}

// ------------------------------------------------------------------ ショップ / 休憩 / ポーション
export function shopStock(run: RunState, nodeId: number): ShopStock {
  if (!run.shops[nodeId]) {
    run.shops[nodeId] = {
      items: [0, 1, 2].map(() => rollItem(run.rng, 'shop', takeUid(run))),
      potionsLeft: 2,
    };
  }
  return run.shops[nodeId];
}

export const priceOf = (item: EquipItem): number => BUY_PRICE[item.rarity];

export function buyItem(run: RunState, nodeId: number, index: number): EquipItem | null {
  const stock = shopStock(run, nodeId);
  const item = stock.items[index];
  if (!item || run.gold < priceOf(item)) return null;
  run.gold -= priceOf(item);
  stock.items[index] = null;
  return item;
}

export function buyPotion(run: RunState, nodeId: number): boolean {
  const stock = shopStock(run, nodeId);
  if (stock.potionsLeft <= 0 || run.gold < POTION_PRICE) return false;
  run.gold -= POTION_PRICE;
  stock.potionsLeft -= 1;
  run.potions += 1;
  return true;
}

function healParty(run: RunState, ratio: number): void {
  run.party.forEach((m, i) => {
    const max = memberMaxHp(run, i);
    m.hp = Math.min(max, m.hp + Math.ceil(max * ratio));
  });
}

/** 休憩所: heal=HP30%回復 / train=全員の最大HP+6(永続・このラン中) */
export function rest(run: RunState, choice: 'heal' | 'train'): void {
  if (choice === 'heal') healParty(run, REST_RATIO);
  else {
    run.bonusHp += 6;
    run.party.forEach((m) => { m.hp += 6; });
  }
}

/** マップ上でポーションを使う */
export function usePotionOnMap(run: RunState): boolean {
  if (run.potions <= 0) return false;
  run.potions -= 1;
  healParty(run, POTION_RATIO);
  return true;
}

/** ラン終了時に魔導石を拠点へ持ち帰る（1回のみ） */
export function bankRun(meta: MetaState, run: RunState): number {
  if (run.banked) return 0;
  run.banked = true;
  meta.stones += run.stones;
  meta.runs += 1;
  if (run.finished === 'victory') meta.clears += 1;
  return run.stones;
}
