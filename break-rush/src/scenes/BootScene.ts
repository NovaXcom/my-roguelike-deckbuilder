import Phaser from 'phaser';
import { GAME_WIDTH } from '../config';
import { audio } from '../audio/AudioSystem';
import { loadSave } from '../systems/SaveSystem';
import { newRun } from '../systems/RunState';

type Gfx = Phaser.GameObjects.Graphics;

/** Generates every texture in code (no external assets), then routes to the title / dev shortcuts. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const tex = (key: string, w: number, h: number, draw: (g: Gfx) => void) => {
      g.clear();
      draw(g);
      g.generateTexture(key, w, h);
    };

    // Art is drawn facing right; sprites flip for left.
    tex('player', 32, 48, (g) => {
      g.fillStyle(0xff4d6d).fillTriangle(8, 7, 0, 3, 1, 13); // headband tail
      g.fillStyle(0x16224a).fillRoundedRect(9, 34, 6, 14, 2).fillRoundedRect(18, 34, 6, 14, 2);
      g.fillStyle(0x2f8cff).fillRoundedRect(6, 18, 20, 20, 5);
      g.fillStyle(0xa8dcff).fillRect(9, 23, 14, 3);
      g.fillStyle(0x2f8cff).fillRoundedRect(22, 22, 10, 7, 3);
      g.fillStyle(0xffd2a8).fillCircle(16, 11, 9);
      g.fillStyle(0xff4d6d).fillRect(7, 5, 18, 5);
      g.fillStyle(0xffffff).fillRect(18, 10, 7, 6);
      g.fillStyle(0x10131f).fillRect(22, 11, 3, 5);
    });

    tex('grunt', 32, 40, (g) => {
      g.fillStyle(0x6a1626).fillRoundedRect(5, 32, 8, 8, 2).fillRoundedRect(19, 32, 8, 8, 2);
      g.fillStyle(0xe0505a).fillRoundedRect(2, 10, 28, 26, 7);
      g.fillStyle(0xb02f3d).fillRoundedRect(4, 26, 24, 9, 4);
      g.fillStyle(0xffe9a8).fillTriangle(5, 12, 9, 0, 13, 12).fillTriangle(19, 12, 23, 0, 27, 12);
      g.fillStyle(0xffffff).fillRect(17, 16, 8, 6).fillRect(6, 16, 8, 6);
      g.fillStyle(0x1a0508).fillRect(21, 17, 4, 5).fillRect(10, 17, 4, 5);
      g.fillStyle(0x1a0508).fillTriangle(5, 14, 15, 14, 15, 18).fillTriangle(27, 14, 17, 14, 17, 18);
      g.fillStyle(0x3a0a12).fillRect(9, 27, 16, 5);
      g.fillStyle(0xffffff).fillRect(11, 27, 3, 3).fillRect(17, 27, 3, 3);
    });

    tex('rusher', 28, 44, (g) => {
      g.fillStyle(0x8a4a00).fillRoundedRect(5, 34, 6, 10, 2).fillRoundedRect(17, 34, 6, 10, 2);
      g.fillStyle(0xffc233).fillRoundedRect(4, 14, 20, 24, 6);
      g.fillStyle(0xff8a00).fillRect(4, 24, 20, 4);
      g.fillStyle(0xff5a00).fillTriangle(6, 14, 20, 14, 27, 2).fillTriangle(6, 14, 14, 14, 10, 0);
      g.fillStyle(0xffc233).fillCircle(14, 12, 8);
      g.fillStyle(0xffffff).fillRect(15, 9, 8, 4);
      g.fillStyle(0xc0f0ff).fillTriangle(22, 22, 28, 26, 22, 30);
    });

    tex('guard', 40, 52, (g) => {
      g.fillStyle(0x1f2f4d).fillRoundedRect(7, 42, 9, 10, 2).fillRoundedRect(19, 42, 9, 10, 2);
      g.fillStyle(0x4a6fa5).fillRoundedRect(3, 16, 26, 30, 6);
      g.fillStyle(0x2b3f66).fillRoundedRect(5, 3, 22, 18, 7);
      g.fillStyle(0x0d1830).fillRect(8, 10, 18, 4);
      g.fillStyle(0xffd24d).fillRect(20, 10, 5, 4);
      // shield on the front (right) side
      g.fillStyle(0x8fa3c4).fillRoundedRect(26, 10, 13, 38, 4);
      g.fillStyle(0xc9d6ea).fillRoundedRect(28, 12, 9, 34, 3);
      g.fillStyle(0xff4d4d).fillTriangle(32, 20, 36, 30, 28, 30);
    });

    tex('boss', 120, 100, (g) => {
      g.fillStyle(0x2a303a).fillRoundedRect(4, 82, 112, 18, 6);
      g.fillStyle(0x667788).fillRoundedRect(0, 0, 120, 88, 8);
      g.fillStyle(0x3d4757).fillRect(0, 62, 120, 26);
      g.fillStyle(0x556070).fillRect(10, 10, 100, 12).fillRect(10, 30, 100, 12);
      g.fillStyle(0x8da0b4).fillRect(10, 10, 100, 3).fillRect(10, 30, 100, 3);
      g.fillStyle(0xff3344).fillRoundedRect(76, 46, 28, 14, 4);
      g.fillStyle(0xffd0d4).fillRect(94, 50, 6, 6);
      g.fillStyle(0xffaa33).fillRect(14, 68, 6, 6).fillRect(28, 68, 6, 6).fillRect(42, 68, 6, 6);
    });

    tex('spark', 8, 8, (g) => g.fillStyle(0xffffff).fillRect(0, 0, 8, 8));

    // --- Backdrop -------------------------------------------------------
    tex('bg_sky', GAME_WIDTH, 540, (g) => {
      g.fillGradientStyle(0x0b0820, 0x0b0820, 0x6a2468, 0x6a2468, 1).fillRect(0, 0, GAME_WIDTH, 540);
      const rnd = new Phaser.Math.RandomDataGenerator(['stars']);
      for (let i = 0; i < 70; i++) g.fillStyle(0xffffff, rnd.realInRange(0.2, 0.8)).fillRect(rnd.between(0, GAME_WIDTH), rnd.between(0, 260), 2, 2);
      g.fillStyle(0xffd9a0, 0.12).fillCircle(760, 130, 80).fillStyle(0xffd9a0, 0.2).fillCircle(760, 130, 58);
      g.fillStyle(0xffe6bd, 1).fillCircle(760, 130, 44);
    });
    this.skyline('bg_far', GAME_WIDTH, 300, 0x1b1140, 0x2a1a5c, 0xffd27a, 0.35, 'far');
    this.skyline('bg_near', GAME_WIDTH, 340, 0x0f0822, 0x1a0f36, 0xffd27a, 0.55, 'near');

    tex('ground', 64, 64, (g) => {
      g.fillStyle(0x1c1233).fillRect(0, 0, 64, 64);
      g.fillStyle(0x140c26).fillRect(0, 10, 64, 54);
      g.fillStyle(0x3cf0ff, 0.9).fillRect(0, 0, 64, 3);
      g.fillStyle(0x3cf0ff, 0.25).fillRect(0, 3, 64, 5);
      g.fillStyle(0x2a1d4d).fillRect(0, 10, 2, 54).fillRect(0, 36, 64, 2);
    });
    g.destroy();

    audio.muted = loadSave().settings.muted;
    // Dev shortcuts: ?start=result previews the result screen; any other ?start= skips the title.
    const start = new URLSearchParams(location.search).get('start');
    if (start === 'result') {
      this.scene.start('Result', {
        run: newRun(),
        summary: { stage: 1, score: 12345, maxCombo: 62, damageTaken: 20, timeSec: 130, rank: 'A', bestBefore: 15000, newRecord: false, unlocked: ['HARD MODE'] },
      });
    } else this.scene.start(start ? 'Game' : 'Title');
  }

  /** Tileable city silhouette. First and last buildings match so the tile wraps cleanly. */
  private skyline(key: string, w: number, h: number, body: number, edge: number, windowColor: number, windowAlpha: number, layer: 'far' | 'near'): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const rnd = new Phaser.Math.RandomDataGenerator([key]);
    const heightOf = () => rnd.between(layer === 'far' ? 80 : 120, layer === 'far' ? 220 : 300);
    const firstH = heightOf();
    let x = 0;
    while (x < w) {
      const bw = Math.min(rnd.between(46, 96), w - x);
      const bh = x + bw >= w ? firstH : x === 0 ? firstH : heightOf();
      g.fillStyle(body).fillRect(x, h - bh, bw, bh);
      g.fillStyle(edge).fillRect(x, h - bh, bw, 3);
      for (let wy = h - bh + 12; wy < h - 10; wy += 14) {
        for (let wx = x + 6; wx < x + bw - 8; wx += 12) {
          if (rnd.frac() < 0.35) g.fillStyle(windowColor, windowAlpha * rnd.realInRange(0.5, 1)).fillRect(wx, wy, 5, 7);
        }
      }
      if (layer === 'near' && bw > 60 && rnd.frac() < 0.5) {
        const neon = rnd.pick([0xff3c8f, 0x3cf0ff, 0xb06cff]);
        const ny = h - bh + rnd.between(20, Math.max(21, bh - 60));
        g.fillStyle(neon, 0.25).fillRect(x + 6, ny - 3, bw - 12, 22);
        g.fillStyle(neon, 0.9).fillRect(x + 10, ny, bw - 20, 4).fillRect(x + 10, ny + 10, (bw - 20) * 0.6, 4);
      }
      x += bw;
    }
    g.generateTexture(key, w, h);
    g.destroy();
  }
}
