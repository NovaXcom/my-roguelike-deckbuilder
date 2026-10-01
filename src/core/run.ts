import {
  CHAIN_MULT, MAX_SKILL_LEVEL, alive, createBattle, skillUpgradeCost, startPlayerTurn, type BattleSetup, type BattleState, type EnemyScale,
} from './battle';
import { MEMBERS, PARTY_ORDER, SKILLS, START_LINK_DECK } from './data';
import {
  BUY_PRICE, SELL_VALUE, rollItem, type EquipItem, type EquipStats, type Slot,
} from './equipment';
import { generateMap, startNodes, type DungeonMap, type MapNode } from './map';
import { passivesFor, startingGear, startingPotions, type MetaState, type PassiveMods } from './meta';
import { Rng } from './rng';
import type { EquipEffectId, Role, RunMods } from './types';

export interface RunMember {
  role: Role;
  hp: number;
  gear: Record<Slot, EquipItem | null>;
  /** スキルごとのLv(未設定=1) */
  levels: Record<string, number>;
  /** 恒久デッキ(カードID。重複で枚数)。武器の固有カードは装備中のみ戦闘デッキに加わる */
  deck: string[];
}

export interface ShopStock {
  items: (EquipItem | null)[];
  /** 販売カード(買うとデッキに加わる) */
  cards: (string | null)[];
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
  /** スキルポイント(戦闘勝利で獲得、スキル強化に使う) */
  skillPoints: number;
  /** 呪い(呪われた宝箱を開けた数): 最大HP-10%/個 */
  curse: number;
  /** 今回の旅(特殊条件) */
  mods: RunMods | null;
  /** 連携デッキ(2人共通。毎ターン1枚引く) */
  linkDeck: string[];
  /** これまでに行ったカード削除の回数(料金に影響) */
  removals: number;
  seed: number;
  /** これまでの戦闘数(山札シャッフルのシードに使う) */
  battles: number;
}

export function newRun(meta: MetaState, seed: number, mods: RunMods | null = null): RunState {
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
      return { role, hp: 1, gear: { weapon: g.weapon, armor: g.armor, accessory: null }, levels: {}, deck: [...MEMBERS[role].deck] };
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
    skillPoints: 0,
    curse: 0,
    mods,
    linkDeck: [...START_LINK_DECK],
    removals: 0,
    seed: seed >>> 0,
    battles: 0,
  };
  run.nextUid = uid;
  run.party.forEach((_, i) => { run.party[i].hp = memberMaxHp(run, i); });
  return run;
}

// ------------------------------------------------------------------ デッキ(カード)
export const MIN_DECK = 6;
export const CARD_SKIP_GOLD = 12;
export const CARD_PRICE: Record<'common' | 'rare', number> = { common: 40, rare: 85 };
export const removalCost = (run: RunState): number => 40 + 25 * run.removals;

/** 報酬・ショップに出るカードの一覧(キャラ別・レア度別) */
export function cardPool(role?: Role, rarity?: 'common' | 'rare'): string[] {
  return Object.values(SKILLS)
    .filter((c) => c.reward && (!role || c.reward.owner === role) && (!rarity || c.reward.rarity === rarity))
    .map((c) => c.id);
}

/** カード報酬の3択(重複なし)。エリートはレア寄り。持っているカードも出る(枚数を増やす選択) */
export function rollCardChoices(rng: Rng, elite = false): string[] {
  const out: string[] = [];
  for (let guard = 0; out.length < 3 && guard < 40; guard++) {
    const rarity = rng.next() < (elite ? 0.7 : 0.25) ? 'rare' : 'common';
    const id = rng.pick(cardPool(undefined, rarity));
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

const ownerOf = (cardId: string): Role | 'link' | null => SKILLS[cardId]?.reward?.owner ?? null;

/** カードをデッキに加える。そのカードを使えるキャラ(報酬カードは持ち主)のデッキへ */
export function addCard(run: RunState, cardId: string, role?: Role): boolean {
  if (!SKILLS[cardId]) return false;
  const r = role ?? ownerOf(cardId);
  if (r === 'link' || SKILLS[cardId].link) { run.linkDeck.push(cardId); return true; }
  const m = run.party.find((x) => x.role === r);
  if (!m) return false;
  m.deck.push(cardId);
  return true;
}

/** カードを1枚削除する(最小枚数まで)。成功すればtrue */
export function removeCard(run: RunState, member: number, cardId: string): boolean {
  const m = run.party[member];
  const i = m?.deck.indexOf(cardId) ?? -1;
  if (i < 0 || m.deck.length <= MIN_DECK) return false;
  m.deck.splice(i, 1);
  return true;
}

/** ゴールドを払ってカードを削除(ショップ) */
export function buyRemoval(run: RunState, member: number, cardId: string): boolean {
  const cost = removalCost(run);
  if (run.gold < cost || run.party[member].deck.length <= MIN_DECK || !run.party[member].deck.includes(cardId)) return false;
  run.gold -= cost;
  removeCard(run, member, cardId);
  run.removals += 1;
  return true;
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
  const raw = MEMBERS[run.party[i].role].maxHp + run.passives.hp + run.bonusHp + gearStats(run.party[i]).hp;
  return Math.max(1, Math.round(raw * (1 - CURSE_RATIO * run.curse)));
}

export const CURSE_RATIO = 0.1;

export function memberEffects(run: RunState, i: number): EquipEffectId[] {
  const out: EquipEffectId[] = [];
  for (const it of Object.values(run.party[i].gear)) if (it?.effect && !out.includes(it.effect)) out.push(it.effect);
  return out;
}

export const skillLevel = (run: RunState, i: number, skillId: string): number => run.party[i].levels[skillId] ?? 1;

/** スキルを強化する(Lv1→2:1pt / Lv2→3:2pt)。成功すればtrue */
export function upgradeSkill(run: RunState, i: number, skillId: string): boolean {
  const lv = skillLevel(run, i, skillId);
  if (lv >= MAX_SKILL_LEVEL || !memberSkills(run, i).includes(skillId)) return false;
  const cost = skillUpgradeCost(lv);
  if (run.skillPoints < cost) return false;
  run.skillPoints -= cost;
  run.party[i].levels[skillId] = lv + 1;
  return true;
}

/** 戦闘で使うデッキ(恒久デッキ＋装備中の武器の固有カード) */
export function memberDeck(run: RunState, i: number): string[] {
  const m = run.party[i];
  const extra = m.gear.weapon?.skill;
  return extra ? [...m.deck, extra] : [...m.deck];
}

/** 使えるスキル(カード)の種類 */
export function memberSkills(run: RunState, i: number): string[] {
  return [...new Set(memberDeck(run, i))];
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
        deck: memberDeck(run, i),
        levels: { ...m.levels },
        effects: memberEffects(run, i),
      };
    }),
    mods: run.mods,
    link: [...run.linkDeck],
    seed: (run.seed + run.battles * 7919) >>> 0,
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

/** 敵の編成(1〜3体)。組み合わせに意味を持たせる(守護役+攻撃役、後衛狙い+防御役、溜め攻撃+妨害) */
export function pickEncounter(run: RunState, node: MapNode): string[] {
  const r = run.rng;
  if (node.type === 'boss') return ['dragon'];
  if (node.type === 'elite') return r.pick([['golem', 'skeleton'], ['golem', 'bat', 'skeleton'], ['skeleton', 'skeleton', 'bat']]);
  if (node.row <= 1) return r.pick([['slime'], ['bat'], ['slime', 'slime']]);
  if (node.row <= 3) return r.pick([['slime', 'bat'], ['bat', 'skeleton'], ['slime', 'slime', 'bat'], ['skeleton']]);
  if (node.row <= 5) return r.pick([['golem', 'bat'], ['skeleton', 'bat'], ['golem', 'skeleton'], ['slime', 'bat', 'bat']]);
  return r.pick([['golem', 'skeleton'], ['golem', 'bat', 'bat'], ['skeleton', 'skeleton', 'bat'], ['golem', 'bat', 'skeleton']]);
}

export function pickEnemy(run: RunState, node: MapNode): string {
  if (node.type === 'boss') return 'dragon';
  if (node.type === 'elite') return run.rng.pick(['skeleton', 'golem']);
  if (node.row <= 2) return run.rng.pick(['slime', 'bat']);
  if (node.row <= 5) return run.rng.pick(['bat', 'skeleton', 'slime']);
  return run.rng.pick(['skeleton', 'golem']);
}

/** 階層が深いほど敵のHP・攻撃力が上がる */
/** 編成の体数による1体あたりの補正(体数が多いほど1体は弱い) */
export const GROUP_SCALE: Record<number, EnemyScale> = { 1: { hp: 1, atk: 1 }, 2: { hp: 0.45, atk: 0.42 }, 3: { hp: 0.3, atk: 0.32 } };

export function enemyScale(node: MapNode, mods: RunMods | null = null, count = 1): EnemyScale {
  let hp: number;
  let atk: number;
  if (node.type === 'boss') { hp = 5.5; atk = 2.6; }
  else {
    hp = 1 + 1.2 * node.row;
    atk = 1 + 0.7 * node.row;
    if (node.type === 'elite') { hp *= 1.35; atk *= 1.2; }
    if (node.danger) { hp *= 1.3; atk *= 1.3; }
  }
  const g = GROUP_SCALE[count] ?? GROUP_SCALE[1];
  return { hp: hp * (mods?.enemyHpMult ?? 1) * g.hp, atk: atk * (mods?.enemyAtkMult ?? 1) * g.atk };
}

/** ノードの戦闘を開始（敵の抽選・装備補正・階層補正込み。プレイヤーターン1開始済み） */
export function startBattle(run: RunState, node: MapNode): BattleState {
  run.battles += 1;
  const ids = pickEncounter(run, node);
  const s = createBattle(ids, buildSetup(run), enemyScale(node, run.mods, ids.length));
  startPlayerTurn(s);
  return s;
}

// ------------------------------------------------------------------ 戦闘結果と報酬
export interface Reward {
  gold: number;
  stones: number;
  item: EquipItem | null;
  skillPoints: number;
  /** カード報酬の3択(戦闘勝利時のみ) */
  cards?: string[];
}

/** 戦闘終了を反映: HP持ち越し(戦闘不能者は復活)、報酬付与、ボス撃破/全滅でラン終了 */
export function finishBattle(run: RunState, s: BattleState, node: MapNode): Reward {
  run.party.forEach((m, i) => {
    const b = s.party[i];
    m.hp = alive(b) ? b.hp : Math.max(1, Math.round(memberMaxHp(run, i) * REVIVE_RATIO));
  });
  const none: Reward = { gold: 0, stones: 0, item: null, skillPoints: 0 };
  if (s.phase === 'lost') {
    run.finished = 'defeat';
    return none;
  }
  const boss = node.type === 'boss';
  const elite = node.type === 'elite';
  const mult = (node.danger ? 2 : 1) * (elite ? 1.5 : 1) * (1 + 0.2 * (s.enemies.length - 1));
  const r = run.rng;
  const guaranteed = boss || elite || !!node.danger;
  const reward: Reward = {
    gold: Math.round((r.range(12, 22) + node.row * 2 + (boss ? 50 : 0)) * mult * (run.mods?.goldMult ?? 1)),
    stones: Math.round((3 + node.row + (boss ? 40 : 0)) * mult),
    item: boss ? rollItem(r, 'boss', takeUid(run))
      : elite ? rollItem(r, 'elite', takeUid(run))
      : guaranteed ? rollItem(r, 'chest', takeUid(run))
      : r.next() < 0.55 ? rollItem(r, 'battle', takeUid(run)) : null,
    skillPoints: boss ? 0 : elite ? 2 : 1,
    cards: boss ? undefined : rollCardChoices(r, elite),
  };
  run.skillPoints += reward.skillPoints;
  run.gold += reward.gold;
  run.stones += reward.stones;
  if (boss) {
    run.stones += 20; // 踏破ボーナス
    run.finished = 'victory';
  }
  return reward;
}

export function openChest(run: RunState, cursed = false): Reward {
  const reward: Reward = {
    gold: Math.round(run.rng.range(20, 40) * (run.mods?.goldMult ?? 1)),
    stones: cursed ? 12 : 5,
    item: rollItem(run.rng, cursed ? 'cursed' : 'chest', takeUid(run)),
    skillPoints: 0,
  };
  if (cursed) curseParty(run);
  run.gold += reward.gold;
  run.stones += reward.stones;
  return reward;
}

/** 呪い: 最大HPが10%減る(現在HPも上限まで切り詰める) */
export function curseParty(run: RunState): void {
  run.curse += 1;
  run.party.forEach((m, i) => { m.hp = Math.min(m.hp, memberMaxHp(run, i)); });
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
      cards: rollCardChoices(run.rng, false).slice(0, 2),
      potionsLeft: 2,
    };
  }
  return run.shops[nodeId];
}

export const priceOf = (item: EquipItem): number => BUY_PRICE[item.rarity];
export const cardPriceOf = (cardId: string): number => CARD_PRICE[SKILLS[cardId].reward?.rarity ?? 'common'];

export function buyCard(run: RunState, nodeId: number, index: number): boolean {
  const stock = shopStock(run, nodeId);
  const id = stock.cards[index];
  if (!id || run.gold < cardPriceOf(id)) return false;
  run.gold -= cardPriceOf(id);
  stock.cards[index] = null;
  return addCard(run, id);
}

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
