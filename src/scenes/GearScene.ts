import Phaser from 'phaser';
import { SKILLS } from '../core/data';
import { SLOT_LABEL, type Slot } from '../core/equipment';
import { memberMaxHp, memberSkills } from '../core/run';
import { game } from '../game';
import { drawBackground, txt } from '../ui/art';
import { itemCard, makeButton } from '../ui/widgets';
import { H, W } from './TitleScene';

/** 装備確認（閲覧のみ）。装備・スキルの現状を一覧する。 */
export class GearScene extends Phaser.Scene {
  constructor() {
    super('Gear');
  }

  create(): void {
    const run = game.run;
    if (!run) { this.scene.start('Town'); return; }
    drawBackground(this, W, H);
    txt(this, W / 2, 40, '装備確認', 36, '#f6e3b4', { fontStyle: 'bold', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5);
    run.party.forEach((m, i) => {
      const x0 = 40 + i * 620;
      txt(this, x0 + 290, 90, `${m.role === 'knight' ? 'ナイト' : 'エレメンタリスト'}  HP ${m.hp}/${memberMaxHp(run, i)}`, 20, '#fff', { fontStyle: 'bold' }).setOrigin(0.5);
      (['weapon', 'armor', 'accessory'] as Slot[]).forEach((slot, k) => {
        itemCard(this, x0 + 100 + k * 190, 300, 180, 300, m.gear[slot], SLOT_LABEL[slot]).setScale(0.98);
      });
      const skills = memberSkills(run, i).map((s) => SKILLS[s].name).join(' / ');
      txt(this, x0 + 290, 500, `使用可能スキル\n${skills}`, 14, '#b8c2d0', { align: 'center', wordWrap: { width: 560, useAdvancedWrap: true } }).setOrigin(0.5, 0);
    });
    makeButton(this, W / 2, 650, 240, 54, '← マップへ', () => this.scene.start('Map'), { size: 22 });
  }
}
