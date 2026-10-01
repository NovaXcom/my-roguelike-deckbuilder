import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { audio } from '../audio/AudioSystem';
import { META_DEFS, META_IDS, MetaId, buyMeta, canBuyMeta, metaCost, metaLevel } from '../systems/Meta';
import { SaveData, loadSave, writeSave } from '../systems/SaveSystem';

/** Spend shards on permanent upgrades. */
export class MetaScene extends Phaser.Scene {
  private save!: SaveData;
  private selected = 0;
  private rows: Phaser.GameObjects.Text[] = [];
  private shardText!: Phaser.GameObjects.Text;
  private g!: Phaser.GameObjects.Graphics;
  private note!: Phaser.GameObjects.Text;

  constructor() {
    super('Meta');
  }

  create(): void {
    this.save = loadSave();
    this.selected = 0;
    this.cameras.main.setBackgroundColor(0x0b0b14);
    const T = { fontFamily: 'monospace', color: '#fff', stroke: '#000', strokeThickness: 4 };
    this.add.text(GAME_WIDTH / 2, 50, 'PERMANENT UPGRADES', { ...T, fontSize: '38px', fontStyle: 'bold', color: '#b06cff', strokeThickness: 6 }).setOrigin(0.5);
    this.shardText = this.add.text(GAME_WIDTH / 2, 98, '', { ...T, fontSize: '22px', color: '#d8c0ff' }).setOrigin(0.5);
    this.g = this.add.graphics();
    this.rows = META_IDS.map((_id, i) => this.add.text(150, 150 + i * 52, '', { ...T, fontSize: '20px' }).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.selected = i;
      this.buy();
    }).on('pointerover', () => {
      this.selected = i;
      this.refresh();
    }));
    this.note = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 56, '', { ...T, fontSize: '16px', color: '#ffcc66' }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 26, '↑ ↓ select    Enter / click buy    Esc back', { ...T, fontSize: '14px', color: '#889' }).setOrigin(0.5);

    const kb = this.input.keyboard!;
    const move = (d: number) => {
      this.selected = Phaser.Math.Clamp(this.selected + d, 0, META_IDS.length - 1);
      this.refresh();
    };
    kb.on('keydown-UP', () => move(-1));
    kb.on('keydown-W', () => move(-1));
    kb.on('keydown-DOWN', () => move(1));
    kb.on('keydown-S', () => move(1));
    kb.on('keydown-ENTER', () => this.buy());
    kb.on('keydown-SPACE', () => this.buy());
    kb.on('keydown-ESC', () => this.scene.start('Title'));
    this.refresh();
  }

  private buy(): void {
    const id = META_IDS[this.selected];
    const res = buyMeta(this.save.shards, this.save.meta, id);
    if (!res) {
      this.note.setText(metaLevel(this.save.meta, id) >= META_DEFS[id].max ? 'Already at max level.' : 'Not enough shards.');
      return;
    }
    this.save.shards = res.shards;
    this.save.meta = res.levels;
    writeSave(this.save);
    audio.play('levelup');
    this.note.setText(`${META_DEFS[id].name} upgraded!`);
    this.refresh();
  }

  private refresh(): void {
    this.shardText.setText(`SHARDS  ${this.save.shards}`);
    this.g.clear();
    META_IDS.forEach((id: MetaId, i) => {
      const def = META_DEFS[id];
      const lv = metaLevel(this.save.meta, id);
      const maxed = lv >= def.max;
      const y = 150 + i * 52;
      const on = i === this.selected;
      this.g.fillStyle(on ? 0x2c2c4d : 0x1a1a2c, 1).fillRect(120, y - 8, 720, 46);
      if (on) this.g.lineStyle(3, 0xffdd44).strokeRect(120, y - 8, 720, 46);
      for (let p = 0; p < def.max; p++) this.g.fillStyle(p < lv ? 0xb06cff : 0x3a3454).fillRect(290 + p * 20, y + 5, 16, 16);
      const afford = canBuyMeta(this.save.shards, this.save.meta, id);
      const col = maxed ? '#9a96c0' : afford ? '#ffffff' : '#a09ab8';
      this.rows[i].setText(def.name).setFontSize(on ? 20 : 19).setColor(col);
      if (!this.descTexts[i]) this.descTexts[i] = this.add.text(410, y + 3, '', { fontFamily: 'monospace', fontSize: '15px', stroke: '#000', strokeThickness: 3 });
      this.descTexts[i].setText(def.desc).setColor(maxed ? '#7f7aa0' : '#c8c4e8');
      // cost (right side)
      if (!this.costTexts[i]) this.costTexts[i] = this.add.text(830, y + 2, '', { fontFamily: 'monospace', fontSize: '18px', fontStyle: 'bold', stroke: '#000', strokeThickness: 4 }).setOrigin(1, 0);
      this.costTexts[i].setText(maxed ? 'MAX' : `${metaCost(this.save.meta, id)}`).setColor(maxed ? '#9a96c0' : afford ? '#d8c0ff' : '#775a99');
    });
  }

  private costTexts: Phaser.GameObjects.Text[] = [];
  private descTexts: Phaser.GameObjects.Text[] = [];
}
