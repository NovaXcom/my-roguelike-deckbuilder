import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { UPGRADES, UpgradeId, Synergy, activeSynergies } from '../systems/UpgradeSystem';
import { audio } from '../audio/AudioSystem';

interface UpgradeData {
  choices: UpgradeId[];
  owned: UpgradeId[];
  /** Per choice: the synergy that picking it would complete. */
  synergies: Array<Synergy | null>;
}

/** Overlay shown while GameScene is paused. Emits 'upgrade-picked' on the game event bus. */
export class UpgradeScene extends Phaser.Scene {
  private choices: UpgradeId[] = [];
  private owned: UpgradeId[] = [];
  private synergies: Array<Synergy | null> = [];
  private selected = 1;
  private cards: Phaser.GameObjects.Rectangle[] = [];
  private picked = false;

  constructor() {
    super('Upgrade');
  }

  init(data: UpgradeData): void {
    this.choices = data.choices;
    this.owned = data.owned;
    this.synergies = data.synergies ?? [];
    this.selected = Math.min(1, this.choices.length - 1);
    this.picked = false;
    this.cards = [];
  }

  create(): void {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75);
    this.add
      .text(GAME_WIDTH / 2, 70, 'CHOOSE AN UPGRADE', { fontFamily: 'monospace', fontSize: '36px', fontStyle: 'bold', color: '#ffdd44', stroke: '#000', strokeThickness: 6 })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 40, '← → / A D to select   Enter / Space / click to confirm   (or press 1-3)   +30 HP', { fontFamily: 'monospace', fontSize: '14px', color: '#aab' })
      .setOrigin(0.5);

    this.choices.forEach((id, i) => {
      const x = GAME_WIDTH / 2 + (i - (this.choices.length - 1) / 2) * 280;
      const def = UPGRADES[id];
      const lv = this.owned.filter((o) => o === id).length;
      const card = this.add.rectangle(x, 270, 240, 220, 0x1d1d33).setStrokeStyle(3, 0x555577).setInteractive({ useHandCursor: true });
      this.cards.push(card);
      this.add.text(x, 210, `${i + 1}`, { fontFamily: 'monospace', fontSize: '18px', color: '#778' }).setOrigin(0.5);
      this.add.text(x, 250, def.name, { fontFamily: 'monospace', fontSize: '30px', fontStyle: 'bold', color: '#fff' }).setOrigin(0.5);
      this.add.text(x, 292, def.desc, { fontFamily: 'monospace', fontSize: '16px', color: '#bbd', align: 'center', wordWrap: { width: 210 } }).setOrigin(0.5);
      const syn = this.synergies[i];
      if (syn) {
        this.add.text(x, 328, `★ ${syn.name}\n${syn.desc}`, { fontFamily: 'monospace', fontSize: '13px', fontStyle: 'bold', color: '#ffdd44', align: 'center', wordWrap: { width: 215 } }).setOrigin(0.5, 0);
      }
      this.add.text(x, 366, lv > 0 ? `owned x${lv}` : 'NEW', { fontFamily: 'monospace', fontSize: '14px', color: lv > 0 ? '#88ddff' : '#88ff88' }).setOrigin(0.5);
      card.on('pointerover', () => this.select(i));
      card.on('pointerdown', () => {
        this.select(i);
        this.confirm();
      });
    });
    const active = activeSynergies(this.owned);
    if (active.length) {
      this.add.text(GAME_WIDTH / 2, 410, `ACTIVE SYNERGY: ${active.map((a) => a.name).join(' / ')}`, { fontFamily: 'monospace', fontSize: '15px', color: '#ffdd44' }).setOrigin(0.5);
    }
    this.refresh();

    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    const move = (d: number) => this.select(Phaser.Math.Clamp(this.selected + d, 0, this.choices.length - 1));
    kb.on('keydown-LEFT', () => move(-1));
    kb.on('keydown-A', () => move(-1));
    kb.on('keydown-RIGHT', () => move(1));
    kb.on('keydown-D', () => move(1));
    kb.on('keydown-ENTER', () => this.confirm());
    kb.on('keydown-SPACE', () => this.confirm());
    [K.ONE, K.TWO, K.THREE].forEach((code, i) => {
      kb.addKey(code).on('down', () => {
        if (i < this.choices.length) {
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
      c.setStrokeStyle(on ? 5 : 3, on ? 0xffdd44 : 0x555577).setFillStyle(on ? 0x2c2c4d : 0x1d1d33);
      c.setScale(on ? 1.05 : 1);
    });
  }

  private confirm(): void {
    if (this.picked) return;
    this.picked = true;
    audio.play('milestone');
    this.game.events.emit('upgrade-picked', this.choices[this.selected]);
    this.scene.stop();
  }
}
