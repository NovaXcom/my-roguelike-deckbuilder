import Phaser from 'phaser';
import { Grunt } from '../enemies/Grunt';
import { Enemy } from '../enemies/Enemy';
import { GROUND_Y, WORLD_WIDTH } from '../config';

/** Owns the enemy group. Waves are driven by the stage script, not by timers. */
export class EnemySpawner {
  readonly group: Phaser.GameObjects.Group;

  constructor(private scene: Phaser.Scene, private playerRef: Phaser.GameObjects.Components.Transform, private hpMult = 1) {
    this.group = scene.add.group({ runChildUpdate: false });
  }

  /** Spawns grunts alternating left/right of the player, staggered so they arrive in a stream. */
  spawn(count: number): void {
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const offset = 480 + Math.floor(i / 2) * 36 + Phaser.Math.Between(0, 20);
      const x = Phaser.Math.Clamp(this.playerRef.x + side * offset, 40, WORLD_WIDTH - 40);
      this.group.add(new Grunt(this.scene, x, GROUND_Y - 40, this.hpMult));
    }
  }

  add(enemy: Enemy): void {
    this.group.add(enemy);
  }

  aliveCount(): number {
    return this.enemies.filter((e) => e.active && !e.dead).length;
  }

  get enemies(): Enemy[] {
    return this.group.getChildren() as Enemy[];
  }
}
