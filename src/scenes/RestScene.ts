import Phaser from 'phaser';
import { audio } from '../audio';
import { REST_RATIO, memberMaxHp, rest } from '../core/run';
import { game } from '../game';
import { COLORS, drawBackground, txt } from '../ui/art';
import { hasImg } from '../ui/assets';
import { makeButton } from '../ui/widgets';
import { H, W } from './TitleScene';

/** 休憩所: 焚き火でHPを30%回復、または修練で最大HPを永続的(このラン中)に伸ばす。 */
export class RestScene extends Phaser.Scene {
  constructor() {
    super('Rest');
  }

  create(): void {
    const run = game.run;
    if (!run) { this.scene.start('Town'); return; }
    drawBackground(this, W, H);
    txt(this, W / 2, 70, '休憩所', 42, '#f6e3b4', { fontStyle: 'bold', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5);

    // 焚き火
    const frames = ['prop_campfire_1', 'prop_campfire_2', 'prop_campfire_3'].filter((k) => hasImg(this, k));
    if (frames.length >= 2) {
      // 焚き火の画像を順に切り替えて揺らぎを表現（高さを揃えて足元固定）
      this.add.circle(W / 2, 360, 150, 0xff7043, 0.12);
      const fireImg = this.add.image(W / 2, 400, frames[0]).setOrigin(0.5, 1);
      const fit = () => fireImg.setScale(200 / fireImg.height);
      fit();
      let frame = 0;
      this.time.addEvent({ delay: 170, loop: true, callback: () => { frame = (frame + 1) % frames.length; fireImg.setTexture(frames[frame]); fit(); } });
    } else {
      const fire = this.add.graphics().setPosition(W / 2, 330);
      fire.fillStyle(0x5a3a1c, 1).fillRoundedRect(-70, 40, 140, 16, 6);
      fire.fillStyle(0xff7043, 1).fillTriangle(-40, 40, 40, 40, 0, -60);
      fire.fillStyle(0xffd166, 1).fillTriangle(-22, 40, 22, 40, 0, -20);
      this.tweens.add({ targets: fire, scaleY: 1.12, scaleX: 0.95, duration: 260, yoyo: true, repeat: -1 });
    }

    const bars = this.add.graphics();
    run.party.forEach((m, i) => {
      const max = memberMaxHp(run, i);
      const x = W / 2 - 240 + i * 480;
      txt(this, x, 470, m.role === 'knight' ? 'ナイト' : 'エレメンタリスト', 15, '#e8dfd3').setOrigin(0.5);
      bars.fillStyle(0x000000, 0.6).fillRoundedRect(x - 100, 486, 200, 20, 6);
      bars.fillStyle(COLORS.hp, 1).fillRoundedRect(x - 98, 488, 196 * (m.hp / max), 16, 5);
      txt(this, x, 496, `${m.hp}/${max}`, 13, '#fff', { fontStyle: 'bold' }).setOrigin(0.5);
    });

    const done = () => this.scene.start('Map');
    makeButton(this, W / 2 - 360, 600, 320, 80, `休息する\n全員のHPを${REST_RATIO * 100}%回復`, () => { rest(run, 'heal'); audio.play('sup_heal'); this.time.delayedCall(250, done); }, { size: 20, color: 0x6fcf97 });
    makeButton(this, W / 2, 600, 320, 80, '修練する\n全員の最大HP +6', () => { rest(run, 'train'); audio.play('sup_guard'); this.time.delayedCall(250, done); }, { size: 20, color: 0xe08a3c });
    makeButton(this, W / 2 + 360, 600, 320, 80, 'カードを削除する\nデッキを薄くして引きを良くする', () => {
      this.scene.start('Deck', { mode: 'remove', returnTo: { scene: 'Map' }, cancelTo: { scene: 'Rest' } });
    }, { size: 20, color: 0x9a7bd8 });
  }
}
