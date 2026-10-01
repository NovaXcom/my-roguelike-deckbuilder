import Phaser from 'phaser';
import { Grunt } from '../enemies/Grunt';
import { Rusher } from '../enemies/Rusher';
import { GuardEnemy } from '../enemies/GuardEnemy';
import { Enemy } from '../enemies/Enemy';
import { MeleeEnemy } from '../enemies/MeleeEnemy';
import { AttackTokens } from '../combat/AttackTokens';
import { EnemyKind, GROUND_Y, MAX_ATTACKERS } from '../config';
import { TIER_HP_MULT } from './Loot';
import { SpawnGroup } from './RoomPlan';

type Ctor = new (scene: Phaser.Scene, x: number, y: number, hpMult: number, tier: 'fodder' | 'normal' | 'elite') => MeleeEnemy;
const KINDS: Record<EnemyKind, Ctor> = { grunt: Grunt, rusher: Rusher, guard: GuardEnemy };

export interface SpawnOpts {
  /** HP / damage multipliers from difficulty and depth. */
  hpMult: number;
  dmgMult: number;
  /** Part of the live locked fight. */
  inEncounter?: boolean;
  /** Enemies stay idle until the player is this close. */
  aggroRange?: number;
}

/** Owns the enemy group and the shared attack slots. */
export class EnemySpawner {
  readonly group: Phaser.GameObjects.Group;
  readonly tokens = new AttackTokens(MAX_ATTACKERS);
  /** Called for every enemy created here (to hook up effects). */
  onSpawn: (e: Enemy) => void = () => {};

  constructor(private scene: Phaser.Scene) {
    this.group = scene.add.group({ runChildUpdate: false });
  }

  /** Spawns groups with `xAt(i)` choosing each enemy's x. Elites are bigger and tougher. */
  spawnGroups(groups: SpawnGroup[], xAt: (i: number) => number, o: SpawnOpts): MeleeEnemy[] {
    const list = Phaser.Utils.Array.Shuffle(groups.flatMap((g) => Array(g.count).fill(g) as SpawnGroup[]));
    return list.map((g, i) => {
      const tier = g.tier ?? 'normal';
      const e = new KINDS[g.kind](this.scene, xAt(i), GROUND_Y - 50, o.hpMult * TIER_HP_MULT[tier], tier);
      e.dmgMult = o.dmgMult;
      e.tokens = this.tokens;
      e.inEncounter = !!o.inEncounter;
      if (o.aggroRange !== undefined) e.aggroRange = o.aggroRange;
      if (tier === 'elite') {
        e.setScale(1.3);
        e.setData('elite', true);
      }
      this.group.add(e);
      this.onSpawn(e);
      return e;
    });
  }

  add(enemy: Enemy): void {
    this.group.add(enemy);
    this.onSpawn(enemy);
  }

  /** Enemies still alive that belong to the live fight. */
  encounterAlive(): number {
    return this.enemies.filter((e) => e.active && !e.dead && (e as MeleeEnemy).inEncounter).length;
  }

  aliveCount(): number {
    return this.enemies.filter((e) => e.active && !e.dead).length;
  }

  clear(): void {
    this.enemies.forEach((e) => e.destroy());
  }

  get enemies(): Enemy[] {
    return this.group.getChildren() as Enemy[];
  }
}
