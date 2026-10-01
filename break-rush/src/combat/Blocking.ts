/** Light attacks (chain steps 0 and 1) can be blocked; the finisher, counters and RUSH cannot. */
export const MAX_BLOCKABLE_STEP = 1;

export interface BlockContext {
  guardFacing: 1 | -1;
  guardX: number;
  attackerX: number;
  step: number;
  counter: boolean;
  rush: boolean;
  broken: boolean;
}

/** A guard blocks light hits that come from the side it is facing. Attack it from behind or hit it harder. */
export function isBlocked(c: BlockContext): boolean {
  if (c.broken || c.counter || c.rush) return false;
  if (c.step > MAX_BLOCKABLE_STEP) return false;
  const attackerSide = c.attackerX >= c.guardX ? 1 : -1;
  return attackerSide === c.guardFacing;
}
