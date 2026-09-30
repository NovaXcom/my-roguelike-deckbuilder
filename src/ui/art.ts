import Phaser from 'phaser';
import type { Role } from '../core/types';

/** 画像アセット無しでも成立させるための Canvas(Graphics) 描画ユーティリティ群。 */
export const FONT = '"Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP","Meiryo",sans-serif';
export const COLORS = {
  wood: 0x1e1b18,
  stone: 0x2d3748,
  energy: 0x00f2fe,
  gold: 0xf6c453,
  block: 0x5aa9ff,
  hp: 0xd64545,
};

export function txt(
  scene: Phaser.Scene,
  x: number,
  y: number,
  s: string,
  size: number,
  color = '#f4ede4',
  style: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  return scene
    .add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color, ...style })
    .setResolution(2);
}

export function drawBackground(scene: Phaser.Scene, w: number, h: number): void {
  const g = scene.add.graphics();
  g.fillGradientStyle(0x2d3748, 0x2d3748, 0x1e1b18, 0x1e1b18, 1);
  g.fillRect(0, 0, w, h);
  // 床（ダークストーンの帯）
  g.fillStyle(0x1e1b18, 0.9);
  g.fillRect(0, h * 0.62, w, h * 0.38);
  g.lineStyle(2, 0x3b3530, 1);
  g.lineBetween(0, h * 0.62, w, h * 0.62);
  // 木目風の細線
  g.lineStyle(1, 0x2a2622, 0.8);
  for (let y = h * 0.66; y < h; y += 22) g.lineBetween(0, y, w, y);
  g.setDepth(-100);
}

export function drawSword(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, color: number): void {
  g.fillStyle(color, 1);
  g.fillPoints([
    new Phaser.Math.Vector2(x + s * 0.45, y - s * 0.5),
    new Phaser.Math.Vector2(x + s * 0.5, y - s * 0.4),
    new Phaser.Math.Vector2(x - s * 0.15, y + s * 0.2),
    new Phaser.Math.Vector2(x - s * 0.25, y + s * 0.1),
  ], true);
  g.lineStyle(Math.max(2, s * 0.1), color, 1);
  g.lineBetween(x - s * 0.4, y + s * 0.4, x - s * 0.2, y + s * 0.2);
  g.lineBetween(x - s * 0.32, y + s * 0.02, x - s * 0.02, y + s * 0.32);
}

export function drawShield(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, color: number): void {
  g.fillStyle(color, 1);
  g.fillPoints([
    new Phaser.Math.Vector2(x - s * 0.4, y - s * 0.4),
    new Phaser.Math.Vector2(x + s * 0.4, y - s * 0.4),
    new Phaser.Math.Vector2(x + s * 0.4, y + s * 0.05),
    new Phaser.Math.Vector2(x, y + s * 0.5),
    new Phaser.Math.Vector2(x - s * 0.4, y + s * 0.05),
  ], true);
  g.fillStyle(0xffffff, 0.25);
  g.fillPoints([
    new Phaser.Math.Vector2(x - s * 0.3, y - s * 0.3),
    new Phaser.Math.Vector2(x, y - s * 0.3),
    new Phaser.Math.Vector2(x, y + s * 0.35),
    new Phaser.Math.Vector2(x - s * 0.3, y + s * 0.03),
  ], true);
}

export function drawCardsIcon(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, color: number): void {
  g.fillStyle(color, 0.6);
  g.fillRoundedRect(x - s * 0.35, y - s * 0.35, s * 0.45, s * 0.65, 4);
  g.fillStyle(color, 1);
  g.fillRoundedRect(x - s * 0.05, y - s * 0.3, s * 0.45, s * 0.65, 4);
}

/** キャラクターのシルエット（原点=足元中央）。 */
export function drawHero(g: Phaser.GameObjects.Graphics, id: Role, color: number, scale = 1): void {
  const s = scale;
  g.clear();
  const dark = Phaser.Display.Color.ValueToColor(color).darken(45).color;
  // 影
  g.fillStyle(0x000000, 0.35);
  g.fillEllipse(0, 0, 130 * s, 22 * s);
  // マント/胴
  g.fillStyle(dark, 1);
  g.fillPoints([
    new Phaser.Math.Vector2(-38 * s, -18 * s), new Phaser.Math.Vector2(38 * s, -18 * s),
    new Phaser.Math.Vector2(26 * s, -120 * s), new Phaser.Math.Vector2(-26 * s, -120 * s),
  ], true);
  g.fillStyle(color, 1);
  g.fillRoundedRect(-22 * s, -118 * s, 44 * s, 70 * s, 10 * s);
  // 頭
  g.fillStyle(0xe8c9a0, 1);
  g.fillCircle(0, -140 * s, 20 * s);
  if (id === 'knight') {
    g.fillStyle(0x9aa3ad, 1); // 兜
    g.fillRoundedRect(-22 * s, -164 * s, 44 * s, 26 * s, 8 * s);
    g.fillStyle(color, 1);
    g.fillTriangle(-6 * s, -164 * s, 6 * s, -164 * s, 0, -186 * s);
    g.lineStyle(8 * s, 0xc7ced6, 1); // 大剣
    g.lineBetween(34 * s, -50 * s, 62 * s, -150 * s);
    g.lineStyle(10 * s, 0x7a5a3a, 1);
    g.lineBetween(30 * s, -50 * s, 40 * s, -66 * s);
    g.fillStyle(0x6b7280, 1); // タワーシールド
    g.fillRoundedRect(-62 * s, -118 * s, 34 * s, 70 * s, 8 * s);
    g.lineStyle(3 * s, color, 1);
    g.strokeRoundedRect(-62 * s, -118 * s, 34 * s, 70 * s, 8 * s);
  } else {
    g.fillStyle(dark, 1); // とんがり帽子
    g.fillTriangle(-26 * s, -152 * s, 26 * s, -152 * s, 6 * s, -205 * s);
    g.fillRect(-32 * s, -156 * s, 64 * s, 8 * s);
    g.lineStyle(6 * s, 0x7a5a3a, 1); // 杖
    g.lineBetween(40 * s, -20 * s, 48 * s, -160 * s);
    for (const [c, dx, dy] of [[0xff7043, 48, -172], [0x6fd3ff, 30, -186], [0xffe066, 66, -186]] as const) {
      g.fillStyle(c, 1);
      g.fillCircle(dx * s, dy * s, 8 * s);
    }
  }
  // 目
  g.fillStyle(0x111111, 1);
  g.fillCircle(-7 * s, -140 * s, 2.5 * s);
  g.fillCircle(7 * s, -140 * s, 2.5 * s);
}

export function drawSlime(g: Phaser.GameObjects.Graphics, color: number): void {
  g.clear();
  g.fillStyle(0x000000, 0.35);
  g.fillEllipse(0, 0, 170, 24);
  g.fillStyle(color, 1);
  g.fillEllipse(0, -55, 150, 110);
  g.fillStyle(0xffffff, 0.3);
  g.fillEllipse(-32, -80, 38, 22);
  g.fillStyle(0x111111, 1);
  g.fillCircle(-24, -55, 8);
  g.fillCircle(24, -55, 8);
  g.lineStyle(4, 0x111111, 1);
  g.beginPath();
  g.arc(0, -36, 16, 0.2, Math.PI - 0.2);
  g.strokePath();
}
