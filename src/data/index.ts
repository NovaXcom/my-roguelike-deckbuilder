import { CORE_EVENTS, FINALES } from './events_core';
import { TOWN_A } from './events_town_a';
import { TOWN_B } from './events_town_b';
import { UNDER } from './events_under';
import { TELLS } from './tells';
import type { GameEvent } from '../engine/types';

export const EVENTS: GameEvent[] = [...CORE_EVENTS, ...TOWN_A, ...TOWN_B, ...UNDER];
export { FINALES, TELLS };
