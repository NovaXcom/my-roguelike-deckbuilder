import Phaser from 'phaser';
import { RARITY_COLOR, RARITY_LABEL, SLOT_LABEL, statLines, type EquipItem } from '../core/equipment';
import { SKILLS } from '../core/data';
import { audio } from '../audio';
import { COLORS, txt } from './art';

export const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');

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
  const c = scene.add.container(x, y, [bg, text]).setSize(w, h).setInteractive({ useHandCursor: true });
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
  c.on('pointerdown', () => { if (enabled) onClick(); });
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
  c.add(txt(scene, 0, top + 32, item.name, 20, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5, 0));
  c.add(txt(scene, 0, top + 60, `${RARITY_LABEL[item.rarity]} ・ ${SLOT_LABEL[item.slot]}`, 13, hex(col), { fontStyle: 'bold' }).setOrigin(0.5, 0));
  const lines = statLines(item.stats);
  c.add(txt(scene, 0, top + 88, lines.join('\n'), 15, '#e8dfd3', { align: 'center', lineSpacing: 4 }).setOrigin(0.5, 0));
  if (item.skill) {
    const sk = SKILLS[item.skill];
    const sy = top + 88 + lines.length * 24 + 10;
    c.add(txt(scene, 0, sy, `固有スキル\n${sk.name}`, 14, '#ffd166', { fontStyle: 'bold', align: 'center' }).setOrigin(0.5, 0));
    c.add(txt(scene, 0, sy + 44, sk.text, 12, '#b8c2d0', { align: 'center', wordWrap: { width: w - 24, useAdvancedWrap: true } }).setOrigin(0.5, 0));
  }
  return c;
}
