import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { audio } from '../audio/AudioSystem';

export interface ChoiceOption {
  id: string;
  name: string;
  desc: string;
  /** Small line under the description (e.g. "NEW", "owned x2", "★ SYNERGY"). */
  tag?: string;
  tagColor?: string;
  cost?: number;
  disabled?: boolean;
  color?: number;
}

export interface ChoiceData {
  title: string;
  subtitle?: string;
  options: ChoiceOption[];
  /** Game event emitted with the chosen option id. */
  event: string;
  /** Pressing Esc picks this option id (e.g. "leave"). */
  escapeId?: string;
  titleColor?: string;
}

/** Generic card-picker overlay: level-up perks, relics, doors, shop, campfire. */
export class ChoiceScene extends Phaser.Scene {
  private data0!: ChoiceData;
  private selected = 0;
  private cards: Phaser.GameObjects.Rectangle[] = [];
  private picked = false;

  constructor() {
    super('Choice');
  }

  init(data: ChoiceData): void {
    this.data0 = data;
    this.selected = Math.max(0, data.options.findIndex((o) => !o.disabled));
    this.cards = [];
    this.picked = false;
  }

  create(): void {
    const d = this.data0;
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.86);
    this.add
      .text(GAME_WIDTH / 2, 62, d.title, { fontFamily: 'monospace', fontSize: '36px', fontStyle: 'bold', color: d.titleColor ?? '#ffdd44', stroke: '#000', strokeThickness: 6 })
      .setOrigin(0.5);
    if (d.subtitle) this.add.text(GAME_WIDTH / 2, 104, d.subtitle, { fontFamily: 'monospace', fontSize: '16px', color: '#bbc' }).setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 66, '← → / A D select    Enter / Space / click confirm    1-4 quick pick', { fontFamily: 'monospace', fontSize: '14px', color: '#889' })
      .setOrigin(0.5);

    const n = d.options.length;
    const w = n >= 4 ? 205 : 240;
    const gap = n >= 4 ? 18 : 40;
    d.options.forEach((o, i) => {
      const x = GAME_WIDTH / 2 + (i - (n - 1) / 2) * (w + gap);
      const dim = o.disabled ? 0.4 : 1;
      const card = this.add.rectangle(x, 290, w, 250, 0x1d1d33).setStrokeStyle(3, 0x555577).setInteractive({ useHandCursor: !o.disabled });
      this.cards.push(card);
      if (o.color !== undefined) this.add.rectangle(x, 190, w - 8, 6, o.color).setAlpha(dim);
      this.add.text(x, 168, `${i + 1}`, { fontFamily: 'monospace', fontSize: '15px', color: '#778' }).setOrigin(0.5);
      this.add.text(x, 225, o.name, { fontFamily: 'monospace', fontSize: n >= 4 ? '20px' : '25px', fontStyle: 'bold', color: '#fff', align: 'center', wordWrap: { width: w - 16 } }).setOrigin(0.5).setAlpha(dim);
      this.add.text(x, 290, o.desc, { fontFamily: 'monospace', fontSize: '14px', color: '#bbd', align: 'center', wordWrap: { width: w - 24 } }).setOrigin(0.5, 0.5).setAlpha(dim);
      if (o.tag) this.add.text(x, 350, o.tag, { fontFamily: 'monospace', fontSize: '13px', fontStyle: 'bold', color: o.tagColor ?? '#88ff88', align: 'center', wordWrap: { width: w - 20 } }).setOrigin(0.5).setAlpha(dim);
      if (o.cost !== undefined) this.add.text(x, 392, `${o.cost} G`, { fontFamily: 'monospace', fontSize: '20px', fontStyle: 'bold', color: o.disabled ? '#885' : '#ffd633', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
      card.on('pointerover', () => !o.disabled && this.select(i));
      card.on('pointerdown', () => {
        if (o.disabled) return;
        this.select(i);
        this.confirm();
      });
    });
    this.refresh();

    const kb = this.input.keyboard!;
    const move = (dir: number) => {
      let i = this.selected;
      for (let tries = 0; tries < n; tries++) {
        i = Phaser.Math.Clamp(i + dir, 0, n - 1);
        if (!d.options[i].disabled) {
          this.select(i);
          return;
        }
        if (i === 0 || i === n - 1) return;
      }
    };
    kb.on('keydown-LEFT', () => move(-1));
    kb.on('keydown-A', () => move(-1));
    kb.on('keydown-RIGHT', () => move(1));
    kb.on('keydown-D', () => move(1));
    kb.on('keydown-ENTER', () => this.confirm());
    kb.on('keydown-SPACE', () => this.confirm());
    kb.on('keydown-ESC', () => d.escapeId && this.finish(d.escapeId));
    ['ONE', 'TWO', 'THREE', 'FOUR'].forEach((name, i) => {
      kb.on(`keydown-${name}`, () => {
        if (i < n && !d.options[i].disabled) {
          this.select(i);
          this.confirm();
        }
      });
    });
  }

  private select(i: number): void {
    this.selected = i;
    this.refresh();
  }

  private refresh(): void {
    this.cards.forEach((c, i) => {
      const on = i === this.selected;
      c.setStrokeStyle(on ? 5 : 3, on ? 0xffdd44 : 0x555577).setFillStyle(on ? 0x2c2c4d : 0x1d1d33).setScale(on ? 1.04 : 1);
    });
  }

  private confirm(): void {
    const o = this.data0.options[this.selected];
    if (!o || o.disabled) return;
    this.finish(o.id);
  }

  private finish(id: string): void {
    if (this.picked) return;
    this.picked = true;
    audio.play('buy');
    this.game.events.emit(this.data0.event, id);
    this.scene.stop();
  }
}
