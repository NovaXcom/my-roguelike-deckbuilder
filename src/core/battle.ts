import { ENEMIES, MEMBERS, PARTY_ORDER, SKILLS } from './data';
import type {
  CardInst, DeckState, Element, EnemyIntent, EnemyPhase, EnemyState, EquipEffectId, MemberState, Role, RunMods, SkillBonus, SkillBranch, SkillCond, SkillDef,
} from './types';

export const CHAIN_MULT = 2;
export const SHIELDED_MULT = 0.75;
export const WEAK_MULT = 1.5;
export const RESIST_MULT = 0.5;

export const MAX_SKILL_LEVEL = 3;
const LEVEL_MULT = [1, 1, 1.2, 1.45];
export const AP_MAX = 3;
export const HAND_SIZE = 4;
/** 連携カードを使う手の member 番号(キャラではなく2人共通) */
export const LINK = -1;
export const LINK_HAND = 2;
export const WAIT_COST = 1;
export const skillCost = (sk: SkillDef): number => sk.cost ?? 1;
export const WAIT_GUARD = 5;
export const FOCUS_MULT = 1.2;
export const FOCUS_BREAK = 5;
export const CHARGED_MULT = 1.3;
export const GUARD_POWER_MULT = 1.2;
const ENEMY_BURN = { turns: 3, dmg: 4 };
const ENEMY_BLEED = { turns: 3, dmg: 4 };

/** スキルレベルによる強化後の定義（Lv2: ×1.2 / Lv3: ×1.45、Lv3はCD2以上なら-1） */
export const BRANCH_MULT = 1.3;

/** 分岐を持つカードの Lv3 は「Lv2より少し強い数値(×1.3)＋分岐の効果」。分岐を選んでいない/持たないカードは従来どおり×1.45 */
export function effectiveSkill(skill: SkillDef, level = 1, branch?: 'a' | 'b'): SkillDef {
  const lv = Math.max(1, Math.min(MAX_SKILL_LEVEL, level));
  if (lv === 1) return skill;
  const br = lv === 3 ? skill.branches?.find((b) => b.id === branch) : undefined;
  if (br) {
    const sc3 = (v?: number): number | undefined => (v ? Math.round(v * BRANCH_MULT) : v);
    const add = br.add ?? {};
    const plus = (v: number | undefined, a?: number): number | undefined => (a ? (v ?? 0) + a : v);
    return {
      ...skill,
      damage: plus(sc3(skill.damage), add.damage), breakPower: plus(sc3(skill.breakPower), add.breakPower),
      guardSelf: plus(sc3(skill.guardSelf), add.guardSelf), guardAlly: plus(sc3(skill.guardAlly), add.guardAlly),
      healAll: plus(sc3(skill.healAll), add.healAll),
      cooldown: Math.max(0, skill.cooldown + (br.cooldownDelta ?? 0)),
      ...br.set,
    };
  }
  const k = LEVEL_MULT[lv];
  const sc = (v?: number): number | undefined => (v ? Math.round(v * k) : v);
  return {
    ...skill,
    damage: sc(skill.damage), breakPower: sc(skill.breakPower),
    guardSelf: sc(skill.guardSelf), guardAlly: sc(skill.guardAlly), healAll: sc(skill.healAll),
    cooldown: lv === 3 && skill.cooldown >= 2 ? skill.cooldown - 1 : skill.cooldown,
  };
}
/** スキルポイント: Lv1→2 は1、Lv2→3 は2 */
export const skillUpgradeCost = (level: number): number => level;

export type ReactionId = 'steam' | 'melt' | 'shock' | 'overload' | 'shatter' | 'superconduct';
export interface ReactionDef { id: ReactionId; name: string; dmg: number; text: string }
/** 属性チェイン反応: 敵に最後に当てた属性 → ブレイク中に当てた属性 */
export const REACTIONS: Record<string, ReactionDef> = {
  'fire>ice': { id: 'steam', name: '蒸気爆発', dmg: 6, text: '+6ダメージ・敵を弱体化(次の攻撃-25%)' },
  'ice>fire': { id: 'melt', name: '融解', dmg: 10, text: '+10ダメージ' },
  'fire>thunder': { id: 'shock', name: '感電爆発', dmg: 12, text: '+12ダメージ・味方全員が帯電(次のダメージ+30%)' },
  'thunder>fire': { id: 'overload', name: '過電流', dmg: 0, text: '敵を強火傷(5×3ターン)' },
  'ice>thunder': { id: 'shatter', name: '凍結粉砕', dmg: 8, text: '+8ダメージ・凍結(シールド回復が半分)' },
  'thunder>ice': { id: 'superconduct', name: '超伝導', dmg: 4, text: '+4ダメージ・味方全員のCD-1' },
};
export function reactionFor(prev: Element | null, cur: Element): ReactionDef | null {
  if (!prev || prev === 'none' || cur === 'none' || prev === cur) return null;
  return REACTIONS[`${prev}>${cur}`] ?? null;
}

export type BattlePhase = 'player' | 'enemy' | 'won' | 'lost';

export interface BattleState {
  party: MemberState[]; // [0]=前衛 [1]=後衛
  /** 敵の編成(1〜3体)。倒れた敵も配列に残る(hp<=0) */
  enemies: EnemyState[];
  /** 先頭の敵(enemies[0]と同一オブジェクト。単体戦・旧コード互換用) */
  enemy: EnemyState;
  turn: number;
  /** 残り行動ポイント(1ターンに2人で使える行動の総数) */
  ap: number;
  apMax: number;
  /** デッキ戦闘か(旧方式=全スキルが常に手札・CD制。テスト・互換用) */
  deckMode: boolean;
  /** 連携デッキ(2人共通)。手札は最大2枚 */
  link: DeckState;
  /** このターンの直前の攻撃(追撃の参照先) */
  lastHit: { member: number; skillId: string; enemy: number } | null;
  /** このターンに最後に使った魔法の属性(魔力付与の参照先) */
  lastMagic: Element | null;
  /** 魔力付与: 次の物理攻撃に付く属性 */
  enchant: Element | null;
  /** 反撃指令: このターン、ナイトが攻撃を受けたら反撃する */
  counterOn: boolean;
  /** 山札シャッフル用の乱数状態(決定論的) */
  rngState: number;
  nextUid: number;
  phase: BattlePhase;
  chainMult: number;
  mods: RunMods | null;
}

/** 戦闘開始時のパーティ状態。ラン(装備・パッシブ・持ち越しHP)から組み立てる。 */
export interface MemberSetup {
  role: Role;
  hp: number;
  maxHp: number;
  power: number;
  guardBonus: number;
  breakBonus: number;
  openingGuard: number;
  skills: string[];
  /** デッキ(カードID。重複で枚数)。指定するとデッキ戦闘になる */
  deck?: string[];
  levels?: Record<string, number>;
  branches?: Record<string, 'a' | 'b'>;
  effects?: EquipEffectId[];
}
export interface BattleSetup {
  members: MemberSetup[];
  chainMult: number;
  mods?: RunMods | null;
  /** 山札シャッフルのシード */
  seed?: number;
  /** 連携デッキ(カードID) */
  link?: string[];
}

export function defaultSetup(): BattleSetup {
  return {
    chainMult: CHAIN_MULT,
    members: PARTY_ORDER.map((role) => ({
      role, hp: MEMBERS[role].maxHp, maxHp: MEMBERS[role].maxHp,
      power: 0, guardBonus: 0, breakBonus: 0, openingGuard: 0, skills: [...MEMBERS[role].skills],
    })),
  };
}

export type BattleEvent =
  | { type: 'skill'; member: number; skillId: string }
  | { type: 'damage'; enemy: number; amount: number; absorbed: number; element: SkillDef['element']; weak: boolean; resist: boolean; chain: boolean }
  | { type: 'reaction'; enemy: number; id: ReactionId; name: string; amount: number }
  | { type: 'status'; enemy?: number; kind: 'burn' | 'bleed' | 'freeze' | 'weaken' | 'charge' | 'focus' | 'enchant' | 'convert' | 'counter' }
  | { type: 'counter'; enemy: number; amount: number }
  | { type: 'dot'; enemy: number; kind: 'burn' | 'bleed'; amount: number }
  | { type: 'wait'; member: number }
  | { type: 'enemyCharge'; enemy: number; intent: EnemyIntent }
  | { type: 'enemyGuard'; enemy: number; amount: number }
  | { type: 'canceled'; enemy: number; intent: EnemyIntent }
  | { type: 'phase'; enemy: number; index: number; name: string; text: string }
  | { type: 'enemyHeal'; enemy: number; amount: number }
  | { type: 'disrupt'; enemy: number; member: number; skillId: string }
  | { type: 'hurt'; member: number; amount: number; blocked: number }
  | { type: 'guard'; member: number; amount: number }
  | { type: 'heal'; member: number; amount: number }
  | { type: 'taunt'; member: number }
  | { type: 'shield'; enemy: number; amount: number }
  | { type: 'break'; enemy: number }
  | { type: 'chain'; enemy: number; element: SkillDef['element']; amount: number }
  | { type: 'stunned'; enemy: number }
  | { type: 'recover'; enemy: number }
  | { type: 'enemyDown'; enemy: number }
  /** target=-1 は全体攻撃 */
  | { type: 'enemyAttack'; enemy: number; intent: EnemyIntent; target: number }
  | { type: 'down'; member: number };

export interface EnemyScale {
  hp: number;
  atk: number;
}

/** 敵1体分の初期状態 */
export function makeEnemy(enemyId: string, scale: EnemyScale = { hp: 1, atk: 1 }): EnemyState {
  const def = ENEMIES[enemyId];
  const maxHp = Math.round(def.maxHp * scale.hp);
  return {
    def, hp: maxHp, maxHp, shield: def.maxShield, maxShield: def.maxShield, broken: false, patternIndex: 0, atkMult: scale.atk,
    guard: 0, burn: null, bleed: null, frozen: false, weakened: false, lastElement: null, phase: 0,
  };
}

/** enemyId は単体のID、または編成(IDの配列)。scale は全員共通、または敵ごと */
/** 決定論的乱数(状態は BattleState に持つ。複製しても壊れない) */
export function nextRand(s: { rngState: number }): number {
  s.rngState = (s.rngState + 0x6d2b79f5) >>> 0;
  let t = s.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shuffleInPlace<T>(s: { rngState: number }, a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const emptyDeck = (): DeckState => ({ draw: [], hand: [], discard: [], fatigued: [], exhausted: [] });

export function createBattle(
  enemyId: string | string[] = 'slime',
  setup: BattleSetup = defaultSetup(),
  scale: EnemyScale | EnemyScale[] = { hp: 1, atk: 1 },
): BattleState {
  const ids = Array.isArray(enemyId) ? enemyId : [enemyId];
  const deckMode = setup.members.some((m) => !!m.deck);
  let uid = 1;
  const rs = { rngState: (setup.seed ?? 12345) >>> 0 };
  const enemies = ids.map((id, i) => makeEnemy(id, Array.isArray(scale) ? scale[i] ?? scale[0] : scale));
  return {
    party: setup.members.map((m) => {
      const d = MEMBERS[m.role];
      return {
        def: d, hp: m.hp, maxHp: m.maxHp, guard: 0, taunt: false, acted: false, used: [],
        cooldowns: Object.fromEntries((m.deck ? [...new Set(m.deck)] : m.skills).map((s) => [s, 0])),
        skills: m.deck ? [...new Set(m.deck)] : [...m.skills], power: m.power, guardBonus: m.guardBonus, breakBonus: m.breakBonus, openingGuard: m.openingGuard,
        levels: { ...(m.levels ?? {}) }, branches: { ...(m.branches ?? {}) }, effects: [...(m.effects ?? [])], focus: false, charged: false,
        deck: ((): DeckState => {
          const dk = emptyDeck();
          const card = (defId: string): CardInst => ({ uid: uid++, defId, sealed: 0 });
          if (m.deck) dk.draw = shuffleInPlace(rs, m.deck.map(card));
          else dk.hand = m.skills.map(card); // 旧方式: 全スキルが常に手札
          return dk;
        })(),
      };
    }),
    enemies,
    enemy: enemies[0],
    turn: 0,
    ap: AP_MAX,
    apMax: AP_MAX,
    deckMode,
    link: ((): DeckState => {
      const dk = emptyDeck();
      if (setup.link?.length) dk.draw = shuffleInPlace(rs, setup.link.map((defId) => ({ uid: uid++, defId, sealed: 0 })));
      return dk;
    })(),
    lastHit: null, lastMagic: null, enchant: null, counterOn: false,
    rngState: rs.rngState,
    nextUid: uid,
    phase: 'player',
    chainMult: setup.chainMult,
    mods: setup.mods ?? null,
  };
}

export const alive = (m: { hp: number }): boolean => m.hp > 0;

export const livingEnemies = (s: BattleState): number[] => s.enemies.map((e, i) => (e.hp > 0 ? i : -1)).filter((i) => i >= 0);
/** 狙う敵の既定(先頭の生存者) */
export const defaultTarget = (s: BattleState): number => Math.max(0, s.enemies.findIndex((e) => e.hp > 0));

/** 現在の形態(第1形態なら null) */
export const currentPhase = (e: EnemyState): EnemyPhase | null => (e.phase > 0 ? e.def.phases?.[e.phase - 1] ?? null : null);
export const enemyPattern = (e: EnemyState): EnemyIntent[] => currentPhase(e)?.pattern ?? e.def.pattern;
/** 形態変化を含めた現在の弱点/耐性属性 */
export const enemyWeak = (e: EnemyState): Element => currentPhase(e)?.weak ?? e.def.weak;
export const enemyResist = (e: EnemyState): Element => currentPhase(e)?.resist ?? e.def.resist;

export function currentIntent(s: BattleState, ei = 0): EnemyIntent {
  const e = s.enemies[ei];
  const p = enemyPattern(e);
  return p[e.patternIndex % p.length];
}

/** HPが形態変化の閾値を下回ったら移行する: シールド全回復(ブレイク解除)・パターンの置換・弱点/耐性の変更・攻撃力上昇 */
function checkPhase(s: BattleState, ei: number, ev: BattleEvent[]): void {
  const e = s.enemies[ei];
  const phases = e.def.phases;
  if (!phases || e.hp <= 0) return;
  while (e.phase < phases.length && e.hp <= e.maxHp * phases[e.phase].below) {
    const ph = phases[e.phase];
    e.phase += 1;
    e.patternIndex = 0;
    e.shield = e.maxShield;
    e.broken = false;
    e.frozen = false;
    e.weakened = false;
    e.guard = 0;
    e.lastElement = null;
    if (ph.atkMult) e.atkMult *= ph.atkMult;
    ev.push({ type: 'phase', enemy: ei, index: e.phase, name: ph.name, text: ph.text });
  }
}

/** 階層補正込みの実際の攻撃値（UI表示・ダメージ計算で共通） */
export function intentValue(s: BattleState, intent: EnemyIntent = currentIntent(s), ei = 0): number {
  const e = s.enemies[ei];
  const tr = e.def.traits?.enrage;
  let mult = e.atkMult;
  if (tr && e.hp <= e.maxHp * tr.below) mult *= tr.mult;
  if (e.weakened) mult *= 0.75;
  return Math.round(intent.value * mult);
}

/** 次の次の行動（UIの「次→」表示用） */
export function nextIntent(s: BattleState, ei = 0): EnemyIntent {
  const e = s.enemies[ei];
  const p = enemyPattern(e);
  return p[(e.patternIndex + 1) % p.length];
}

/** 「守護」持ちの味方が健在な間、他の敵が受けるダメージ倍率(守護役自身は対象外)。無ければ1 */
export function protectionMult(s: BattleState, ei: number): number {
  let m = 1;
  s.enemies.forEach((o, i) => {
    const pr = o.def.traits?.protects;
    if (i !== ei && o.hp > 0 && !o.broken && pr) m = Math.min(m, pr);
  });
  return m;
}

/** 激昂している(従来の激昂、またはボスが最終形態) */
export const isEnraged = (e: EnemyState): boolean =>
  (!!e.def.traits?.enrage && e.hp <= e.maxHp * e.def.traits.enrage.below) || (!!e.def.phases && e.phase >= e.def.phases.length);

/** インテントの実際の標的（後衛狙いも前衛のヘイトで逸れる。倒れていれば生存者へ）。全体攻撃は -1 */
export function resolveTarget(s: BattleState, intent: EnemyIntent): number {
  if (intent.target === 'all') return -1;
  const [front, back] = s.party;
  let idx = intent.target === 'front' ? 0 : 1;
  if (idx === 1 && front.taunt && alive(front)) idx = 0;
  if (!alive(s.party[idx])) idx = alive(front) ? 0 : alive(back) ? 1 : idx;
  return idx;
}

/** プレイヤーターン開始: CDを1減らし、ガード/ヘイト/行動済みをリセット */
export function startPlayerTurn(s: BattleState): void {
  s.turn += 1;
  s.phase = 'player';
  s.ap = s.apMax;
  for (const m of s.party) {
    const lowHp = s.turn > 1 && alive(m) && m.effects.includes('low_hp_cd') && m.hp <= m.maxHp * 0.5;
    if (s.deckMode) {
      if (s.turn > 1) {
        tickFatigue(m, lowHp ? 2 : 1);
        for (const c of m.deck.hand) if (c.sealed > 0) c.sealed -= 1;
      }
    } else {
      for (const id of Object.keys(m.cooldowns)) if (s.turn > 1) m.cooldowns[id] = Math.max(0, m.cooldowns[id] - 1);
      if (lowHp) for (const id of Object.keys(m.cooldowns)) m.cooldowns[id] = Math.max(0, m.cooldowns[id] - 1);
    }
    m.guard = s.turn === 1 && alive(m) ? m.openingGuard : 0;
    m.taunt = false;
    m.acted = false;
    m.used = [];
  }
  s.lastHit = null;
  s.lastMagic = null;
  s.enchant = null;
  s.counterOn = false;
  if (s.deckMode) {
    s.party.forEach((m, i) => { if (alive(m)) drawUp(s, i); });
    if (s.turn === 1) ensureOpeningHand(s);
    // 連携デッキ: 毎ターン1枚引く(1ターン目は2枚)。手札は最大2枚
    if (s.turn > 1) { tickFatigue({ deck: s.link }, 1); for (const c of s.link.hand) if (c.sealed > 0) c.sealed -= 1; }
    drawLink(s, s.turn === 1 ? LINK_HAND : 1);
  }
}

function drawLink(s: BattleState, n: number): void {
  const d = s.link;
  for (let k = 0; k < n && d.hand.length < LINK_HAND; k++) {
    if (!d.draw.length) {
      if (!d.discard.length) break;
      d.draw = shuffleInPlace(s, d.discard);
      d.discard = [];
    }
    d.hand.push(d.draw.pop()!);
  }
}

/** 疲労ゾーンの残りターンを減らし、0になったカードを山札のランダムな位置へ戻す */
function tickFatigue(m: { deck: DeckState }, n: number): void {
  const d = m.deck;
  const stay: DeckState['fatigued'] = [];
  for (const f of d.fatigued) {
    f.turns -= n;
    if (f.turns > 0) stay.push(f);
    else d.draw.push(f.card); // 山札の一番上へ(次に引く)
  }
  d.fatigued = stay;
}

/** 手札上限まで引く。山札が尽きたら捨て札をシャッフルして山札にする。引いた枚数を返す */
export function drawUp(s: BattleState, member: number): number {
  const d = s.party[member].deck;
  let n = 0;
  while (d.hand.length < HAND_SIZE) {
    if (!d.draw.length) {
      if (!d.discard.length) break;
      d.draw = shuffleInPlace(s, d.discard);
      d.discard = [];
    }
    d.hand.push(d.draw.pop()!);
    n += 1;
  }
  return n;
}

const isAttackCard = (id: string): boolean => !!SKILLS[id]?.damage;
const isBreakCard = (id: string): boolean => (SKILLS[id]?.breakPower ?? 0) >= 10;

/** 1ターン目の手札の保証: 各キャラに攻撃カード1枚以上、2人合計でブレイク源1枚以上 */
function ensureOpeningHand(s: BattleState): void {
  const swapIn = (m: MemberState, pred: (id: string) => boolean, keep: (id: string) => boolean): boolean => {
    const d = m.deck;
    const di = d.draw.findIndex((c) => pred(c.defId));
    if (di < 0) return false;
    // 手札から「保証対象でない」カードを1枚外して山札へ戻す
    const hi = d.hand.findIndex((c) => !keep(c.defId));
    if (hi < 0) return false;
    const [out] = d.hand.splice(hi, 1);
    const [inn] = d.draw.splice(di, 1);
    d.hand.push(inn);
    d.draw.splice(Math.floor(nextRand(s) * (d.draw.length + 1)), 0, out);
    return true;
  };
  for (const m of s.party) {
    if (m.skills.some(isAttackCard) && !m.deck.hand.some((c) => isAttackCard(c.defId))) swapIn(m, isAttackCard, isAttackCard);
  }
  const hasBreak = s.party.some((m) => m.deck.hand.some((c) => isBreakCard(c.defId)));
  if (!hasBreak) {
    for (const m of s.party) {
      if (swapIn(m, isBreakCard, (id) => isAttackCard(id) && !isBreakCard(id) ? false : isBreakCard(id) || isAttackCard(id))) break;
    }
  }
}

/** 次に引くカード(山札の一番上)。無ければ null */
export function nextDraw(s: BattleState, member: number): string | null {
  const d = s.party[member].deck;
  return d.draw.length ? d.draw[d.draw.length - 1].defId : null;
}

/** 連携カードを今使えるか(カードの前提条件。作戦の前の手を参照する) */
function linkReady(s: BattleState, effect: string): boolean {
  switch (effect) {
    case 'chase': return !!s.lastHit && s.enemies[s.lastHit.enemy]?.hp > 0;
    case 'enchant': return !!s.lastMagic && !s.enchant;
    case 'convert': return s.enemies.some((e) => e.hp > 0);
    case 'counter': return !s.counterOn;
    default: return true;
  }
}

export function canUse(s: BattleState, member: number, skillId: string): boolean {
  if (member === LINK) {
    const lk = SKILLS[skillId];
    return s.phase === 'player' && s.deckMode && !!lk?.link && s.party.some(alive) && s.ap >= skillCost(lk)
      && s.link.hand.some((c) => c.defId === skillId && c.sealed <= 0) && linkReady(s, lk.link!);
  }
  const m = s.party[member];
  const sk = SKILLS[skillId];
  if (!(s.phase === 'player' && !!m && !!sk && alive(m) && s.ap >= skillCost(sk))) return false;
  if (s.deckMode) return m.deck.hand.some((c) => c.defId === skillId && c.sealed <= 0);
  return !m.used.includes(skillId) && m.cooldowns[skillId] === 0;
}

export interface DamagePreview {
  /** 与えるダメージの合計（ガード吸収前・反応ダメージ込み） */
  hp: number;
  /** 敵のガードに吸収される量 */
  absorbed: number;
  shield: number;
  weak: boolean;
  resist: boolean;
  chain: boolean;
  /** このヒットでシールドが尽きてブレイクするか */
  breaks: boolean;
  reaction: ReactionDef | null;
  /** 発動する条件付き効果のラベル */
  conds: string[];
  freeze: boolean;
  burn: boolean;
  bleed: boolean;
  focus: boolean;
  charged: boolean;
  /** 守護役に守られていて、ダメージが減っているか */
  protectedBy: boolean;
}

function condMet(e: EnemyState, c: SkillCond): boolean {
  const w = c.when;
  switch (w.kind) {
    case 'shieldAtLeast': return !e.broken && e.shield >= w.n;
    case 'shieldAtMost': return !e.broken && e.shield <= w.n;
    case 'broken': return e.broken;
    case 'burning': return !!e.burn;
    case 'bleeding': return !!e.bleed;
  }
}

/** 魔力付与中の物理攻撃は、付与された属性を持つ */
function withEnchant(s: BattleState, sk: SkillDef): SkillDef {
  return s.enchant && sk.kind === 'physical' && sk.element === 'none' && sk.damage ? { ...sk, element: s.enchant } : sk;
}

/** スキル(レベル反映前の基本定義)の実効定義: メンバーのスキルLvを反映 */
/** 分岐の候補(書き換えカードは元のカードの分岐を引き継ぐ) */
const branchesOf = (skill: SkillDef): SkillBranch[] | undefined => skill.branches ?? (skill.base ? SKILLS[skill.base]?.branches : undefined);

function skillFor(m: MemberState, skill: SkillDef): SkillDef {
  const key = skill.base ?? skill.id;
  const brs = branchesOf(skill);
  return effectiveSkill(brs && !skill.branches ? { ...skill, branches: brs } : skill, m.levels[key] ?? 1, m.branches[key]);
}

/** UI用: そのキャラが使うときの実効スキル / レベル / 分岐 */
export const effectiveFor = (m: MemberState, skill: SkillDef): SkillDef => skillFor(m, skill);
export const levelOf = (m: MemberState, skill: SkillDef): number => m.levels[skill.base ?? skill.id] ?? 1;
export const branchOf = (m: MemberState, skill: SkillDef): SkillBranch | undefined =>
  levelOf(m, skill) >= 3 ? branchesOf(skill)?.find((b) => b.id === m.branches[skill.base ?? skill.id]) : undefined;

/** スキルが現在の敵に与える影響（実行時と同一ロジック。UIのプレビューにも使う）。装備・Lv・条件・反応を含む。 */
export function previewSkill(s: BattleState, baseSkill: SkillDef, member = 0, ti = defaultTarget(s)): DamagePreview {
  const e = s.enemies[ti];
  const m = s.party[member];
  const skill = withEnchant(s, skillFor(m, baseSkill));
  const weak = skill.element !== 'none' && enemyWeak(e) === skill.element;
  const resist = skill.element !== 'none' && enemyResist(e) === skill.element;
  const chain = skill.kind === 'magic' && e.broken && !!skill.damage;
  const tr = e.def.traits;

  const bonus: Required<Pick<SkillBonus, 'breakBonus' | 'damageBonus' | 'damageMult'>> & { freeze: boolean } =
    { breakBonus: 0, damageBonus: 0, damageMult: 1, freeze: false };
  const conds: string[] = [];
  for (const c of skill.conds ?? []) {
    if (!condMet(e, c)) continue;
    conds.push(c.label);
    bonus.breakBonus += c.then.breakBonus ?? 0;
    bonus.damageBonus += c.then.damageBonus ?? 0;
    bonus.damageMult *= c.then.damageMult ?? 1;
    if (c.then.freeze) bonus.freeze = true;
  }

  const focus = m.focus && !!(skill.damage || skill.breakPower);
  const charged = m.charged && !!skill.damage;
  const powered = !!skill.damage && m.guard > 0 && m.effects.includes('guard_power');

  let total = 0;
  let reaction: ReactionDef | null = null;
  if (skill.damage) {
    let mult = bonus.damageMult;
    if (weak) mult *= WEAK_MULT;
    if (resist) mult *= RESIST_MULT;
    if (chain) mult *= s.chainMult;
    else if (e.shield > 0 && !e.broken) mult *= tr?.shieldedMult ?? SHIELDED_MULT;
    if (skill.kind === 'physical' && tr?.physMult) mult *= tr.physMult;
    if (focus) mult *= FOCUS_MULT;
    if (charged) mult *= CHARGED_MULT;
    if (powered) mult *= GUARD_POWER_MULT;
    mult *= s.mods?.elementMult?.[skill.element] ?? 1;
    mult *= protectionMult(s, ti);
    mult *= skill.aoe ?? 1;
    total = Math.max(1, Math.floor((skill.damage + m.power + bonus.damageBonus) * mult));
    if (chain) {
      reaction = reactionFor(e.lastElement, skill.element);
      if (reaction) {
        const k = m.effects.includes('storm_chain') ? 1.5 : 1;
        total += Math.round(reaction.dmg * k);
      }
    }
  }
  const absorbed = Math.min(e.guard, total);

  const bp0 = skill.breakPower ?? 0;
  let bp = (bp0 > 0 ? bp0 + m.breakBonus : 0) + bonus.breakBonus + (focus ? FOCUS_BREAK : 0);
  if (bp > 0) bp = Math.floor(bp * (s.mods?.breakMult ?? 1) * (skill.aoe ?? 1));
  const shield = e.broken ? 0 : Math.min(e.shield, Math.max(0, bp));
  const freeze = (bonus.freeze || !!skill.freezeAlways || (m.effects.includes('freeze_ice') && skill.element === 'ice')) && !!skill.damage;
  const bleed = skill.inflict === 'bleed' && !!skill.damage;
  const burn = (skill.inflict === 'burn' || (m.effects.includes('ignite') && skill.element === 'fire')) && !!skill.damage;
  return {
    hp: total, absorbed, shield, weak, resist, chain,
    breaks: !e.broken && e.shield > 0 && shield >= e.shield && shield > 0,
    reaction, conds, freeze, burn, bleed, focus, charged, protectedBy: protectionMult(s, ti) < 1,
  };
}

function checkEnd(s: BattleState): void {
  if (s.enemies.every((e) => e.hp <= 0)) s.phase = 'won';
  else if (s.party.every((m) => !alive(m))) s.phase = 'lost';
}

/** ガード吸収後に実際にHPが減る量 */
export const hpLoss = (p: DamagePreview): number => p.hp - p.absorbed;

function skillCooldown(s: BattleState, m: MemberState, skill: SkillDef): number {
  const eff = skillFor(m, skill);
  let cd = eff.cooldown;
  cd += s.mods?.elementCdPlus?.[eff.element] ?? 0;
  if (eff.healAll) cd += s.mods?.healCdPlus ?? 0;
  return cd;
}

export function useSkill(s: BattleState, member: number, skillId: string, target?: number): BattleEvent[] | null {
  if (!canUse(s, member, skillId)) return null;
  if (member === LINK) return useLink(s, skillId, target);
  const ti = target !== undefined && s.enemies[target]?.hp > 0 ? target : defaultTarget(s);
  const base = SKILLS[skillId];
  const m = s.party[member];
  const skill = withEnchant(s, skillFor(m, base));
  m.acted = true;
  m.used.push(skillId);
  s.ap -= skillCost(base);
  if (s.deckMode) {
    // 使ったカードは手札から離れる。疲労(旧CD)があれば疲労ゾーンへ、無ければ捨て札へ
    const d = m.deck;
    const hi = d.hand.findIndex((c) => c.defId === skillId && c.sealed <= 0);
    const [card] = d.hand.splice(hi, 1);
    const fat = skillCooldown(s, m, base);
    if (fat > 0) d.fatigued.push({ card, turns: fat });
    else d.discard.push(card);
  } else {
    m.cooldowns[skillId] = skillCooldown(s, m, base);
  }
  const ev: BattleEvent[] = [{ type: 'skill', member, skillId }];
  if (skill.waitEffect) {
    waitEffects(s, m, member, ev);
    return ev;
  }
  if (skill.chargeSelf) {
    m.charged = true;
    ev.push({ type: 'status', kind: 'charge' });
  }

  if (skill.damage || skill.breakPower) {
    // 全体攻撃は生存している敵全員(編成順)。単体は指定した敵だけ
    const targets = skill.aoe ? livingEnemies(s) : [ti];
    let focusUsed = false;
    let chargedUsed = false;
    for (const t of targets) {
      const p = previewSkill(s, base, member, t);
      focusUsed = focusUsed || p.focus;
      chargedUsed = chargedUsed || p.charged;
      strike(s, member, skill, p, t, ev);
    }
    if (focusUsed) m.focus = false;
    if (chargedUsed) m.charged = false;
    if (skill.damage && skill.chargeAfter) {
      m.charged = true;
      ev.push({ type: 'status', kind: 'charge' });
    }
    if (skill.damage) {
      s.lastHit = { member, skillId, enemy: targets[0] };
      if (skill.kind === 'magic' && skill.element !== 'none') s.lastMagic = skill.element;
      if (s.enchant && skill.kind === 'physical') s.enchant = null; // 魔力付与は1回の物理攻撃で消える
    }
  }
  const gm = s.mods?.guardMult ?? 1;
  if (skill.guardSelf) {
    const v = Math.round((skill.guardSelf + m.guardBonus) * gm);
    m.guard += v;
    ev.push({ type: 'guard', member, amount: v });
  }
  if (skill.guardAlly) {
    const v = Math.round((skill.guardAlly + m.guardBonus) * gm);
    s.party.forEach((o, i) => {
      if (i !== member && alive(o)) {
        o.guard += v;
        ev.push({ type: 'guard', member: i, amount: v });
      }
    });
  }
  if (skill.healAll) healAll(s, skill.healAll, ev);
  if (skill.taunt) {
    m.taunt = true;
    ev.push({ type: 'taunt', member });
  }
  checkEnd(s);
  return ev;
}

const CONVERT_NEXT: Record<string, Element> = { fire: 'thunder', thunder: 'ice', ice: 'fire' };
export const nextConvert = (e: Element | null): Element => (e && CONVERT_NEXT[e]) || 'fire';

/** 連携カードを使う(2人共通。直前の手を参照する) */
function useLink(s: BattleState, skillId: string, target?: number): BattleEvent[] | null {
  const card = SKILLS[skillId];
  const d = s.link;
  const hi = d.hand.findIndex((c) => c.defId === skillId && c.sealed <= 0);
  if (hi < 0) return null;
  s.ap -= skillCost(card);
  const [inst] = d.hand.splice(hi, 1);
  if (card.cooldown > 0) d.fatigued.push({ card: inst, turns: card.cooldown });
  else d.discard.push(inst);
  const ev: BattleEvent[] = [{ type: 'skill', member: LINK, skillId }];
  switch (card.link) {
    case 'chase': {
      const h = s.lastHit!;
      const e = s.enemies[h.enemy];
      const p = previewSkill(s, SKILLS[h.skillId], h.member, h.enemy);
      const total = Math.max(1, Math.floor(p.hp * 0.5));
      const absorbed = Math.min(e.guard, total);
      e.guard -= absorbed;
      e.hp = Math.max(0, e.hp - (total - absorbed));
      ev.push({ type: 'damage', enemy: h.enemy, amount: total - absorbed, absorbed, element: 'none', weak: false, resist: false, chain: false });
      if (e.hp <= 0) onEnemyDown(s, h.enemy, ev);
      else checkPhase(s, h.enemy, ev);
      break;
    }
    case 'enchant':
      s.enchant = s.lastMagic;
      ev.push({ type: 'status', kind: 'enchant' });
      break;
    case 'convert': {
      const ti = target !== undefined && s.enemies[target]?.hp > 0 ? target : defaultTarget(s);
      const e = s.enemies[ti];
      e.lastElement = nextConvert(e.lastElement);
      ev.push({ type: 'status', enemy: ti, kind: 'convert' });
      break;
    }
    case 'counter':
      s.counterOn = true;
      ev.push({ type: 'status', kind: 'counter' });
      break;
    case 'barrier': {
      const v = Math.round(10 * (s.mods?.guardMult ?? 1));
      s.party.forEach((m, i) => { if (alive(m)) { m.guard += v; ev.push({ type: 'guard', member: i, amount: v }); } });
      break;
    }
    case 'unison':
      for (const m of s.party) if (alive(m)) m.focus = true;
      ev.push({ type: 'status', kind: 'focus' });
      break;
    default: break;
  }
  checkEnd(s);
  return ev;
}

/** 1体の敵への命中処理(ダメージ・ガード吸収・ブレイク・状態付与・反応) */
function strike(s: BattleState, member: number, skill: SkillDef, p: DamagePreview, ti: number, ev: BattleEvent[]): void {
  const m = s.party[member];
  const e = s.enemies[ti];
  if (skill.damage) {
    e.guard -= p.absorbed;
    const dealt = hpLoss(p);
    e.hp = Math.max(0, e.hp - dealt);
    ev.push({ type: 'damage', enemy: ti, amount: dealt, absorbed: p.absorbed, element: skill.element, weak: p.weak, resist: p.resist, chain: p.chain });
    if (p.chain) ev.push({ type: 'chain', enemy: ti, element: skill.element, amount: p.hp });
    if (p.reaction) applyReaction(s, e, ti, p.reaction, member, ev);
  }
  if (p.shield > 0) {
    e.shield -= p.shield;
    ev.push({ type: 'shield', enemy: ti, amount: p.shield });
    if (e.shield <= 0) {
      e.broken = true;
      ev.push({ type: 'break', enemy: ti });
      onBreak(s, e, ti, m, ev);
    }
  }
  if (skill.damage && e.hp > 0) {
    if (p.burn) { e.burn = { ...ENEMY_BURN }; ev.push({ type: 'status', enemy: ti, kind: 'burn' }); }
    if (p.bleed) { e.bleed = { ...ENEMY_BLEED }; ev.push({ type: 'status', enemy: ti, kind: 'bleed' }); }
    if (p.freeze && !e.frozen) { e.frozen = true; ev.push({ type: 'status', enemy: ti, kind: 'freeze' }); }
    if (skill.element !== 'none') e.lastElement = skill.element;
  }
  if (e.hp <= 0) onEnemyDown(s, ti, ev);
  else checkPhase(s, ti, ev);
}

/** 敵が倒れた: 通知し、仲間が「奮起」持ちなら攻撃力が上がる */
function onEnemyDown(s: BattleState, ei: number, ev: BattleEvent[]): void {
  if (ev.some((x) => x.type === 'enemyDown' && x.enemy === ei)) return;
  ev.push({ type: 'enemyDown', enemy: ei });
  s.enemies.forEach((o, i) => {
    const r = o.def.traits?.rally;
    if (i !== ei && o.hp > 0 && r) o.atkMult *= 1 + r;
  });
}

function applyReaction(s: BattleState, e: EnemyState, ei: number, r: ReactionDef, member: number, ev: BattleEvent[]): void {
  const k = s.party[member].effects.includes('storm_chain') ? 1.5 : 1;
  ev.push({ type: 'reaction', enemy: ei, id: r.id, name: r.name, amount: Math.round(r.dmg * k) });
  switch (r.id) {
    case 'steam': e.weakened = true; ev.push({ type: 'status', enemy: ei, kind: 'weaken' }); break;
    case 'shock':
      for (const o of s.party) if (alive(o)) o.charged = true;
      ev.push({ type: 'status', kind: 'charge' });
      break;
    case 'overload': e.burn = { turns: 3, dmg: Math.round(5 * k) }; ev.push({ type: 'status', enemy: ei, kind: 'burn' }); break;
    case 'shatter': e.frozen = true; ev.push({ type: 'status', enemy: ei, kind: 'freeze' }); break;
    case 'superconduct':
      for (const o of s.party) for (const id of Object.keys(o.cooldowns)) o.cooldowns[id] = Math.max(0, o.cooldowns[id] - 1);
      break;
    default: break;
  }
}

function onBreak(s: BattleState, e: EnemyState, ei: number, m: MemberState, ev: BattleEvent[]): void {
  if (m.effects.includes('bleed_on_break')) {
    e.bleed = { ...ENEMY_BLEED };
    ev.push({ type: 'status', enemy: ei, kind: 'bleed' });
  }
  if (m.effects.includes('break_guard')) {
    s.party.forEach((o, i) => { if (alive(o)) { o.guard += 8; ev.push({ type: 'guard', member: i, amount: 8 }); } });
  }
  if (m.effects.includes('holy_break')) healAll(s, 6, ev);
}

export const canWait = (s: BattleState, member: number): boolean => {
  const m = s.party[member];
  if (s.deckMode) return canUse(s, member, 'wait');
  return s.phase === 'player' && !!m && alive(m) && !m.used.includes('wait') && s.ap >= WAIT_COST;
};

/** 待機の効果: 疲労/CD-1・ガード+5・次のダメージスキルが強化(×1.2・ブレイク+5) */
function waitEffects(s: BattleState, m: MemberState, member: number, ev: BattleEvent[]): void {
  if (s.deckMode) tickFatigue(m, 1);
  else for (const id of Object.keys(m.cooldowns)) m.cooldowns[id] = Math.max(0, m.cooldowns[id] - 1);
  m.guard += WAIT_GUARD;
  m.focus = true;
  ev.push({ type: 'wait', member }, { type: 'guard', member, amount: WAIT_GUARD }, { type: 'status', kind: 'focus' });
}

/** 待機: 旧方式は常に使える行動、デッキ戦闘では「待機」カードを使う */
export function wait(s: BattleState, member: number): BattleEvent[] | null {
  if (!canWait(s, member)) return null;
  if (s.deckMode) return useSkill(s, member, 'wait');
  const m = s.party[member];
  m.acted = true;
  m.used.push('wait');
  s.ap -= WAIT_COST;
  const ev: BattleEvent[] = [];
  waitEffects(s, m, member, ev);
  return ev;
}

function healAll(s: BattleState, amountEach: number, ev: BattleEvent[]): void {
  s.party.forEach((o, i) => {
    if (!alive(o)) return;
    const amount = Math.min(amountEach, o.maxHp - o.hp);
    o.hp += amount;
    ev.push({ type: 'heal', member: i, amount });
  });
}

/** ポーション: 行動を消費せず、生存者の最大HPの割合を回復（所持数の管理は呼び出し側） */
export function usePotion(s: BattleState, ratio = 0.35): BattleEvent[] | null {
  if (s.phase !== 'player') return null;
  const ev: BattleEvent[] = [];
  s.party.forEach((o, i) => {
    if (!alive(o)) return;
    const amount = Math.min(Math.ceil(o.maxHp * ratio), o.maxHp - o.hp);
    o.hp += amount;
    ev.push({ type: 'heal', member: i, amount });
  });
  return ev;
}

/** これ以上できる行動が無いか（行動ポイント切れ、または使える行動が残っていない） */
export const allActed = (s: BattleState): boolean =>
  s.ap <= 0 || !(s.party.some((m, i) => m.skills.some((id) => canUse(s, i, id)) || canWait(s, i)) || s.link.hand.some((c) => canUse(s, LINK, c.defId)));

/** 手札(カード実体)を使えるスキルIDごとに数える */
export const handIds = (s: BattleState, member: number): string[] => s.party[member].deck.hand.map((c) => c.defId);

function hit(s: BattleState, idx: number, value: number, ev: BattleEvent[]): number {
  const t = s.party[idx];
  const blocked = Math.min(t.guard, value);
  t.guard -= blocked;
  const amount = value - blocked;
  t.hp = Math.max(0, t.hp - amount);
  ev.push({ type: 'hurt', member: idx, amount, blocked });
  if (t.hp === 0) ev.push({ type: 'down', member: idx });
  return amount;
}

/**
 * ターン終了 → 敵のターン → 次のプレイヤーターン開始。
 * ブレイク中の敵は行動不能になり、そのターン終了時にシールドが全回復する。
 */
export function endPlayerTurn(s: BattleState): BattleEvent[] {
  if (s.phase !== 'player') return [];
  s.phase = 'enemy';
  const ev: BattleEvent[] = [];
  // 継続ダメージ(ガード無視)
  s.enemies.forEach((e, ei) => {
    if (e.hp <= 0) return;
    for (const kind of ['burn', 'bleed'] as const) {
      const d = e[kind];
      if (!d) continue;
      e.hp = Math.max(0, e.hp - d.dmg);
      ev.push({ type: 'dot', enemy: ei, kind, amount: d.dmg });
      d.turns -= 1;
      if (d.turns <= 0) e[kind] = null;
    }
    if (e.hp <= 0) onEnemyDown(s, ei, ev);
    else checkPhase(s, ei, ev);
  });
  if (s.enemies.every((e) => e.hp <= 0)) {
    s.phase = 'won';
    return ev;
  }
  // 各敵が順に行動
  s.enemies.forEach((e, ei) => {
    if (e.hp <= 0 || s.party.every((m) => !alive(m))) return;
    enemyAct(s, e, ei, ev);
  });
  checkEnd(s);
  if (s.phase === 'enemy') startPlayerTurn(s);
  return ev;
}

function enemyAct(s: BattleState, e: EnemyState, ei: number, ev: BattleEvent[]): void {
  const intent = currentIntent(s, ei);
  if (e.broken) {
    ev.push({ type: 'stunned', enemy: ei });
    // 強攻撃は阻止、溜めを止めれば続く強攻撃も消える。それ以外は先送り
    if (intent.kind === 'heavy') {
      ev.push({ type: 'canceled', enemy: ei, intent });
      e.patternIndex += 1;
    } else if (intent.kind === 'charge') {
      ev.push({ type: 'canceled', enemy: ei, intent });
      e.patternIndex += 2;
    }
    e.broken = false;
    e.shield = e.frozen ? Math.floor(e.maxShield * 0.5) : e.maxShield;
    e.frozen = false;
    e.lastElement = null;
    ev.push({ type: 'recover', enemy: ei });
  } else if (intent.kind === 'charge') {
    ev.push({ type: 'enemyCharge', enemy: ei, intent });
    e.patternIndex += 1;
  } else if (intent.kind === 'disrupt') {
    const idx = Math.max(0, resolveTarget(s, intent));
    const t = s.party[idx];
    // 使える(CD0)スキルのうち、最も強力(CDが長い)ものを2ターン封印する。使えるものが無ければ何もしない
    ev.push({ type: 'enemyAttack', enemy: ei, intent, target: idx });
    if (s.deckMode) {
      const cards = t.deck.hand.filter((c) => c.sealed <= 0 && c.defId !== 'wait').sort((a, b) => SKILLS[b.defId].cooldown - SKILLS[a.defId].cooldown);
      if (cards.length && alive(t)) {
        cards[0].sealed = 2;
        ev.push({ type: 'disrupt', enemy: ei, member: idx, skillId: cards[0].defId });
      }
    } else {
      const ready = t.skills.filter((id) => t.cooldowns[id] === 0).sort((a, b) => SKILLS[b].cooldown - SKILLS[a].cooldown);
      if (ready.length && alive(t)) {
        t.cooldowns[ready[0]] = Math.max(t.cooldowns[ready[0]], 2);
        ev.push({ type: 'disrupt', enemy: ei, member: idx, skillId: ready[0] });
      }
    }
    e.patternIndex += 1;
  } else if (intent.kind === 'guard') {
    const g = intent.guard ?? 0;
    e.guard += g;
    ev.push({ type: 'enemyGuard', enemy: ei, amount: g });
    // 守護役の構えは、健在な仲間にも防御を分ける
    if (e.def.traits?.protects) {
      s.enemies.forEach((o, oi) => {
        if (oi === ei || o.hp <= 0) return;
        const share = Math.round(g * 0.5);
        o.guard += share;
        ev.push({ type: 'enemyGuard', enemy: oi, amount: share });
      });
    }
    e.patternIndex += 1;
  } else {
    const idx = resolveTarget(s, intent);
    ev.push({ type: 'enemyAttack', enemy: ei, intent, target: idx });
    const value = intentValue(s, intent, ei);
    e.weakened = false;
    let dealt = 0;
    const guard0 = s.party[0].guard;
    if (idx === -1) s.party.forEach((m, i) => { if (alive(m)) dealt += hit(s, i, value, ev); });
    else dealt = hit(s, idx, value, ev);
    // 反撃指令: ナイトが攻撃を受けたら、受ける前のガードに応じて反撃
    if (s.counterOn && alive(s.party[0]) && (idx === 0 || idx === -1)) {
      const amount = Math.min(20, 4 + Math.floor(guard0 * 0.5));
      e.hp = Math.max(0, e.hp - amount);
      ev.push({ type: 'counter', enemy: ei, amount });
      if (e.hp <= 0) onEnemyDown(s, ei, ev);
      else checkPhase(s, ei, ev);
    }
    const ls = e.def.traits?.lifesteal;
    if (ls && dealt > 0 && e.hp > 0) {
      const amount = Math.min(Math.round(dealt * ls), e.maxHp - e.hp);
      if (amount > 0) {
        e.hp += amount;
        ev.push({ type: 'enemyHeal', enemy: ei, amount });
      }
    }
    e.patternIndex += 1;
  }
}
