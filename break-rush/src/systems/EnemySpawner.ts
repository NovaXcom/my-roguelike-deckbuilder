import Phaser from 'phaser';
import { Grunt } from '../enemies/Grunt';
import { Rusher } from '../enemies/Rusher';
import { GuardEnemy } from '../enemies/GuardEnemy';
import { Enemy } from '../enemies/Enemy';
import { MeleeEnemy } from '../enemies/MeleeEnemy';
import { AttackTokens } from '../combat/AttackTokens';
import { EnemyKind, GROUND_Y, MAX_ATTACKERS, WORLD_WIDTH } from '../config';
import { SpawnGroup } from './StageScript';

const KINDS: Record<EnemyKind, new (scene: Phaser.Scene, x: number, y: number, hpMult: number) => MeleeEnemy> = {
  grunt: Grunt,
  rusher: Rusher,
  guard: GuardEnemy,
};

/** Owns the enemy group and the shared attack slots. Waves are driven by the stage script. */
export class EnemySpawner {
  readonly group: Phaser.GameObjects.Group;
  readonly tokens = new AttackTokens(MAX_ATTACKERS);
  /** Called for every enemy created here (to hook up effects). */
  onSpawn: (e: Enemy) => void = () => {};

  constructor(private scene: Phaser.Scene, private playerRef: Phaser.GameObjects.Components.Transform, private hpMult = 1) {
    this.group = scene.add.group({ runChildUpdate: false });
  }

  /** Spawns a mixed wave on both sides of the player, close enough to be in the fight within a couple of seconds. */
  spawnWave(groups: SpawnGroup[]): void {
    const list: EnemyKind[] = Phaser.Utils.Array.Shuffle(groups.flatMap((g) => Array<EnemyKind>(g.count).fill(g.kind)));
    list.forEach((kind, i) => {
      let side: 1 | -1 = i % 2 === 0 ? 1 : -1;
      const offset = 380 + Math.floor(i / 2) * 34 + Phaser.Math.Between(0, 20);
      let x = this.playerRef.x + side * offset;
      if (x < 40 || x > WORLD_WIDTH - 40) {
        side = (side * -1) as 1 | -1; // no room on that side: come from the other
        x = this.playerRef.x + side * offset;
      }
      x = Phaser.Math.Clamp(x, 40, WORLD_WIDTH - 40);
      const e = new KINDS[kind](this.scene, x, GROUND_Y - 40, this.hpMult);
      e.tokens = this.tokens;
      this.group.add(e);
      this.onSpawn(e);
    });
  }

  add(enemy: Enemy): void {
    this.group.add(enemy);
    this.onSpawn(enemy);
  }

  aliveCount(): number {
    return this.enemies.filter((e) => e.active && !e.dead).length;
  }

  get enemies(): Enemy[] {
    return this.group.getChildren() as Enemy[];
  }
}
