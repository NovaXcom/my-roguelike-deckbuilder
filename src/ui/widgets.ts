import Phaser from 'phaser';
import { EFFECT_TEXT, RARITY_COLOR, RARITY_LABEL, SLOT_LABEL, statLines, type EquipItem } from '../core/equipment';
import { SKILLS } from '../core/data';
import { audio } from '../audio';
import { equipIconKey } from './assetMap';
import { hasImg } from './assets';
import { COLORS, txt } from './art';
import { HIT_PAD_COMPACT, compact } from './device';

export const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');

/**
 * タップ判定: 押した後に同じ対象の上で離したときだけ実行する。
 * pointerdown で即実行すると、画面遷移直後の指離し(pointerup)が次の画面のボタンに当たって誤操作になる。
 */
export function onTap(obj: Phaser.GameObjects.GameObject, cb: (p: Phaser.Input.Pointer) => void): void {
  let armed = false;
  obj.on('pointerdown', () => { armed = true; });
  obj.on('pointerout', () => { armed = false; });
  obj.on('pointerup', (p: Phaser.Input.Pointer) => {
    if (!armed) return;
    armed = false;
    cb(p);
  });
}

/** タップしやすいようコンパクト時は見た目より広い当たり判定にする */
export function padHitArea(c: Phaser.GameObjects.Container, w: number, h: number): void {
  const pad = compact() ? HIT_PAD_COMPACT : 0;
  c.setSize(w, h);
  c.setInteractive(new Phaser.Geom.Rectangle(-pad, -pad, w + pad * 2, h + pad * 2), Phaser.Geom.Rectangle.Contains);
  if (c.input) c.input.cursor = 'pointer';
}

export interface Button {
  c: Phaser.GameObjects.Container;
  setEnabled(on: boolean): void;
  setLabel(s: string): void;
}

/** 汎用ボタン。enabled=false でクリック無効・暗表示。 */
export function makeButton(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number, label: string, onClick: () => void,
  opts: { size?: number; color?: number; enabled?: boolean } = {},
): Button {
  const color = opts.color ?? COLORS.energy;
  const bg = scene.add.graphics();
  const text = txt(scene, 0, 0, label, opts.size ?? 22, '#ffffff', { fontStyle: 'bold', align: 'center' }).setOrigin(0.5);
  const c = scene.add.container(x, y, [bg, text]);
  padHitArea(c, w, h);
  let enabled = opts.enabled ?? true;
  const paint = (hover: boolean) => {
    bg.clear();
    bg.fillStyle(enabled ? (hover ? 0x3f5578 : 0x2d3748) : 0x24272c, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    bg.lineStyle(3, enabled ? color : 0x555b63, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
    c.setAlpha(enabled ? 1 : 0.55);
  };
  paint(false);
  c.on('pointerover', () => { paint(true); if (enabled) audio.play('hover'); });
  c.on('pointerout', () => paint(false));
  onTap(c, () => { if (enabled) onClick(); });
  return {
    c,
    setEnabled: (on) => { enabled = on; paint(false); },
    setLabel: (s) => text.setText(s),
  };
}

export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, border: number, fill = 0x2d3748): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(fill, 0.92).fillRoundedRect(x, y, w, h, 14);
  g.lineStyle(3, border, 1).strokeRoundedRect(x, y, w, h, 14);
  return g;
}

/** 装備カード（レア度色の枠・数値・固有スキル）。中心(x,y)。null なら「なし」表示。 */
export function itemCard(scene: Phaser.Scene, x: number, y: number, w: number, h: number, item: EquipItem | null, heading?: string): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const col = item ? RARITY_COLOR[item.rarity] : 0x555b63;
  if (item?.rarity === 'legendary') {
    g.fillStyle(col, 0.18).fillRoundedRect(-w / 2 - 6, -h / 2 - 6, w + 12, h + 12, 18);
  }
  g.fillStyle(0x1f2126, 0.95).fillRoundedRect(-w / 2, -h / 2, w, h, 12);
  g.lineStyle(item?.rarity === 'legendary' ? 5 : 3, col, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
  c.add(g);
  const top = -h / 2;
  if (heading) c.add(txt(scene, 0, top + 12, heading, 12, '#7b8798').setOrigin(0.5, 0));
  if (!item) {
    c.add(txt(scene, 0, 0, 'なし', 18, '#7b8798').setOrigin(0.5));
    return c;
  }
  // 装備アイコン（レア度色の丸台座の上）。画像が無ければ従来の文字のみ
  const iconKey = equipIconKey(item);
  const off = hasImg(scene, iconKey) ? 70 : 0;
  if (off) {
    const disc = scene.add.graphics();
    disc.fillStyle(col, 0.22).fillCircle(0, top + 62, 38).lineStyle(2, col, 0.9).strokeCircle(0, top + 62, 38);
    c.add([disc, scene.add.image(0, top + 62, iconKey).setDisplaySize(64, 64)]);
  }
  c.add(txt(scene, 0, top + 32 + off, item.name, 20, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5, 0));
  c.add(txt(scene, 0, top + 60 + off, `${RARITY_LABEL[item.rarity]} ・ ${SLOT_LABEL[item.slot]}`, 13, hex(col), { fontStyle: 'bold' }).setOrigin(0.5, 0));
  const lines = statLines(item.stats);
  c.add(txt(scene, 0, top + 88 + off, lines.join('\n'), 15, '#e8dfd3', { align: 'center', lineSpacing: 4 }).setOrigin(0.5, 0));
  if (item.skill) {
    const sk = SKILLS[item.skill];
    const sy = top + 88 + off + lines.length * 24 + 10;
    c.add(txt(scene, 0, sy, `固有スキル\n${sk.name}`, 14, '#ffd166', { fontStyle: 'bold', align: 'center' }).setOrigin(0.5, 0));
    c.add(txt(scene, 0, sy + 44, sk.text, 12, '#b8c2d0', { align: 'center', wordWrap: { width: w - 24, useAdvancedWrap: true } }).setOrigin(0.5, 0));
  }
  if (item.effect) {
    c.add(txt(scene, 0, top + h - 52, `◆${EFFECT_TEXT[item.effect]}`, 12, '#9ff0c0', { fontStyle: 'bold', align: 'center', wordWrap: { width: w - 20, useAdvancedWrap: true } }).setOrigin(0.5, 0));
  }
  return c;
}

/** 画面右上のシステムボタン（ミュート/全画面）。スマホではキー操作(M)ができないため常設する。 */
export function addSystemButtons(scene: Phaser.Scene, w = 1280): void {
  const mk = (x: number, draw: (g: Phaser.GameObjects.Graphics) => void, tap: () => void) => {
    const g = scene.add.graphics();
    g.fillStyle(0x1f2126, 0.85).fillRoundedRect(-24, -24, 48, 48, 10).lineStyle(2, 0x4a5262, 1).strokeRoundedRect(-24, -24, 48, 48, 10);
    draw(g);
    const c = scene.add.container(x, 56, [g]).setDepth(9000);
    padHitArea(c, 48, 48);
    onTap(c, tap);
    return { c, g };
  };
  const drawMute = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(0xe8dfd3, 1).fillRect(-14, -6, 8, 12).fillTriangle(-6, -6, 6, -14, 6, 14).fillTriangle(-6, 6, 6, 14, -6, -6);
    if (audio.muted) g.lineStyle(4, 0xff5c5c, 1).lineBetween(-16, -16, 16, 16);
    else g.lineStyle(3, 0xe8dfd3, 1).beginPath().arc(6, 0, 9, -0.9, 0.9).strokePath().beginPath().arc(6, 0, 15, -0.8, 0.8).strokePath();
  };
  const mute = mk(w - 90, drawMute, () => {
    audio.toggleMute();
    mute.g.clear();
    mute.g.fillStyle(0x1f2126, 0.85).fillRoundedRect(-24, -24, 48, 48, 10).lineStyle(2, 0x4a5262, 1).strokeRoundedRect(-24, -24, 48, 48, 10);
    drawMute(mute.g);
  });
  if (scene.scale.fullscreen.available) {
    mk(w - 34, (g) => {
      g.lineStyle(4, 0xe8dfd3, 1);
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        g.lineBetween(sx * 15, sy * 15, sx * 15, sy * 6).lineBetween(sx * 15, sy * 15, sx * 6, sy * 15);
      }
    }, () => {
      if (scene.scale.isFullscreen) { scene.scale.stopFullscreen(); return; }
      scene.scale.startFullscreen();
      // 対応端末(Android Chrome等)では全画面時に横向きへロック
      const o = (screen as Screen & { orientation?: { lock?: (t: string) => Promise<void> } }).orientation;
      void o?.lock?.('landscape')?.catch(() => undefined);
    });
  }
}
