import { ENEMIES, MEMBERS, PARTY_ORDER, SKILLS } from './data';
import type { EnemyIntent, EnemyState, MemberState, Role, SkillDef } from './types';

export const CHAIN_MULT = 2;
export const SHIELDED_MULT = 0.75;
export const WEAK_MULT = 1.5;
export const RESIST_MULT = 0.5;

export type BattlePhase = 'player' | 'enemy' | 'won' | 'lost';

export interface BattleState {
  party: MemberState[]; // [0]=前衛 [1]=後衛
  enemy: EnemyState;
  turn: number;
  phase: BattlePhase;
  chainMult: number;
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
}
export interface BattleSetup {
  members: MemberSetup[];
  chainMult: number;
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
  | { type: 'damage'; target: 'enemy'; amount: number; element: SkillDef['element']; weak: boolean; resist: boolean; chain: boolean }
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
        def: d, hp: m.hp, maxHp: m.maxHp, guard: 0, taunt: false, acted: false,
        cooldowns: Object.fromEntries(m.skills.map((s) => [s, 0])),
        skills: [...m.skills], power: m.power, guardBonus: m.guardBonus, breakBonus: m.breakBonus, openingGuard: m.openingGuard,
      };
    }),
    enemy: {
      def, hp: maxHp, maxHp, shield: def.maxShield, maxShield: def.maxShield, broken: false, patternIndex: 0, atkMult: scale.atk,
    },
    turn: 0,
    phase: 'player',
    chainMult: setup.chainMult,
  };
}

export const alive = (m: { hp: number }): boolean => m.hp > 0;

export function currentIntent(s: BattleState): EnemyIntent {
  const p = s.enemy.def.pattern;
  return p[s.enemy.patternIndex % p.length];
}

/** 階層補正込みの実際の攻撃値（UI表示・ダメージ計算で共通） */
export function intentValue(s: BattleState, intent: EnemyIntent = currentIntent(s)): number {
  return Math.round(intent.value * s.enemy.atkMult);
}

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
  for (const m of s.party) {
    for (const id of Object.keys(m.cooldowns)) if (s.turn > 1) m.cooldowns[id] = Math.max(0, m.cooldowns[id] - 1);
    m.guard = s.turn === 1 && alive(m) ? m.openingGuard : 0;
    m.taunt = false;
    m.acted = false;
  }
}

export function canUse(s: BattleState, member: number, skillId: string): boolean {
  const m = s.party[member];
  return s.phase === 'player' && !!m && alive(m) && !m.acted && m.cooldowns[skillId] === 0;
}

export interface DamagePreview {
  hp: number;
  shield: number;
  weak: boolean;
  resist: boolean;
  chain: boolean;
  /** このヒットでシールドが尽きてブレイクするか */
  breaks: boolean;
}

/** スキルが現在の敵に与えるダメージ（実行時と同一ロジック。UIのプレビューにも使う）。装備補正を含む。 */
export function previewSkill(s: BattleState, skill: SkillDef, member = 0): DamagePreview {
  const e = s.enemy;
  const m = s.party[member];
  const weak = skill.element !== 'none' && e.def.weak === skill.element;
  const resist = skill.element !== 'none' && e.def.resist === skill.element;
  const chain = skill.kind === 'magic' && e.broken && !!skill.damage;
  let hp = 0;
  if (skill.damage) {
    let mult = 1;
    if (weak) mult *= WEAK_MULT;
    if (resist) mult *= RESIST_MULT;
    if (chain) mult *= s.chainMult;
    else if (e.shield > 0 && !e.broken) mult *= SHIELDED_MULT;
    hp = Math.max(1, Math.floor((skill.damage + m.power) * mult));
  }
  const breakPower = skill.breakPower ? skill.breakPower + m.breakBonus : 0;
  const shield = e.broken ? 0 : Math.min(e.shield, breakPower);
  return { hp, shield, weak, resist, chain, breaks: !e.broken && e.shield > 0 && shield >= e.shield && shield > 0 };
}

function checkEnd(s: BattleState): void {
  if (s.enemy.hp <= 0) s.phase = 'won';
  else if (s.party.every((m) => !alive(m))) s.phase = 'lost';
}

export function useSkill(s: BattleState, member: number, skillId: string): BattleEvent[] | null {
  if (!canUse(s, member, skillId)) return null;
  const skill = SKILLS[skillId];
  const m = s.party[member];
  m.acted = true;
  m.cooldowns[skillId] = skill.cooldown;
  const ev: BattleEvent[] = [{ type: 'skill', member, skillId }];

  if (skill.damage || skill.breakPower) {
    const p = previewSkill(s, skill, member);
    const e = s.enemy;
    if (skill.damage) {
      e.hp = Math.max(0, e.hp - p.hp);
      ev.push({ type: 'damage', target: 'enemy', amount: p.hp, element: skill.element, weak: p.weak, resist: p.resist, chain: p.chain });
      if (p.chain) ev.push({ type: 'chain', element: skill.element, amount: p.hp });
    }
    if (p.shield > 0) {
      e.shield -= p.shield;
      ev.push({ type: 'shield', amount: p.shield });
      if (e.shield <= 0) {
        e.broken = true;
        ev.push({ type: 'break' });
      }
    }
  }
  if (skill.guardSelf) {
    const v = skill.guardSelf + m.guardBonus;
    m.guard += v;
    ev.push({ type: 'guard', member, amount: v });
  }
  if (skill.guardAlly) {
    const v = skill.guardAlly + m.guardBonus;
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

/** 生存メンバー全員が行動済みか（自動でターン終了する判定に使う） */
export const allActed = (s: BattleState): boolean => s.party.every((m) => !alive(m) || m.acted);

function hit(s: BattleState, idx: number, value: number, ev: BattleEvent[]): void {
  const t = s.party[idx];
  const blocked = Math.min(t.guard, value);
  t.guard -= blocked;
  const amount = value - blocked;
  t.hp = Math.max(0, t.hp - amount);
  ev.push({ type: 'hurt', member: idx, amount, blocked });
  if (t.hp === 0) ev.push({ type: 'down', member: idx });
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
  if (e.broken) {
    ev.push({ type: 'stunned' });
    e.broken = false;
    e.shield = e.maxShield;
    ev.push({ type: 'recover' });
  } else {
    const intent = currentIntent(s);
    const idx = resolveTarget(s, intent);
    ev.push({ type: 'enemyAttack', intent, target: idx });
    const value = intentValue(s, intent);
    if (idx === -1) s.party.forEach((m, i) => { if (alive(m)) hit(s, i, value, ev); });
    else hit(s, idx, value, ev);
    e.patternIndex += 1;
  }
  checkEnd(s);
  if (s.phase === 'enemy') startPlayerTurn(s);
  return ev;
}
