export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;
export const WORLD_WIDTH = 2400;
export const GROUND_Y = 480;

export const PLAYER = {
  maxHp: 100,
  speed: 260,
  jumpVelocity: -560,
  gravity: 1400,
  attackDuration: 220, // ms
  attackCooldown: 300, // ms
  attackDamage: 10,
  attackRange: 70,
  invulnMs: 700,
};

export const GRUNT = {
  maxHp: 30,
  speed: 90,
  contactDamage: 8,
  contactCooldown: 900, // ms
  knockback: 220,
};
