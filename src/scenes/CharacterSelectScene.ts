import Phaser from 'phaser';
import { audio } from '../audio';
import { CHARACTERS, CHARACTER_ORDER } from '../core/characters';
import { getCard } from '../core/cards';
import { drawBackground, drawHero, txt } from '../ui/art';
import { H, W } from './TitleScene';

export class CharacterSelectScene extends Phaser.Scene {
  constructor() {
    super('CharacterSelect');
  }

  create(): void {
    drawBackground(this, W, H);
    txt(this, W / 2, 56, 'キャラクターを選択', 40, '#f6e3b4', { fontStyle: 'bold', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5);

    const cw = 340;
    CHARACTER_ORDER.forEach((id, i) => {
      const ch = CHARACTERS[id];
      const cx = W / 2 + (i - 1) * (cw + 30);
      const cy = 400;
      const panel = this.add.container(cx, cy);
      const bg = this.add.graphics();
      const paint = (hover: boolean) => {
        bg.clear();
        bg.fillStyle(0x2d3748, hover ? 1 : 0.85);
        bg.fillRoundedRect(-cw / 2, -290, cw, 580, 16);
        bg.lineStyle(hover ? 5 : 3, ch.color, 1);
        bg.strokeRoundedRect(-cw / 2, -290, cw, 580, 16);
      };
      paint(false);

      const hero = this.add.graphics();
      drawHero(hero, id, ch.color, 1.0);
      hero.setPosition(0, 10);

      const deckCounts = new Map<string, number>();
      ch.starterDeck.forEach((c) => deckCounts.set(c, (deckCounts.get(c) ?? 0) + 1));
      const deckLines = [...deckCounts].map(([c, n]) => `${getCard(c).name} ×${n}`).join('\n');

      panel.add([
        bg,
        hero,
        txt(this, 0, -262, ch.name, 28, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5),
        txt(this, 0, -228, ch.title, 15, '#' + ch.color.toString(16).padStart(6, '0')).setOrigin(0.5),
        txt(this, 0, 40, `HP ${ch.maxHp}`, 22, '#ff8a8a', { fontStyle: 'bold' }).setOrigin(0.5),
        txt(this, 0, 80, ch.description, 15, '#d8d0c4', { align: 'center', wordWrap: { width: cw - 40, useAdvancedWrap: true } }).setOrigin(0.5, 0),
        txt(this, 0, 150, `固有: ${ch.passive}`, 14, '#f6c453', { align: 'center', wordWrap: { width: cw - 40, useAdvancedWrap: true } }).setOrigin(0.5, 0),
        txt(this, 0, 215, deckLines, 13, '#9fb0c8', { align: 'center', lineSpacing: 2 }).setOrigin(0.5, 0),
      ]);
      panel.setSize(cw, 580).setInteractive({ useHandCursor: true });
      panel.on('pointerover', () => {
        paint(true);
        this.tweens.add({ targets: panel, y: cy - 10, scale: 1.02, duration: 120 });
      });
      panel.on('pointerout', () => {
        paint(false);
        this.tweens.add({ targets: panel, y: cy, scale: 1, duration: 120 });
      });
      panel.on('pointerdown', () => {
        audio.play('click');
        this.scene.start('Battle', { characterId: id, seed: Date.now() >>> 0 });
      });
    });

    const back = txt(this, 60, 40, '← タイトルへ', 18, '#9fb0c8').setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.scene.start('Title'));
  }
}
