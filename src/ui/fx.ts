import Phaser from 'phaser';
import { hasImg } from './assets';

/** 横並びスプレッドシート(正方形コマ×N)のエフェクトを1回再生する。画像が無ければ何もしない */
export function playSheetFx(
  scene: Phaser.Scene, key: string, x: number, y: number, scale: number, opts: { tint?: number; depth?: number; add?: boolean } = {},
): void {
  if (!hasImg(scene, key)) return;
  const tex = scene.textures.get(key);
  const src = tex.getSourceImage() as HTMLImageElement;
  const n = Math.max(1, Math.floor(src.width / src.height));
  const fs = src.height;
  for (let i = 0; i < n; i++) if (!tex.has(String(i))) tex.add(String(i), 0, i * fs, 0, fs, fs);
  const im = scene.add.image(x, y, key, '0').setScale(scale).setDepth(opts.depth ?? 2700);
  if (opts.add !== false) im.setBlendMode(Phaser.BlendModes.ADD);
  if (opts.tint !== undefined) im.setTint(opts.tint);
  let f = 0;
  scene.time.addEvent({
    delay: 70, repeat: n - 1,
    callback: () => { im.setFrame(String(Math.min(f, n - 1))); f += 1; if (f >= n) scene.time.delayedCall(70, () => im.destroy()); },
  });
}

/** エフェクト全体の長さ(ms) */
export const FX_MS = 6 * 70 + 70;
