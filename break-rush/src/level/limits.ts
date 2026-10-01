import { dashRange, jumpHeight, jumpRange } from '../physics/config';

/**
 * Distances the level generator may rely on. They are deliberately well inside what the movement can
 * do (verified in tests/physics.test.ts), so that every generated course is fair.
 */
export const SAFE_GAP = Math.floor(jumpRange() * 0.72 * 2) / 2;
/** A gap that needs the air dash. */
export const DASH_GAP = Math.floor((jumpRange() + dashRange() * 0.65) * 2) / 2;
/** Highest step the player can jump up comfortably. */
export const MAX_STEP_UP = Math.floor(jumpHeight() * 0.75 * 10) / 10;
