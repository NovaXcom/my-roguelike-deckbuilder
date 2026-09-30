import Phaser from 'phaser';
import { audio } from '../audio';
import {
  FACILITY_NAME, MAX_LEVEL, PASSIVES, startGearQuality, startingPotions, upgrade, upgradeCost, type Facility,
} from '../core/meta';
import { game, saveMeta } from '../game';
import { COLORS, drawBackground, txt } from '../ui/art';
import { hex, makeButton, panel } from '../ui/widgets';
import { H, W } from './TitleScene';

const PANEL_W = 380;
const PANEL_H = 430;
const COLS: Record<Facility, number> = { smith: 0xe08a3c, alchemy: 0x6fcf97, training: 0x8a7be0 };
const RARITY_JP = { common: 'Common', rare: 'Rare', legendary: 'Legendary' } as const;

/** 拠点（街）: 魔導石で施設をレベルアップし、次回以降の挑戦の初期能力を底上げする。 */
export class TownScene extends Phaser.Scene {
  constructor() {
    super('Town');
  }

  create(): void {
    drawBackground(this, W, H);
    const meta = game.meta;
    txt(this, W / 2, 44, '拠点 ─ 復興の街', 38, '#f6e3b4', { fontStyle: 'bold', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5);
    txt(this, W / 2, 92, `魔導石  ◆ ${meta.stones}`, 26, '#7fe9ff', { fontStyle: 'bold' }).setOrigin(0.5);
    txt(this, W / 2, 124, `挑戦 ${meta.runs} 回 ／ 踏破 ${meta.clears} 回`, 14, '#7b8798').setOrigin(0.5);

    (['smith', 'alchemy', 'training'] as Facility[]).forEach((f, i) => this.buildPanel(f, 60 + i * (PANEL_W + 30)));

    makeButton(this, W / 2 + 110, 668, 300, 60, '冒険に出る', () => { audio.play('click'); this.scene.start('Party'); }, { size: 28 });
    makeButton(this, 130, 668, 200, 46, '← タイトルへ', () => this.scene.start('Title'), { size: 16, color: 0x7b8798 });
    txt(this, W / 2 - 190, 668, '魔導石は挑戦中に集め、終了時に持ち帰れます', 13, '#7b8798').setOrigin(0.5);
  }

  private buildPanel(f: Facility, x: number): void {
    const meta = game.meta;
    const col = COLS[f];
    const lv = meta[f];
    const top = 160;
    panel(this, x, top, PANEL_W, PANEL_H, col);
    txt(this, x + PANEL_W / 2, top + 26, FACILITY_NAME[f], 28, hex(col), { fontStyle: 'bold' }).setOrigin(0.5);
    // レベルピップ
    const g = this.add.graphics();
    for (let k = 0; k < MAX_LEVEL; k++) {
      g.fillStyle(k < lv ? col : 0x3b3f47, 1).fillRoundedRect(x + 70 + k * 46, top + 58, 38, 12, 6);
    }
    txt(this, x + PANEL_W / 2, top + 84, `Lv ${lv} / ${MAX_LEVEL}`, 16, '#e8dfd3', { fontStyle: 'bold' }).setOrigin(0.5);

    const body: string[] = [];
    if (f === 'smith') {
      const cur = startGearQuality(lv), nxt = startGearQuality(lv + 1);
      body.push('初期装備の品質が向上する', '', `現在: ${RARITY_JP[cur.rarity]} 品質 ×${cur.scale.toFixed(1)}`);
      if (lv < MAX_LEVEL) body.push(`次:   ${RARITY_JP[nxt.rarity]} 品質 ×${nxt.scale.toFixed(1)}`);
      body.push('', 'Lv3でRare武器(固有スキル付き)、', 'Lv5でLegendary武器から開始');
    } else if (f === 'alchemy') {
      body.push('回復ポーションの所持数が増える', '', `現在: 開始時ポーション ${startingPotions(lv)} 個`);
      if (lv < MAX_LEVEL) body.push(`次:   ${startingPotions(lv + 1)} 個`);
      body.push('', 'ポーションは全員のHPを35%回復。', '戦闘中は行動を消費せず使える');
    } else {
      body.push('パッシブスキルを解放する');
    }
    const t = txt(this, x + 24, top + 116, body.join('\n'), 15, '#d8d0c4', { lineSpacing: 5 });
    if (f === 'training') {
      t.setPosition(x + 24, top + 112);
      PASSIVES.forEach((p, k) => {
        const on = lv >= p.level;
        const y = top + 146 + k * 40;
        this.add.graphics().fillStyle(on ? col : 0x3b3f47, 1).fillCircle(x + 34, y + 12, 9);
        txt(this, x + 54, y - 2, `Lv${p.level} ${p.name}`, 15, on ? '#ffffff' : '#7b8798', { fontStyle: 'bold' });
        txt(this, x + 54, y + 16, p.text, 11, on ? '#b8c2d0' : '#5b6370');
      });
    }

    const cost = upgradeCost(meta, f);
    const b = makeButton(
      this, x + PANEL_W / 2, top + PANEL_H - 38, 300, 52,
      cost === null ? 'MAX' : `強化する  ◆ ${cost}`,
      () => {
        if (upgrade(meta, f)) {
          audio.play('heal');
          saveMeta();
          this.scene.restart();
        }
      },
      { size: 20, color: col, enabled: cost !== null && meta.stones >= cost },
    );
    if (cost !== null && meta.stones < cost) b.setLabel(`魔導石が不足  ◆ ${cost}`);
    void COLORS;
  }
}
