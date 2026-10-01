export type StageStep =
  | { type: 'wave'; count: number; label?: string; horde?: boolean }
  | { type: 'upgrade' }
  | { type: 'boss' };

/** Stage layout: waves -> upgrade -> waves -> BREAK CHANCE horde -> boss. Later stages scale enemy counts. */
export function buildStage(stage: number): StageStep[] {
  const k = 1 + 0.25 * (stage - 1);
  const c = (n: number) => Math.round(n * k);
  return [
    { type: 'wave', count: c(3) },
    { type: 'wave', count: c(5) },
    { type: 'wave', count: c(8) },
    { type: 'upgrade' },
    { type: 'wave', count: c(6) },
    { type: 'wave', count: c(15), label: 'BREAK CHANCE!', horde: true },
    { type: 'boss' },
  ];
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
