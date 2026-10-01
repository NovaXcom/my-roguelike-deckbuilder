import {
  alive, canUse, canWait, defaultTarget, previewSkill, useSkill, wait, type BattleEvent, type BattleState,
} from './battle';
import { SKILLS } from './data';

/** 作戦の1手。skillId='wait' は待機 */
export interface PlanStep {
  member: number;
  skillId: string;
  /** 狙う敵(敵の編成上の位置)。倒れていたら先頭の生存者に切り替わる */
  target?: number;
}
export const WAIT_ID = 'wait';
export const MAX_PLAN = 3;

export const cloneBattle = (s: BattleState): BattleState => structuredClone(s);

const stepOk = (s: BattleState, st: PlanStep): boolean =>
  st.skillId === WAIT_ID ? canWait(s, st.member) : canUse(s, st.member, st.skillId);

/** 手を実行する(状態を直接変更)。実行できなければ null */
export function applyStep(s: BattleState, st: PlanStep): BattleEvent[] | null {
  return st.skillId === WAIT_ID ? wait(s, st.member) : useSkill(s, st.member, st.skillId, st.target);
}

export interface PlanResult {
  /** 作戦を順に実行した後の状態(複製。実際の戦闘状態は変わらない) */
  state: BattleState;
  events: BattleEvent[];
  /** 実行できた手(途中で無効になった手は除く) */
  steps: PlanStep[];
}

/** 作戦を複製した状態の上で順に実行する。実行不能になった手は取り除かれる。 */
export function simulatePlan(s: BattleState, plan: PlanStep[]): PlanResult {
  const state = cloneBattle(s);
  const events: BattleEvent[] = [];
  const steps: PlanStep[] = [];
  for (const st of plan) {
    if (state.phase !== 'player' || !stepOk(state, st)) continue;
    const ev = applyStep(state, st);
    if (!ev) continue;
    events.push(...ev);
    steps.push(st);
  }
  return { state, events, steps };
}

/** 作戦の末尾に手を足せるか(これまでの手を実行した後の状態で判定。順序で変わるCD/行動ポイントを反映) */
export function canAppend(s: BattleState, plan: PlanStep[], st: PlanStep): boolean {
  if (plan.length >= MAX_PLAN) return false;
  const { state, steps } = simulatePlan(s, plan);
  return steps.length === plan.length && stepOk(state, st);
}

export function appendStep(s: BattleState, plan: PlanStep[], st: PlanStep): PlanStep[] {
  return canAppend(s, plan, st) ? [...plan, st] : plan;
}

/** i番目の手を取り除く。後続の手は、まだ実行できるものだけ残る */
export function removeStep(s: BattleState, plan: PlanStep[], i: number): PlanStep[] {
  return simulatePlan(s, plan.filter((_, k) => k !== i)).steps;
}

export interface PlanSummary {
  /** 敵HPの減少予想の合計(継続ダメージは含まない) */
  damage: number;
  breaks: boolean;
  chains: number;
  reactions: string[];
  /** 作戦を実行すると敵を倒せるか(全滅) */
  kills: boolean;
  /** 倒せる敵の数 */
  killed: number;
  /** 何番目の手でブレイクするか(1始まり)。しない場合 null */
  breakAt: number | null;
  apLeft: number;
}

export function summarizePlan(s: BattleState, plan: PlanStep[]): PlanSummary {
  const { state, events } = simulatePlan(s, plan);
  let breakAt: number | null = null;
  const reactions: string[] = [];
  let chains = 0;
  let idx = 0;
  for (const e of events) {
    if (e.type === 'skill') idx += 1;
    if (e.type === 'break' && breakAt === null) breakAt = idx;
    if (e.type === 'reaction') reactions.push(e.name);
    if (e.type === 'chain') chains += 1;
  }
  return {
    damage: s.enemies.reduce((a, e, i) => a + (e.hp - state.enemies[i].hp), 0),
    breaks: breakAt !== null,
    chains, reactions,
    kills: state.enemies.every((e) => e.hp <= 0),
    killed: state.enemies.filter((e, i) => e.hp <= 0 && s.enemies[i].hp > 0).length,
    breakAt,
    apLeft: state.ap,
  };
}

/** 今の(計画適用後の)状態で、このスキルが何をするか。UIのプレビュー用 */
export function previewAfterPlan(s: BattleState, plan: PlanStep[], st: PlanStep) {
  const { state } = simulatePlan(s, plan);
  if (st.skillId === WAIT_ID) return null;
  return previewSkill(state, SKILLS[st.skillId], st.member, st.target ?? defaultTarget(state));
}

export const livingMembers = (s: BattleState): number[] => s.party.map((m, i) => (alive(m) ? i : -1)).filter((i) => i >= 0);
