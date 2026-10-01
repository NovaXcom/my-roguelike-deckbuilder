import Phaser from 'phaser';
import { audio } from '../audio';
import { CARD_SKIP_GOLD, addCard } from '../core/run';
import { game } from '../game';
import { drawBackground, txt } from '../ui/art';
import { cardPanel, makeButton, onTap, padHitArea } from '../ui/widgets';
import { H, W } from './TitleScene';

export interface CardRewardData {
  cards: string[];
  returnTo: { scene: string; data?: object };
}

/** カード報酬: 3枚から1枚をデッキに加える(スキップするとゴールド)。 */
export class CardRewardScene extends Phaser.Scene {
  private d!: CardRewardData;
  constructor() {
    super('CardReward');
  }

  init(data: CardRewardData): void {
    this.d = data;
  }

  create(): void {
    const run = game.run;
    if (!run) { this.scene.start('Town'); return; }
    drawBackground(this, W, H);
    txt(this, W / 2, 50, 'カード報酬', 40, '#f6e3b4', { fontStyle: 'bold', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5);
    txt(this, W / 2, 96, 'デッキに加えるカードを1枚選ぼう（デッキが厚くなると、狙ったカードが引きにくくなる）', 15, '#9fb0c8').setOrigin(0.5);
    const leave = () => this.scene.start(this.d.returnTo.scene, this.d.returnTo.data);
    let done = false;
    this.d.cards.forEach((id, i) => {
      const x = W / 2 + (i - 1) * 330;
      const card = cardPanel(this, x, 340, 290, 380, id);
      padHitArea(card, 290, 380);
      card.setScale(0.6).setAlpha(0);
      this.tweens.add({ targets: card, scale: 1, alpha: 1, duration: 260, delay: i * 90, ease: 'Back.out' });
      card.on('pointerover', () => this.tweens.add({ targets: card, scale: 1.04, duration: 90 }));
      card.on('pointerout', () => this.tweens.add({ targets: card, scale: 1, duration: 90 }));
      const pick = () => {
        if (done) return;
        done = true;
        addCard(run, id);
        audio.play('equip');
        this.time.delayedCall(250, leave);
      };
      onTap(card, pick);
      makeButton(this, x, 570, 220, 48, '加える', pick, { size: 20 });
    });
    makeButton(this, W / 2, 660, 300, 46, `スキップ  +${CARD_SKIP_GOLD} G`, () => {
      if (done) return;
      done = true;
      run.gold += CARD_SKIP_GOLD;
      audio.play('coin');
      leave();
    }, { size: 18, color: 0x7b8798 });
  }
}
