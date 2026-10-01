import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { RunState, StageSummary, nextStage } from '../systems/RunState';
import { ROUTES, Route } from '../systems/StageScript';
import { audio } from '../audio/AudioSystem';

interface ResultData {
  run: RunState;
  summary: StageSummary;
}

const CHOICES: Route[] = ['swarm', 'fortress'];

export class ResultScene extends Phaser.Scene {
  private run!: RunState;
  private summary!: StageSummary;
  private pick = 0;
  private cards: Phaser.GameObjects.Rectangle[] = [];
  private ready = false;

  constructor() {
    super('Result');
  }

  init(data: ResultData): void {
    this.run = data.run;
    this.summary = data.summary;
    this.pick = 0;
    this.cards = [];
    this.ready = false;
  }

  create(): void {
    const s = this.summary;
    this.cameras.main.setBackgroundColor(0x0b0b14);
    const style = { fontFamily: 'monospace', color: '#fff', stroke: '#000', strokeThickness: 4 };
    this.add.text(GAME_WIDTH / 2, 40, 'BOSS DEFEATED', { ...style, fontSize: '44px', fontStyle: 'bold', color: '#ffdd44' }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 88, `STAGE ${s.stage} CLEAR`, { ...style, fontSize: '22px' }).setOrigin(0.5);

    const rows: Array<[string, string]> = [
      ['MAX COMBO', String(s.maxCombo)],
      ['DAMAGE TAKEN', String(s.damageTaken)],
      ['TIME', `${Math.floor(s.timeSec / 60)}:${String(Math.floor(s.timeSec % 60)).padStart(2, '0')}`],
    ];
    rows.forEach(([k, v], i) => {
      this.add.text(260, 130 + i * 30, k, { ...style, fontSize: '20px' });
      this.add.text(620, 130 + i * 30, v, { ...style, fontSize: '20px' }).setOrigin(1, 0);
    });

    this.add.text(260, 228, 'SCORE', { ...style, fontSize: '24px' });
    const scoreText = this.add.text(620, 228, '0', { ...style, fontSize: '24px', color: '#ffdd44' }).setOrigin(1, 0);
    const counter = { v: 0 };
    this.tweens.add({
      targets: counter,
      v: s.score,
      duration: 1000,
      onUpdate: () => scoreText.setText(Math.round(counter.v).toLocaleString()),
      onComplete: () => scoreText.setText(s.score.toLocaleString()),
    });

    const total = this.run.totalScore;
    this.add.text(260, 262, 'RUN TOTAL', { ...style, fontSize: '18px' });
    this.add.text(620, 262, total.toLocaleString(), { ...style, fontSize: '18px' }).setOrigin(1, 0);
    // Replay hook: how far from (or past) the best
    const bestLine = s.newRecord
      ? 'NEW RECORD!'
      : s.bestBefore > 0
        ? `BEST ${s.bestBefore.toLocaleString()}   (${(s.bestBefore - total).toLocaleString()} TO GO)`
        : '';
    const best = this.add.text(440, 296, bestLine, { ...style, fontSize: '18px', color: s.newRecord ? '#ff8844' : '#aab' }).setOrigin(0.5);
    if (s.newRecord) this.tweens.add({ targets: best, scale: 1.15, duration: 300, yoyo: true, repeat: -1 });

    const rank = this.add
      .text(GAME_WIDTH - 140, 200, s.rank, { ...style, fontSize: '110px', fontStyle: 'bold', color: '#ff8844', strokeThickness: 8 })
      .setOrigin(0.5)
      .setAlpha(0)
      .setScale(2.5);
    this.tweens.add({ targets: rank, alpha: 1, scale: 1, delay: 1100, duration: 300, ease: 'Back.easeOut', onStart: () => audio.play('hitHeavy') });

    if (s.unlocked.length) {
      this.add.text(GAME_WIDTH / 2, 326, `UNLOCKED: ${s.unlocked.join(', ')}`, { ...style, fontSize: '18px', color: '#44ffee' }).setOrigin(0.5);
    }

    // Branch: pick the next stage's route
    this.add.text(GAME_WIDTH / 2, 362, `CHOOSE THE ROAD TO STAGE ${this.run.stage + 1}`, { ...style, fontSize: '16px', color: '#ffdd44' }).setOrigin(0.5);
    CHOICES.forEach((r, i) => {
      const x = GAME_WIDTH / 2 + (i === 0 ? -170 : 170);
      const card = this.add.rectangle(x, 425, 320, 84, 0x1d1d33).setStrokeStyle(3, 0x555577).setInteractive({ useHandCursor: true });
      this.cards.push(card);
      this.add.text(x, 405, ROUTES[r].name, { ...style, fontSize: '20px', fontStyle: 'bold' }).setOrigin(0.5);
      this.add.text(x, 435, ROUTES[r].desc, { fontFamily: 'monospace', fontSize: '12px', color: '#bbd', align: 'center', wordWrap: { width: 300 } }).setOrigin(0.5);
      card.on('pointerover', () => this.select(i));
      card.on('pointerdown', () => {
        this.select(i);
        this.go();
      });
    });
    this.refresh();
    const prompt = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 30, '← → select   ENTER: go', { ...style, fontSize: '16px', color: '#44ffee' })
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: prompt, alpha: 1, delay: 1200, duration: 300 });

    const kb = this.input.keyboard!;
    kb.on('keydown-LEFT', () => this.select(0));
    kb.on('keydown-A', () => this.select(0));
    kb.on('keydown-RIGHT', () => this.select(1));
    kb.on('keydown-D', () => this.select(1));
    kb.on('keydown-ENTER', () => this.go());
    this.time.delayedCall(1200, () => (this.ready = true));
  }

  private select(i: number): void {
    this.pick = i;
    this.refresh();
  }

  private refresh(): void {
    this.cards.forEach((c, i) => c.setStrokeStyle(i === this.pick ? 5 : 3, i === this.pick ? 0xffdd44 : 0x555577).setFillStyle(i === this.pick ? 0x2c2c4d : 0x1d1d33));
  }

  private go(): void {
    if (!this.ready) return;
    this.ready = false;
    this.scene.start('Game', { run: nextStage(this.run, CHOICES[this.pick]) });
  }
}
