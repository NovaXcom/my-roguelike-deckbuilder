import Phaser from 'phaser';
import { getCard } from '../core/cards';
import type { CardDef, CardInstance } from '../core/types';
import { COLORS, drawCardsIcon, drawShield, drawSword, txt } from './art';

export const CARD_W = 150;
export const CARD_H = 210;

const TYPE_COLOR: Record<CardDef['type'], number> = {
  attack: 0xb8433f,
  skill: 0x3f78b8,
  power: 0x8a55b8,
};
const TYPE_LABEL: Record<CardDef['type'], string> = { attack: 'アタック', skill: 'スキル', power: 'パワー' };

/** Canvas(Graphics)のみで描画するカード。ホーム位置(hx,hy,hrot)を持ち、手札レイアウトから配置される。 */
export class CardView extends Phaser.GameObjects.Container {
  readonly inst: CardInstance;
  readonly def: CardDef;
  hx = 0;
  hy = 0;
  hrot = 0;
  hscale = 1;
  hovered = false;
  private costOrb: Phaser.GameObjects.Graphics;
  private costText: Phaser.GameObjects.Text;
  private glow: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, inst: CardInstance) {
    super(scene, 0, 0);
    this.inst = inst;
    this.def = getCard(inst.defId);
    const d = this.def;
    const tc = TYPE_COLOR[d.type];

    this.glow = scene.add.graphics();
    this.glow.lineStyle(5, COLORS.energy, 0.9);
    this.glow.strokeRoundedRect(-CARD_W / 2 - 3, -CARD_H / 2 - 3, CARD_W + 6, CARD_H + 6, 14);
    this.glow.setVisible(false);

    const g = scene.add.graphics();
    // 影・本体
    g.fillStyle(0x000000, 0.4);
    g.fillRoundedRect(-CARD_W / 2 + 3, -CARD_H / 2 + 5, CARD_W, CARD_H, 12);
    g.fillStyle(0x2b2621, 1);
    g.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 12);
    g.lineStyle(3, tc, 1);
    g.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 12);
    // 名前帯
    g.fillStyle(tc, 1);
    g.fillRoundedRect(-CARD_W / 2 + 6, -CARD_H / 2 + 6, CARD_W - 12, 28, 8);
    // アートウィンドウ
    g.fillStyle(0x1a1714, 1);
    g.fillRoundedRect(-CARD_W / 2 + 10, -CARD_H / 2 + 40, CARD_W - 20, 66, 6);
    g.fillStyle(tc, 0.18);
    g.fillRoundedRect(-CARD_W / 2 + 10, -CARD_H / 2 + 40, CARD_W - 20, 66, 6);
    const iy = -CARD_H / 2 + 73;
    if (d.damage) drawSword(g, 0, iy, 52, 0xe9d8c4);
    else if (d.block) drawShield(g, 0, iy, 52, 0x9cc7ff);
    else drawCardsIcon(g, 0, iy, 52, 0xe9d8c4);
    // 種別
    g.fillStyle(0x3b3530, 1);
    g.fillRoundedRect(-CARD_W / 2 + 34, -CARD_H / 2 + 110, CARD_W - 68, 16, 8);

    this.costOrb = scene.add.graphics();
    const name = txt(scene, 8, -CARD_H / 2 + 20, d.name, 14, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5);
    const type = txt(scene, 0, -CARD_H / 2 + 118, TYPE_LABEL[d.type], 10, '#cfc5b8').setOrigin(0.5);
    const body = txt(scene, 0, -CARD_H / 2 + 158, d.text, 13, '#f4ede4', {
      align: 'center',
      wordWrap: { width: CARD_W - 26, useAdvancedWrap: true },
    }).setOrigin(0.5);
    this.costText = txt(scene, -CARD_W / 2 + 4, -CARD_H / 2 + 4, String(d.cost), 20, '#06222a', { fontStyle: 'bold' }).setOrigin(0.5);

    this.add([this.glow, g, this.costOrb, name, type, body, this.costText]);
    this.setSize(CARD_W, CARD_H);
    this.setPlayable(true);
    scene.add.existing(this);
  }

  setPlayable(ok: boolean): void {
    const g = this.costOrb;
    g.clear();
    g.fillStyle(0x000000, 0.5);
    g.fillCircle(-CARD_W / 2 + 6, -CARD_H / 2 + 7, 17);
    g.fillStyle(ok ? COLORS.energy : 0x6b7580, 1);
    g.fillCircle(-CARD_W / 2 + 4, -CARD_H / 2 + 4, 16);
    g.lineStyle(2, 0xffffff, ok ? 0.8 : 0.3);
    g.strokeCircle(-CARD_W / 2 + 4, -CARD_H / 2 + 4, 16);
    this.costText.setColor(ok ? '#06222a' : '#2a2f35');
    this.setAlpha(ok ? 1 : 0.78);
  }

  setGlow(on: boolean): void {
    this.glow.setVisible(on);
  }
}
