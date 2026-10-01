import { UpgradeId } from './UpgradeSystem';

/** Data that survives between stages. */
export interface RunState {
  stage: number;
  owned: UpgradeId[];
  totalScore: number;
}

export function newRun(): RunState {
  return { stage: 1, owned: [], totalScore: 0 };
}

export function nextStage(run: RunState): RunState {
  return { ...run, stage: run.stage + 1, owned: [...run.owned] };
}

export interface StageSummary {
  stage: number;
  score: number;
  maxCombo: number;
  damageTaken: number;
  timeSec: number;
  rank: string;
}
