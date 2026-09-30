import Phaser from 'phaser';
import type { Role } from '../core/types';
import { fontSize } from './device';

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
    .add.text(x, y, s, { fontFamily: FONT, fontSize: `${fontSize(size)}px`, color, ...style })
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

/** 敵のシルエット（原点=足元中央）。画像アセット不要の Canvas 描画。 */
export function drawEnemy(g: Phaser.GameObjects.Graphics, id: string, color: number): void {
  if (id === 'slime') {
    drawSlime(g, color);
    return;
  }
  g.clear();
  const dark = Phaser.Display.Color.ValueToColor(color).darken(40).color;
  g.fillStyle(0x000000, 0.35);
  g.fillEllipse(0, 0, id === 'dragon' ? 260 : 170, 24);
  const eye = (x: number, y: number, r = 6, c = 0xffdd55) => {
    g.fillStyle(c, 1).fillCircle(x, y, r);
    g.fillStyle(0x111111, 1).fillCircle(x, y, r * 0.45);
  };
  if (id === 'bat') {
    g.fillStyle(dark, 1);
    g.fillTriangle(-20, -90, -120, -60, -70, -120);
    g.fillTriangle(20, -90, 120, -60, 70, -120);
    g.fillTriangle(-20, -70, -110, -30, -60, -90);
    g.fillTriangle(20, -70, 110, -30, 60, -90);
    g.fillStyle(color, 1).fillEllipse(0, -85, 64, 76);
    g.fillTriangle(-24, -115, -10, -112, -22, -140);
    g.fillTriangle(24, -115, 10, -112, 22, -140);
    eye(-11, -90, 6, 0xff5555); eye(11, -90, 6, 0xff5555);
    g.fillStyle(0xffffff, 1).fillTriangle(-7, -70, -3, -70, -5, -62).fillTriangle(3, -70, 7, -70, 5, -62);
  } else if (id === 'skeleton') {
    g.fillStyle(color, 1);
    g.fillRoundedRect(-24, -110, 48, 70, 6);
    g.fillStyle(dark, 1);
    for (let i = 0; i < 4; i++) g.fillRect(-20, -102 + i * 15, 40, 4);
    g.fillStyle(color, 1).fillRoundedRect(-20, -40, 14, 40, 4).fillRoundedRect(6, -40, 14, 40, 4);
    g.fillCircle(0, -140, 26).fillRect(-14, -120, 28, 12);
    g.fillStyle(0x111111, 1).fillCircle(-10, -142, 7).fillCircle(10, -142, 7);
    g.fillStyle(0x66ccff, 1).fillCircle(-10, -142, 2.5).fillCircle(10, -142, 2.5);
    g.lineStyle(8, 0xc7ced6, 1).lineBetween(42, -30, 66, -130); // 剣
    g.lineStyle(10, 0x7a5a3a, 1).lineBetween(36, -45, 50, -60);
  } else if (id === 'golem') {
    g.fillStyle(dark, 1).fillRoundedRect(-70, -60, 40, 60, 6).fillRoundedRect(30, -60, 40, 60, 6);
    g.fillStyle(color, 1).fillRoundedRect(-62, -170, 124, 120, 12);
    g.fillRoundedRect(-100, -150, 40, 90, 10).fillRoundedRect(60, -150, 40, 90, 10);
    g.fillRoundedRect(-30, -205, 60, 45, 8);
    g.fillStyle(dark, 1).fillRect(-40, -130, 30, 6).fillRect(10, -110, 36, 6).fillRect(-20, -80, 40, 6);
    g.fillStyle(0xff8a3c, 1).fillRect(-18, -190, 12, 8).fillRect(6, -190, 12, 8);
  } else {
    // dragon
    g.fillStyle(dark, 1);
    g.fillTriangle(-60, -120, -190, -200, -150, -60);
    g.fillTriangle(60, -120, 190, -200, 150, -60);
    g.fillStyle(color, 1).fillEllipse(0, -80, 170, 130);
    g.fillEllipse(70, -150, 60, 90);
    g.fillEllipse(96, -190, 84, 52);
    g.fillTriangle(70, -206, 84, -206, 78, -236).fillTriangle(100, -210, 112, -208, 110, -238);
    g.fillStyle(dark, 1).fillEllipse(-90, -30, 90, 30).fillTriangle(-130, -30, -180, -10, -130, -10);
    g.fillStyle(0xf3d9a8, 1).fillEllipse(0, -60, 90, 80);
    g.fillStyle(0xffdd55, 1).fillCircle(108, -196, 7);
    g.fillStyle(0x111111, 1).fillCircle(110, -196, 3);
    g.fillStyle(0xff8a3c, 1).fillTriangle(132, -180, 150, -178, 136, -170);
    g.fillStyle(dark, 1).fillRoundedRect(-40, -30, 30, 30, 6).fillRoundedRect(20, -30, 30, 30, 6);
  }
}
