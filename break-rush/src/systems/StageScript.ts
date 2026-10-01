export type StageStep =
  | { type: 'wave'; count: number; label?: string; horde?: boolean }
  | { type: 'upgrade' }
  | { type: 'boss' };

export type Route = 'standard' | 'swarm' | 'fortress';

export interface RouteDef {
  name: string;
  desc: string;
  countMult: number;
  bossHpMult: number;
  scoreMult: number;
  extraUpgrade: boolean;
}

export const ROUTES: Record<Route, RouteDef> = {
  standard: { name: 'STANDARD', desc: '', countMult: 1, bossHpMult: 1, scoreMult: 1, extraUpgrade: false },
  swarm: { name: 'SWARM ROAD', desc: '+40% enemies, score x1.3', countMult: 1.4, bossHpMult: 1, scoreMult: 1.3, extraUpgrade: false },
  fortress: { name: 'FORTRESS ROAD', desc: '-20% enemies, extra upgrade, boss HP +30%', countMult: 0.8, bossHpMult: 1.3, scoreMult: 1.1, extraUpgrade: true },
};

/** Stage layout: waves -> upgrade -> waves -> BREAK CHANCE horde -> boss. Later stages scale enemy counts. */
export function buildStage(stage: number, route: Route = 'standard'): StageStep[] {
  const r = ROUTES[route];
  const k = (1 + 0.25 * (stage - 1)) * r.countMult;
  const c = (n: number) => Math.max(1, Math.round(n * k));
  const steps: StageStep[] = [
    { type: 'wave', count: c(3) },
    { type: 'wave', count: c(5) },
    { type: 'wave', count: c(8) },
    { type: 'upgrade' },
    { type: 'wave', count: c(6) },
    { type: 'wave', count: c(15), label: 'BREAK CHANCE!', horde: true },
    { type: 'boss' },
  ];
  if (r.extraUpgrade) steps.splice(steps.length - 1, 0, { type: 'upgrade' });
  return steps;
}

export function bossHpScale(stage: number): number {
  return 1 + 0.5 * (stage - 1);
}

export class StageRunner {
  private index = 0;

  constructor(readonly steps: StageStep[], startIndex = 0) {
    this.index = Math.min(Math.max(0, startIndex), steps.length - 1);
  }

  get current(): StageStep {
    return this.steps[this.index];
  }

  get finished(): boolean {
    return this.index >= this.steps.length;
  }

  advance(): void {
    this.index++;
  }

  /** 1-based number of the current wave among wave steps, and total wave count. */
  waveProgress(): { n: number; total: number } {
    const total = this.steps.filter((s) => s.type === 'wave').length;
    const n = this.steps.slice(0, this.index + 1).filter((s) => s.type === 'wave').length;
    return { n, total };
  }
}
