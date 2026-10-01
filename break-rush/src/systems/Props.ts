import Phaser from 'phaser';
import { GROUND_Y } from '../config';
import { Rect } from '../combat/DamageSystem';

/** A breakable crate. Hit it once. */
export class Crate {
  readonly img: Phaser.GameObjects.Image;
  broken = false;

  constructor(scene: Phaser.Scene, readonly x: number) {
    this.img = scene.add.image(x, GROUND_Y - 18, 'crate').setDepth(2);
  }

  get rect(): Rect {
    return { x: this.x - 18, y: GROUND_Y - 36, w: 36, h: 36 };
  }

  break(): void {
    this.broken = true;
    this.img.destroy();
  }
}

export type StationKind = 'chest' | 'campfire' | 'merchant';

/** Something to walk up to and press E on (chest, campfire, merchant). */
export class Station {
  readonly img: Phaser.GameObjects.Image;
  used = false;
  private prompt: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, readonly kind: StationKind, readonly x: number) {
    const tex = kind === 'chest' ? 'chest' : kind === 'campfire' ? 'campfire' : 'merchant';
    this.img = scene.add.image(x, 0, tex).setDepth(2);
    this.img.y = GROUND_Y - this.img.height / 2;
    this.prompt = scene.add
      .text(x, GROUND_Y - this.img.height - 28, '', { fontFamily: 'monospace', fontSize: '15px', fontStyle: 'bold', color: '#fff', stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(60)
      .setVisible(false);
    if (kind === 'campfire') {
      scene.add
        .particles(x, GROUND_Y - 26, 'spark', {
          speedY: { min: -70, max: -30 },
          speedX: { min: -14, max: 14 },
          lifespan: { min: 500, max: 900 },
          scale: { start: 1.2, end: 0 },
          tint: [0xff7a1a, 0xffc233, 0xff4d1a],
          frequency: 50,
          blendMode: 'ADD',
        })
        .setDepth(3);
      scene.add.circle(x, GROUND_Y - 24, 130, 0xff9a33, 0.07).setDepth(1);
    }
    if (kind === 'chest') scene.add.circle(x, GROUND_Y - 24, 90, 0xffd633, 0.08).setDepth(1);
  }

  near(px: number): boolean {
    return Math.abs(px - this.x) < 80;
  }

  setPrompt(text: string | null, now: number): void {
    this.prompt.setVisible(text !== null);
    if (text !== null) this.prompt.setText(text).setY(GROUND_Y - this.img.height - 28 + Math.sin(now / 150) * 3);
  }

  markUsed(): void {
    this.used = true;
    this.setPrompt(null, 0);
    if (this.kind === 'chest') this.img.setTint(0x555555);
  }
}
