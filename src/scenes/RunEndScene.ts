import Phaser from 'phaser';
import { audio } from '../audio';
import { bankRun } from '../core/run';
import { game, saveMeta } from '../game';
import { drawBackground, txt } from '../ui/art';
import { makeButton } from '../ui/widgets';
import { H, W } from './TitleScene';

/** 挑戦の結果。集めた魔導石を拠点へ持ち帰り、保存する。 */
export class RunEndScene extends Phaser.Scene {
  constructor() {
    super('RunEnd');
  }

  create(): void {
    const run = game.run;
    if (!run) { this.scene.start('Town'); return; }
    if (!run.finished) run.finished = 'defeat';
    const won = run.finished === 'victory';
    const banked = bankRun(game.meta, run);
    saveMeta();
    const reached = Math.max(0, ...run.visited.map((id) => run.map.nodes[id].row)) + 1;

    drawBackground(this, W, H);
    audio.play(won ? 'win' : 'lose');
    const title = txt(this, W / 2, 170, won ? 'ダンジョン踏破!' : '力尽きた…', 76, won ? '#f6e3b4' : '#ff7a7a', {
      fontStyle: 'bold', stroke: '#000', strokeThickness: 10,
    }).setOrigin(0.5).setScale(0.3);
    this.tweens.add({ targets: title, scale: 1, duration: 450, ease: 'Back.out' });
    txt(this, W / 2, 290, [
      `到達階層: ${reached} / ${run.map.rows}`,
      `持ち帰った魔導石: ◆ +${banked}`,
      `拠点の魔導石: ◆ ${game.meta.stones}`,
      '',
      won ? '街の復興が大きく前進した。' : '集めた魔導石は無駄にならない。拠点を強化して再挑戦しよう。',
    ].join('\n'), 22, '#e8dfd3', { align: 'center', lineSpacing: 10 }).setOrigin(0.5, 0);
    makeButton(this, W / 2, 610, 300, 64, '拠点へ戻る', () => { game.run = null; this.scene.start('Town'); }, { size: 28 });
  }
}
