import Phaser from 'phaser';
import { Grunt } from '../enemies/Grunt';
import { Enemy } from '../enemies/Enemy';
import { GROUND_Y, HORDE, WORLD_WIDTH } from '../config';

/** Keeps a few grunts alive and periodically drops a large horde (BREAK CHANCE). */
export class EnemySpawner {
  readonly group: Phaser.GameObjects.Group;
  private lastSpawn = 0;
  private nextHordeAt: number;

  constructor(
    private scene: Phaser.Scene,
    private playerRef: Phaser.GameObjects.Components.Transform,
    private onHorde: () => void = () => {},
    private target = 3,
  ) {
    this.group = scene.add.group({ runChildUpdate: false });
    this.nextHordeAt = scene.time.now + HORDE.firstMs;
  }

  update(): void {
    const now = this.scene.time.now;
    if (now >= this.nextHordeAt) {
      this.nextHordeAt = now + HORDE.intervalMs;
      this.spawnHorde(HORDE.count);
      this.onHorde();
    }
    if (this.group.countActive() < this.target && now > this.lastSpawn + 1500) {
      this.spawnOne();
      this.lastSpawn = now;
    }
  }

  private spawnX(offset: number): number {
    const side = this.playerRef.x > WORLD_WIDTH / 2 ? -1 : 1;
    return Phaser.Math.Clamp(this.playerRef.x + side * offset, 40, WORLD_WIDTH - 40);
  }

  private spawnOne(): void {
    this.group.add(new Grunt(this.scene, this.spawnX(Phaser.Math.Between(450, 650)), GROUND_Y - 40));
  }

  private spawnHorde(n: number): void {
    for (let i = 0; i < n; i++) {
      this.group.add(new Grunt(this.scene, this.spawnX(520 + i * 22), GROUND_Y - 40));
    }
  }

  get enemies(): Enemy[] {
    return this.group.getChildren() as Enemy[];
  }
}
