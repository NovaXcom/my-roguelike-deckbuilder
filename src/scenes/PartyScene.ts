import Phaser from 'phaser';
import { audio } from '../audio';
import { ELEMENT_COLOR, ELEMENT_LABEL, MEMBERS, PARTY_ORDER, SKILLS } from '../core/data';
import { COLORS, drawBackground, drawHero, txt } from '../ui/art';
import { H, W } from './TitleScene';

/** 2人パーティ（前衛ナイト＋後衛エレメンタリスト）の確認画面。 */
export class PartyScene extends Phaser.Scene {
  constructor() {
    super('Party');
  }

  create(): void {
    drawBackground(this, W, H);
    txt(this, W / 2, 50, 'パーティ編成', 40, '#f6e3b4', { fontStyle: 'bold', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5);
    txt(this, W / 2, 92, '前衛が敵の体勢を崩し（ブレイク）、後衛の魔法でチェインを狙え', 16, '#9fb0c8').setOrigin(0.5);

    PARTY_ORDER.forEach((id, i) => {
      const m = MEMBERS[id];
      const px = 40 + i * 620;
      const g = this.add.graphics();
      g.fillStyle(0x2d3748, 0.9).fillRoundedRect(px, 120, 580, 470, 16);
      g.lineStyle(3, m.color, 1).strokeRoundedRect(px, 120, 580, 470, 16);

      const hero = this.add.graphics().setPosition(px + 110, 420);
      drawHero(hero, id, m.color, 1.15);
      txt(this, px + 250, 142, m.name, 30, '#fff', { fontStyle: 'bold' });
      txt(this, px + 250, 184, m.title, 15, hex(m.color));
      txt(this, px + 250, 212, `HP ${m.maxHp}`, 20, '#ff8a8a', { fontStyle: 'bold' });
      txt(this, px + 250, 246, m.description, 14, '#d8d0c4', { wordWrap: { width: 310, useAdvancedWrap: true } });
      m.skills.forEach((sid, si) => {
        const sk = SKILLS[sid];
        const y = 330 + si * 62;
        const col = sk.element !== 'none' ? ELEMENT_COLOR[sk.element] : sk.kind === 'support' ? 0x6fcf97 : 0xe9d8c4;
        g.fillStyle(col, 1).fillRoundedRect(px + 250, y + 3, 6, 46, 3);
        txt(this, px + 266, y, `${sk.name}${sk.element !== 'none' ? `（${ELEMENT_LABEL[sk.element]}）` : ''}`, 16, '#fff', { fontStyle: 'bold' });
        txt(this, px + 500, y + 2, `CD ${sk.cooldown}`, 13, '#ffb86b').setOrigin(1, 0);
        txt(this, px + 266, y + 22, sk.text, 12, '#b8c2d0', { wordWrap: { width: 300, useAdvancedWrap: true } });
      });
    });

    const btn = this.add.container(W / 2, 645);
    const bg = this.add.graphics();
    bg.fillStyle(0x2d3748, 1).fillRoundedRect(-150, -30, 300, 60, 14);
    bg.lineStyle(3, COLORS.energy, 1).strokeRoundedRect(-150, -30, 300, 60, 14);
    btn.add([bg, txt(this, 0, 0, '出撃!', 30, '#00f2fe', { fontStyle: 'bold' }).setOrigin(0.5)]);
    btn.setSize(300, 60).setInteractive({ useHandCursor: true });
    this.tweens.add({ targets: btn, scale: 1.05, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    btn.on('pointerdown', () => { audio.play('click'); this.scene.start('Battle'); });

    const back = txt(this, 30, 20, '← タイトルへ', 16, '#9fb0c8').setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.scene.start('Title'));
  }
}

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
