import { Difficulty } from './Difficulty';
import { Route } from './StageScript';
import { UpgradeId } from './UpgradeSystem';

/** Data that survives between stages of one run. */
export interface RunState {
  stage: number;
  owned: UpgradeId[];
  totalScore: number;
  difficulty: Difficulty;
  route: Route;
  /** Upgrades offered at the previous choice, avoided next time so offers vary. */
  lastOffered: UpgradeId[];
}

export function newRun(difficulty: Difficulty = 'normal'): RunState {
  return { stage: 1, owned: [], totalScore: 0, difficulty, route: 'standard', lastOffered: [] };
}

export function nextStage(run: RunState, route: Route): RunState {
  return { ...run, stage: run.stage + 1, route, owned: [...run.owned], lastOffered: [...run.lastOffered] };
}

export interface StageSummary {
  stage: number;
  score: number;
  maxCombo: number;
  damageTaken: number;
  timeSec: number;
  rank: string;
  /** Previous best for this difficulty, before this run total was recorded. */
  bestBefore: number;
  newRecord: boolean;
  unlocked: string[];
}
