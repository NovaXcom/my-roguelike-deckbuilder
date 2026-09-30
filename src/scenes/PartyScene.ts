import Phaser from 'phaser';
import { audio } from '../audio';
import { ELEMENT_COLOR, ELEMENT_LABEL, MEMBERS, PARTY_ORDER, SKILLS } from '../core/data';
import { RARITY_LABEL, statLines } from '../core/equipment';
import { memberMaxHp, memberSkills } from '../core/run';
import { startRun } from '../game';
import { drawBackground, drawHero, txt } from '../ui/art';
import { HERO_SPRITE } from '../ui/assetMap';
import { hasImg } from '../ui/assets';
import { compact } from '../ui/device';
import { skillSummary } from '../ui/skillText';
import { hex, makeButton } from '../ui/widgets';
import { H, W } from './TitleScene';

/** 出撃前のパーティ確認。ここで新しい挑戦(ラン)を生成し、初期装備とスキルを確認する。 */
export class PartyScene extends Phaser.Scene {
  constructor() {
    super('Party');
  }

  create(): void {
    const run = startRun();
    drawBackground(this, W, H);
    txt(this, W / 2, 44, 'パーティ編成', 38, '#f6e3b4', { fontStyle: 'bold', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5);
    txt(this, W / 2, 84, `前衛が敵の体勢を崩し（ブレイク）、後衛の魔法でチェインを狙え　／　ポーション ×${run.potions}`, 15, '#9fb0c8').setOrigin(0.5);

    PARTY_ORDER.forEach((id, i) => {
      const m = MEMBERS[id];
      const px = 40 + i * 620;
      const g = this.add.graphics();
      g.fillStyle(0x2d3748, 0.9).fillRoundedRect(px, 110, 580, 480, 16);
      g.lineStyle(3, m.color, 1).strokeRoundedRect(px, 110, 580, 480, 16);
      // 立ち絵: 騎士はスプライト、エレメンタリストは胸像（戦闘用の立ち絵が無いため）。無ければ図形描画
      const sprite = HERO_SPRITE[id];
      if (sprite && hasImg(this, sprite.idle)) {
        const img = this.add.image(px + 115, 400, sprite.idle).setOrigin(0.5, 1);
        img.setScale(270 / img.height);
      } else if (id === 'elementalist' && hasImg(this, 'cutin_elementalist_bust')) {
        const bust = this.add.image(px + 115, 390, 'cutin_elementalist_bust').setOrigin(0.5, 1);
        bust.setScale(196 / bust.height);
      } else {
        const hero = this.add.graphics().setPosition(px + 105, 380);
        drawHero(hero, id, m.color, 1.1);
      }
      txt(this, px + 240, 126, m.name, 28, '#fff', { fontStyle: 'bold' });
      txt(this, px + 240, 164, m.title, 14, hex(m.color));
      txt(this, px + 240, 190, `HP ${memberMaxHp(run, i)}`, 19, '#ff8a8a', { fontStyle: 'bold' });
      // 初期装備
      const gear = run.party[i].gear;
      const lines = [gear.weapon, gear.armor].map((it) =>
        it ? `${it.name} [${RARITY_LABEL[it.rarity]}] ${statLines(it.stats).join(' ')}` : '');
      txt(this, px + 240, 218, lines.join('\n'), 12, '#d8d0c4', { lineSpacing: 3 });
      memberSkills(run, i).forEach((sid, si) => {
        const sk = SKILLS[sid];
        const y = 268 + si * 56;
        const col = sk.element !== 'none' ? ELEMENT_COLOR[sk.element] : sk.kind === 'support' ? 0x6fcf97 : 0xe9d8c4;
        g.fillStyle(col, 1).fillRoundedRect(px + 240, y + 3, 6, 42, 3);
        txt(this, px + 256, y, `${sk.name}${sk.element !== 'none' ? `（${ELEMENT_LABEL[sk.element]}）` : ''}`, 15, '#fff', { fontStyle: 'bold' });
        txt(this, px + 510, y + 2, `CD ${sk.cooldown}`, 12, '#ffb86b').setOrigin(1, 0);
        // コンパクト(スマホ)は長文の代わりに要点を1行で大きく表示
        txt(this, px + 256, y + 20, compact() ? skillSummary(sk).join('  ') : sk.text, 12, '#b8c2d0', { wordWrap: { width: 300, useAdvancedWrap: true } });
      });
    });

    makeButton(this, W / 2, 648, 300, 60, '出撃!', () => { audio.play('ui_click'); this.scene.start('Map'); }, { size: 30 });
    makeButton(this, 120, 668, 190, 44, '← 拠点へ', () => this.scene.start('Town'), { size: 16, color: 0x7b8798 });
  }
}
