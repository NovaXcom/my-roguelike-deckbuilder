import Phaser from 'phaser';
import { Grunt } from '../enemies/Grunt';
import { Enemy } from '../enemies/Enemy';
import { GROUND_Y, WORLD_WIDTH } from '../config';

/** Phase 1: keeps a small, fixed-size group of grunts alive. Replaced by wave logic later. */
export class EnemySpawner {
  readonly group: Phaser.GameObjects.Group;

  constructor(private scene: Phaser.Scene, private playerRef: Phaser.GameObjects.Components.Transform, private target = 3) {
    this.group = scene.add.group({ runChildUpdate: false });
  }

  update(): void {
    this.group.getChildren().forEach((c) => (c.active ? undefined : this.group.remove(c, true, true)));
    const now = this.scene.time.now;
    if (this.group.countActive() < this.target && now > this.lastSpawn + 1500) {
      this.spawn();
      this.lastSpawn = now;
    }
  }

  private lastSpawn = 0;

  private spawn(): void {
    const side = this.playerRef.x > WORLD_WIDTH / 2 ? -1 : 1;
    const x = Phaser.Math.Clamp(this.playerRef.x + side * Phaser.Math.Between(450, 650), 40, WORLD_WIDTH - 40);
    const e = new Grunt(this.scene, x, GROUND_Y - 40);
    this.group.add(e);
  }

  get enemies(): Enemy[] {
    return this.group.getChildren() as Enemy[];
  }
}
