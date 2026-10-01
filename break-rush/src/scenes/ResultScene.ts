import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { RunState, StageSummary, nextStage } from '../systems/RunState';
import { audio } from '../audio/AudioSystem';

interface ResultData {
  run: RunState;
  summary: StageSummary;
}

export class ResultScene extends Phaser.Scene {
  private run!: RunState;
  private summary!: StageSummary;

  constructor() {
    super('Result');
  }

  init(data: ResultData): void {
    this.run = data.run;
    this.summary = data.summary;
  }

  create(): void {
    const s = this.summary;
    this.cameras.main.setBackgroundColor(0x0b0b14);
    const style = { fontFamily: 'monospace', color: '#fff', stroke: '#000', strokeThickness: 4 };
    this.add.text(GAME_WIDTH / 2, 50, 'BOSS DEFEATED', { ...style, fontSize: '44px', fontStyle: 'bold', color: '#ffdd44' }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 100, `STAGE ${s.stage} CLEAR`, { ...style, fontSize: '22px' }).setOrigin(0.5);

    const rows: Array<[string, string]> = [
      ['MAX COMBO', String(s.maxCombo)],
      ['DAMAGE TAKEN', String(s.damageTaken)],
      ['TIME', `${Math.floor(s.timeSec / 60)}:${String(Math.floor(s.timeSec % 60)).padStart(2, '0')}`],
    ];
    rows.forEach(([k, v], i) => {
      this.add.text(300, 170 + i * 36, k, { ...style, fontSize: '22px' });
      this.add.text(660, 170 + i * 36, v, { ...style, fontSize: '22px' }).setOrigin(1, 0);
    });

    this.add.text(300, 290, 'SCORE', { ...style, fontSize: '26px' });
    const scoreText = this.add.text(660, 290, '0', { ...style, fontSize: '26px', color: '#ffdd44' }).setOrigin(1, 0);
    const counter = { v: 0 };
    this.tweens.add({
      targets: counter,
      v: s.score,
      duration: 1200,
      onUpdate: () => scoreText.setText(Math.round(counter.v).toLocaleString()),
      onComplete: () => scoreText.setText(s.score.toLocaleString()),
    });

    const rank = this.add
      .text(GAME_WIDTH - 150, 250, s.rank, { ...style, fontSize: '120px', fontStyle: 'bold', color: '#ff8844', strokeThickness: 8 })
      .setOrigin(0.5)
      .setAlpha(0)
      .setScale(2.5);
    this.tweens.add({ targets: rank, alpha: 1, scale: 1, delay: 1300, duration: 300, ease: 'Back.easeOut', onStart: () => audio.play('hitHeavy') });

    this.add.text(GAME_WIDTH / 2, 370, `TOTAL SCORE ${this.run.totalScore.toLocaleString()}`, { ...style, fontSize: '20px' }).setOrigin(0.5);
    const prompt = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 70, `Press ENTER: STAGE ${this.run.stage + 1}`, { ...style, fontSize: '24px', color: '#44ffee' })
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: prompt, alpha: 1, delay: 1500, duration: 300 });
    this.time.delayedCall(1500, () => {
      this.input.keyboard!.once('keydown-ENTER', () => this.scene.start('Game', { run: nextStage(this.run) }));
      this.input.once('pointerdown', () => this.scene.start('Game', { run: nextStage(this.run) }));
    });
  }
}
