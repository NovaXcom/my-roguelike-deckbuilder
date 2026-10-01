import { ENEMIES, MEMBERS, PARTY_ORDER, SKILLS } from './data';
import type {
  Element, EnemyIntent, EnemyState, EquipEffectId, MemberState, Role, RunMods, SkillBonus, SkillCond, SkillDef,
} from './types';

export const CHAIN_MULT = 2;
export const SHIELDED_MULT = 0.75;
export const WEAK_MULT = 1.5;
export const RESIST_MULT = 0.5;

export const MAX_SKILL_LEVEL = 3;
const LEVEL_MULT = [1, 1, 1.2, 1.45];
export const AP_MAX = 3;
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
export function effectiveSkill(skill: SkillDef, level = 1): SkillDef {
  const lv = Math.max(1, Math.min(MAX_SKILL_LEVEL, level));
  if (lv === 1) return skill;
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
  enemy: EnemyState;
  turn: number;
  /** 残り行動ポイント(1ターンに2人で使える行動の総数) */
  ap: number;
  apMax: number;
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
  levels?: Record<string, number>;
  effects?: EquipEffectId[];
}
export interface BattleSetup {
  members: MemberSetup[];
  chainMult: number;
  mods?: RunMods | null;
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
  | { type: 'damage'; target: 'enemy'; amount: number; absorbed: number; element: SkillDef['element']; weak: boolean; resist: boolean; chain: boolean }
  | { type: 'reaction'; id: ReactionId; name: string; amount: number }
  | { type: 'status'; kind: 'burn' | 'bleed' | 'freeze' | 'weaken' | 'charge' | 'focus' }
  | { type: 'dot'; kind: 'burn' | 'bleed'; amount: number }
  | { type: 'wait'; member: number }
  | { type: 'enemyCharge'; intent: EnemyIntent }
  | { type: 'enemyGuard'; amount: number }
  | { type: 'canceled'; intent: EnemyIntent }
  | { type: 'enemyHeal'; amount: number }
  | { type: 'hurt'; member: number; amount: number; blocked: number }
  | { type: 'guard'; member: number; amount: number }
  | { type: 'heal'; member: number; amount: number }
  | { type: 'taunt'; member: number }
  | { type: 'shield'; amount: number }
  | { type: 'break' }
  | { type: 'chain'; element: SkillDef['element']; amount: number }
  | { type: 'stunned' }
  | { type: 'recover' }
  /** target=-1 は全体攻撃 */
  | { type: 'enemyAttack'; intent: EnemyIntent; target: number }
  | { type: 'down'; member: number };

export interface EnemyScale {
  hp: number;
  atk: number;
}

export function createBattle(
  enemyId = 'slime',
  setup: BattleSetup = defaultSetup(),
  scale: EnemyScale = { hp: 1, atk: 1 },
): BattleState {
  const def = ENEMIES[enemyId];
  const maxHp = Math.round(def.maxHp * scale.hp);
  return {
    party: setup.members.map((m) => {
      const d = MEMBERS[m.role];
      return {
        def: d, hp: m.hp, maxHp: m.maxHp, guard: 0, taunt: false, acted: false, used: [],
        cooldowns: Object.fromEntries(m.skills.map((s) => [s, 0])),
        skills: [...m.skills], power: m.power, guardBonus: m.guardBonus, breakBonus: m.breakBonus, openingGuard: m.openingGuard,
        levels: { ...(m.levels ?? {}) }, effects: [...(m.effects ?? [])], focus: false, charged: false,
      };
    }),
    enemy: {
      def, hp: maxHp, maxHp, shield: def.maxShield, maxShield: def.maxShield, broken: false, patternIndex: 0, atkMult: scale.atk,
      guard: 0, burn: null, bleed: null, frozen: false, weakened: false, lastElement: null,
    },
    turn: 0,
    ap: AP_MAX,
    apMax: AP_MAX,
    phase: 'player',
    chainMult: setup.chainMult,
    mods: setup.mods ?? null,
  };
}

export const alive = (m: { hp: number }): boolean => m.hp > 0;

export function currentIntent(s: BattleState): EnemyIntent {
  const p = s.enemy.def.pattern;
  return p[s.enemy.patternIndex % p.length];
}

/** 階層補正込みの実際の攻撃値（UI表示・ダメージ計算で共通） */
export function intentValue(s: BattleState, intent: EnemyIntent = currentIntent(s)): number {
  const e = s.enemy;
  const tr = e.def.traits?.enrage;
  let mult = e.atkMult;
  if (tr && e.hp <= e.maxHp * tr.below) mult *= tr.mult;
  if (e.weakened) mult *= 0.75;
  return Math.round(intent.value * mult);
}

/** 次の次の行動（UIの「次→」表示用） */
export function nextIntent(s: BattleState): EnemyIntent {
  const p = s.enemy.def.pattern;
  return p[(s.enemy.patternIndex + 1) % p.length];
}

export const isEnraged = (e: EnemyState): boolean => !!e.def.traits?.enrage && e.hp <= e.maxHp * e.def.traits.enrage.below;

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
    for (const id of Object.keys(m.cooldowns)) if (s.turn > 1) m.cooldowns[id] = Math.max(0, m.cooldowns[id] - 1);
    if (s.turn > 1 && alive(m) && m.effects.includes('low_hp_cd') && m.hp <= m.maxHp * 0.5) {
      for (const id of Object.keys(m.cooldowns)) m.cooldowns[id] = Math.max(0, m.cooldowns[id] - 1);
    }
    m.guard = s.turn === 1 && alive(m) ? m.openingGuard : 0;
    m.taunt = false;
    m.acted = false;
    m.used = [];
  }
}

export function canUse(s: BattleState, member: number, skillId: string): boolean {
  const m = s.party[member];
  const sk = SKILLS[skillId];
  return s.phase === 'player' && !!m && !!sk && alive(m) && !m.used.includes(skillId) && m.cooldowns[skillId] === 0 && s.ap >= skillCost(sk);
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
  focus: boolean;
  charged: boolean;
}

function condMet(s: BattleState, c: SkillCond): boolean {
  const e = s.enemy;
  const w = c.when;
  switch (w.kind) {
    case 'shieldAtLeast': return !e.broken && e.shield >= w.n;
    case 'shieldAtMost': return !e.broken && e.shield <= w.n;
    case 'broken': return e.broken;
    case 'burning': return !!e.burn;
    case 'bleeding': return !!e.bleed;
  }
}

/** スキル(レベル反映前の基本定義)の実効定義: メンバーのスキルLvを反映 */
function skillFor(m: MemberState, skill: SkillDef): SkillDef {
  return effectiveSkill(skill, m.levels[skill.id] ?? 1);
}

/** スキルが現在の敵に与える影響（実行時と同一ロジック。UIのプレビューにも使う）。装備・Lv・条件・反応を含む。 */
export function previewSkill(s: BattleState, baseSkill: SkillDef, member = 0): DamagePreview {
  const e = s.enemy;
  const m = s.party[member];
  const skill = skillFor(m, baseSkill);
  const weak = skill.element !== 'none' && e.def.weak === skill.element;
  const resist = skill.element !== 'none' && e.def.resist === skill.element;
  const chain = skill.kind === 'magic' && e.broken && !!skill.damage;
  const tr = e.def.traits;

  const bonus: Required<Pick<SkillBonus, 'breakBonus' | 'damageBonus' | 'damageMult'>> & { freeze: boolean } =
    { breakBonus: 0, damageBonus: 0, damageMult: 1, freeze: false };
  const conds: string[] = [];
  for (const c of skill.conds ?? []) {
    if (!condMet(s, c)) continue;
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
  if (bp > 0) bp = Math.floor(bp * (s.mods?.breakMult ?? 1));
  const shield = e.broken ? 0 : Math.min(e.shield, Math.max(0, bp));
  const freeze = (bonus.freeze || (m.effects.includes('freeze_ice') && skill.element === 'ice')) && !!skill.damage;
  const burn = (skill.inflict === 'burn' || (m.effects.includes('ignite') && skill.element === 'fire')) && !!skill.damage;
  return {
    hp: total, absorbed, shield, weak, resist, chain,
    breaks: !e.broken && e.shield > 0 && shield >= e.shield && shield > 0,
    reaction, conds, freeze, burn, focus, charged,
  };
}

function checkEnd(s: BattleState): void {
  if (s.enemy.hp <= 0) s.phase = 'won';
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

export function useSkill(s: BattleState, member: number, skillId: string): BattleEvent[] | null {
  if (!canUse(s, member, skillId)) return null;
  const base = SKILLS[skillId];
  const m = s.party[member];
  const skill = skillFor(m, base);
  const p = previewSkill(s, base, member);
  m.acted = true;
  m.used.push(skillId);
  s.ap -= skillCost(base);
  m.cooldowns[skillId] = skillCooldown(s, m, base);
  const ev: BattleEvent[] = [{ type: 'skill', member, skillId }];
  const e = s.enemy;

  if (skill.damage || skill.breakPower) {
    if (p.focus) m.focus = false;
    if (p.charged) m.charged = false;
    if (skill.damage) {
      e.guard -= p.absorbed;
      const dealt = hpLoss(p);
      e.hp = Math.max(0, e.hp - dealt);
      ev.push({ type: 'damage', target: 'enemy', amount: dealt, absorbed: p.absorbed, element: skill.element, weak: p.weak, resist: p.resist, chain: p.chain });
      if (p.chain) ev.push({ type: 'chain', element: skill.element, amount: p.hp });
      if (p.reaction) applyReaction(s, p.reaction, member, p.hp, ev);
    }
    if (p.shield > 0) {
      e.shield -= p.shield;
      ev.push({ type: 'shield', amount: p.shield });
      if (e.shield <= 0) {
        e.broken = true;
        ev.push({ type: 'break' });
        onBreak(s, m, ev);
      }
    }
    if (skill.damage && e.hp > 0) {
      if (p.burn) { e.burn = { ...ENEMY_BURN }; ev.push({ type: 'status', kind: 'burn' }); }
      if (p.freeze && !e.frozen) { e.frozen = true; ev.push({ type: 'status', kind: 'freeze' }); }
      if (skill.element !== 'none') e.lastElement = skill.element;
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

function applyReaction(s: BattleState, r: ReactionDef, member: number, _total: number, ev: BattleEvent[]): void {
  const e = s.enemy;
  const k = s.party[member].effects.includes('storm_chain') ? 1.5 : 1;
  ev.push({ type: 'reaction', id: r.id, name: r.name, amount: Math.round(r.dmg * k) });
  switch (r.id) {
    case 'steam': e.weakened = true; ev.push({ type: 'status', kind: 'weaken' }); break;
    case 'shock':
      for (const o of s.party) if (alive(o)) o.charged = true;
      ev.push({ type: 'status', kind: 'charge' });
      break;
    case 'overload': e.burn = { turns: 3, dmg: Math.round(5 * k) }; ev.push({ type: 'status', kind: 'burn' }); break;
    case 'shatter': e.frozen = true; ev.push({ type: 'status', kind: 'freeze' }); break;
    case 'superconduct':
      for (const o of s.party) for (const id of Object.keys(o.cooldowns)) o.cooldowns[id] = Math.max(0, o.cooldowns[id] - 1);
      break;
    default: break;
  }
}

function onBreak(s: BattleState, m: MemberState, ev: BattleEvent[]): void {
  if (m.effects.includes('bleed_on_break')) {
    s.enemy.bleed = { ...ENEMY_BLEED };
    ev.push({ type: 'status', kind: 'bleed' });
  }
  if (m.effects.includes('break_guard')) {
    s.party.forEach((o, i) => { if (alive(o)) { o.guard += 8; ev.push({ type: 'guard', member: i, amount: 8 }); } });
  }
  if (m.effects.includes('holy_break')) healAll(s, 6, ev);
}

export const canWait = (s: BattleState, member: number): boolean => {
  const m = s.party[member];
  return s.phase === 'player' && !!m && alive(m) && !m.used.includes('wait') && s.ap >= WAIT_COST;
};

/** 待機: 行動を溜める。自分の全スキルCD-1・ガード+5・次のダメージスキルが強化(×1.2・ブレイク+5) */
export function wait(s: BattleState, member: number): BattleEvent[] | null {
  if (!canWait(s, member)) return null;
  const m = s.party[member];
  m.acted = true;
  m.used.push('wait');
  s.ap -= WAIT_COST;
  for (const id of Object.keys(m.cooldowns)) m.cooldowns[id] = Math.max(0, m.cooldowns[id] - 1);
  m.guard += WAIT_GUARD;
  m.focus = true;
  return [
    { type: 'wait', member },
    { type: 'guard', member, amount: WAIT_GUARD },
    { type: 'status', kind: 'focus' },
  ];
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
  s.ap <= 0 || !s.party.some((m, i) => m.skills.some((id) => canUse(s, i, id)) || canWait(s, i));

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
  const e = s.enemy;
  // 継続ダメージ(ガード無視)
  for (const kind of ['burn', 'bleed'] as const) {
    const d = e[kind];
    if (!d) continue;
    e.hp = Math.max(0, e.hp - d.dmg);
    ev.push({ type: 'dot', kind, amount: d.dmg });
    d.turns -= 1;
    if (d.turns <= 0) e[kind] = null;
  }
  if (e.hp <= 0) {
    s.phase = 'won';
    return ev;
  }
  const intent = currentIntent(s);
  if (e.broken) {
    ev.push({ type: 'stunned' });
    // 強攻撃は阻止、溜めを止めれば続く強攻撃も消える。それ以外は先送り
    if (intent.kind === 'heavy') {
      ev.push({ type: 'canceled', intent });
      e.patternIndex += 1;
    } else if (intent.kind === 'charge') {
      ev.push({ type: 'canceled', intent });
      e.patternIndex += 2;
    }
    e.broken = false;
    e.shield = e.frozen ? Math.floor(e.maxShield * 0.5) : e.maxShield;
    e.frozen = false;
    e.lastElement = null;
    ev.push({ type: 'recover' });
  } else if (intent.kind === 'charge') {
    ev.push({ type: 'enemyCharge', intent });
    e.patternIndex += 1;
  } else if (intent.kind === 'guard') {
    const g = intent.guard ?? 0;
    e.guard += g;
    ev.push({ type: 'enemyGuard', amount: g });
    e.patternIndex += 1;
  } else {
    const idx = resolveTarget(s, intent);
    ev.push({ type: 'enemyAttack', intent, target: idx });
    const value = intentValue(s, intent);
    e.weakened = false;
    let dealt = 0;
    if (idx === -1) s.party.forEach((m, i) => { if (alive(m)) dealt += hit(s, i, value, ev); });
    else dealt = hit(s, idx, value, ev);
    const ls = e.def.traits?.lifesteal;
    if (ls && dealt > 0) {
      const amount = Math.min(Math.round(dealt * ls), e.maxHp - e.hp);
      if (amount > 0) {
        e.hp += amount;
        ev.push({ type: 'enemyHeal', amount });
      }
    }
    e.patternIndex += 1;
  }
  checkEnd(s);
  if (s.phase === 'enemy') startPlayerTurn(s);
  return ev;
}
