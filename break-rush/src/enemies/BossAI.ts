import { BOSS } from '../config';

export type BossAttack = 'charge' | 'slam' | 'missile';
export type BossPhase = 'idle' | 'windup' | 'attack' | 'recover';

export interface BossEvent {
  /** The phase that just began. */
  type: BossPhase;
  attack: BossAttack;
  durationMs: number;
}

const ATTACKS: BossAttack[] = ['charge', 'slam', 'missile'];
const T = {
  idle: 1400,
  idleEnraged: 800,
  windup: { charge: 700, slam: 800, missile: 600 },
  attack: { charge: 700, slam: 200, missile: 450 },
  recover: { charge: 600, slam: 700, missile: 500 },
};
/** Enraged bosses wind up and recover faster. */
const ENRAGE_SPEEDUP = 0.7;

export function isEnraged(hpRatio: number): boolean {
  return hpRatio <= BOSS.enrageAt;
}

/** Pure attack-cycle state machine: idle -> windup (telegraph) -> attack -> recover -> idle. */
export class BossAI {
  phase: BossPhase = 'idle';
  attack: BossAttack = 'charge';
  private until: number;
  private last: BossAttack | null = null;

  constructor(private rand: () => number = Math.random, startAt = 0) {
    this.until = startAt + T.idle;
  }

  update(now: number, hpRatio: number): BossEvent | null {
    if (now < this.until) return null;
    const k = isEnraged(hpRatio) ? ENRAGE_SPEEDUP : 1;
    switch (this.phase) {
      case 'idle': {
        const choices = ATTACKS.filter((a) => a !== this.last);
        this.attack = choices[Math.floor(this.rand() * choices.length)];
        this.last = this.attack;
        this.phase = 'windup';
        return this.begin(now, T.windup[this.attack] * k);
      }
      case 'windup':
        this.phase = 'attack';
        return this.begin(now, T.attack[this.attack]);
      case 'attack':
        this.phase = 'recover';
        return this.begin(now, T.recover[this.attack] * k);
      case 'recover':
        this.phase = 'idle';
        return this.begin(now, isEnraged(hpRatio) ? T.idleEnraged : T.idle);
    }
  }

  /** Cancels the current attack (boss was broken). */
  interrupt(now: number): void {
    this.phase = 'idle';
    this.until = now + 900;
  }

  private begin(now: number, ms: number): BossEvent {
    this.until = now + ms;
    return { type: this.phase, attack: this.attack, durationMs: ms };
  }
}
