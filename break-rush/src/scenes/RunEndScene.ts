import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { audio } from '../audio/AudioSystem';
import { newRun, RunSummary } from '../systems/RunState';
import { RELICS } from '../systems/Relics';
import { Difficulty } from '../systems/Difficulty';
import { loadSave } from '../systems/SaveSystem';

interface RunEndData {
  summary: RunSummary;
  difficulty: Difficulty;
}

export class RunEndScene extends Phaser.Scene {
  private summary!: RunSummary;
  private difficulty: Difficulty = 'normal';
  private ready = false;

  constructor() {
    super('RunEnd');
  }

  init(data: RunEndData): void {
    this.summary = data.summary;
    this.difficulty = data.difficulty;
    this.ready = false;
  }

  create(): void {
    const s = this.summary;
    this.cameras.main.setBackgroundColor(s.victory ? 0x1a1230 : 0x120810);
    const T = { fontFamily: 'monospace', color: '#fff', stroke: '#000', strokeThickness: 4 };
    this.add
      .text(GAME_WIDTH / 2, 56, s.victory ? 'VICTORY!' : 'YOU FELL', { ...T, fontSize: '60px', fontStyle: 'bold', color: s.victory ? '#ffdd44' : '#ff4466', strokeThickness: 8 })
      .setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 108, s.victory ? 'The beasts are broken. Take your shards.' : `Reached zone ${s.zone}, room ${s.room + 1}`, { ...T, fontSize: '18px', color: '#bbc' }).setOrigin(0.5);

    const rows: Array<[string, string]> = [
      ['LEVEL', String(s.level)],
      ['ROOMS CLEARED', String(s.rooms)],
      ['ENEMIES DEFEATED', String(s.kills)],
      ['MAX COMBO', String(s.maxCombo)],
      ['GOLD COLLECTED', String(s.gold)],
      ['TIME', `${Math.floor(s.timeSec / 60)}:${String(Math.floor(s.timeSec % 60)).padStart(2, '0')}`],
    ];
    rows.forEach(([k, v], i) => {
      this.add.text(270, 150 + i * 30, k, { ...T, fontSize: '19px' });
      this.add.text(560, 150 + i * 30, v, { ...T, fontSize: '19px' }).setOrigin(1, 0);
    });

    this.add.text(270, 340, 'SCORE', { ...T, fontSize: '24px' });
    const scoreText = this.add.text(560, 340, '0', { ...T, fontSize: '24px', color: '#ffdd44' }).setOrigin(1, 0);
    const counter = { v: 0 };
    this.tweens.add({ targets: counter, v: s.score, duration: 1000, onUpdate: () => scoreText.setText(Math.round(counter.v).toLocaleString()), onComplete: () => scoreText.setText(s.score.toLocaleString()) });
    const best = s.newRecord ? 'NEW RECORD!' : s.bestBefore > 0 ? `BEST ${s.bestBefore.toLocaleString()}  (${(s.bestBefore - s.score).toLocaleString()} TO GO)` : '';
    const bestText = this.add.text(415, 392, best, { ...T, fontSize: '17px', color: s.newRecord ? '#ff8844' : '#aab' }).setOrigin(0.5);
    if (s.newRecord) this.tweens.add({ targets: bestText, scale: 1.12, duration: 300, yoyo: true, repeat: -1 });

    // Shards: the thing that makes dying worthwhile
    const shard = this.add.text(GAME_WIDTH - 170, 190, `+${s.shards}`, { ...T, fontSize: '54px', fontStyle: 'bold', color: '#b06cff', strokeThickness: 7 }).setOrigin(0.5).setAlpha(0).setScale(2);
    this.add.text(GAME_WIDTH - 170, 232, 'SHARDS', { ...T, fontSize: '18px', color: '#d8c0ff' }).setOrigin(0.5);
    this.tweens.add({ targets: shard, alpha: 1, scale: 1, delay: 900, duration: 300, ease: 'Back.easeOut', onStart: () => audio.play('levelup') });

    if (s.relics.length) {
      this.add.text(GAME_WIDTH - 170, 270, 'RELICS', { ...T, fontSize: '14px', color: '#9a96c0' }).setOrigin(0.5);
      s.relics.slice(0, 8).forEach((r, i) => {
        const x = GAME_WIDTH - 170 + ((i % 4) - 1.5) * 34;
        const y = 300 + Math.floor(i / 4) * 34;
        this.add.rectangle(x, y, 28, 28, RELICS[r].color).setStrokeStyle(2, 0x000000);
        this.add.text(x, y, RELICS[r].glyph, { ...T, fontSize: '16px', fontStyle: 'bold' }).setOrigin(0.5);
      });
    }
    if (s.unlocked.length) this.add.text(GAME_WIDTH / 2, 428, `UNLOCKED: ${s.unlocked.join(', ')}`, { ...T, fontSize: '18px', color: '#44ffee' }).setOrigin(0.5);

    const prompt = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 50, 'ENTER: title / upgrades     R: new run', { ...T, fontSize: '20px', color: '#44ffee' })
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: prompt, alpha: 1, delay: 1300, duration: 300 });
    this.time.delayedCall(1300, () => (this.ready = true));
    const kb = this.input.keyboard!;
    kb.on('keydown-ENTER', () => this.ready && this.scene.start('Title'));
    kb.on('keydown-R', () => this.ready && this.scene.start('Game', { run: newRun(this.difficulty, loadSave().meta) }));
  }
}
