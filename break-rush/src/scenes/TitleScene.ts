import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { audio } from '../audio/AudioSystem';
import { DIFFICULTIES, DIFFICULTY_ORDER, Difficulty } from '../systems/Difficulty';
import { loadSave, writeSave } from '../systems/SaveSystem';
import { isDifficultyUnlocked, unlockHint, usableDifficulty, UNLOCK_RULES } from '../systems/Unlocks';
import { newRun } from '../systems/RunState';

/** The first click / key press here also unlocks the AudioContext (browser autoplay rules). */
export class TitleScene extends Phaser.Scene {
  private save = loadSave();
  private selected: Difficulty = 'normal';
  private labels: Phaser.GameObjects.Text[] = [];
  private desc!: Phaser.GameObjects.Text;
  private stats!: Phaser.GameObjects.Text;
  private soundLabel!: Phaser.GameObjects.Text;

  constructor() {
    super('Title');
  }

  create(): void {
    this.save = loadSave();
    this.selected = usableDifficulty(this.save);
    this.labels = [];
    this.cameras.main.setBackgroundColor(0x0b0b14);

    this.add
      .text(GAME_WIDTH / 2, 110, 'BREAK RUSH', { fontFamily: 'monospace', fontSize: '84px', fontStyle: 'bold', color: '#ffdd44', stroke: '#ff3355', strokeThickness: 10 })
      .setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 175, 'Smash. Combo. RUSH. Smash more.', { fontFamily: 'monospace', fontSize: '18px', color: '#aab' }).setOrigin(0.5);

    DIFFICULTY_ORDER.forEach((d, i) => {
      const t = this.add
        .text(GAME_WIDTH / 2 + (i - 1) * 200, 250, DIFFICULTIES[d].name, { fontFamily: 'monospace', fontSize: '30px', fontStyle: 'bold', color: '#fff', stroke: '#000', strokeThickness: 5 })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      t.on('pointerdown', () => this.select(d));
      this.labels.push(t);
    });
    this.desc = this.add.text(GAME_WIDTH / 2, 292, '', { fontFamily: 'monospace', fontSize: '15px', color: '#bbd' }).setOrigin(0.5);
    this.stats = this.add.text(GAME_WIDTH / 2, 340, '', { fontFamily: 'monospace', fontSize: '16px', color: '#fff', align: 'center' }).setOrigin(0.5);

    const start = this.add
      .text(GAME_WIDTH / 2, 415, 'PRESS ENTER / CLICK TO START', { fontFamily: 'monospace', fontSize: '26px', fontStyle: 'bold', color: '#44ffee', stroke: '#000', strokeThickness: 5 })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.tweens.add({ targets: start, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });
    start.on('pointerdown', () => this.start());

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 50, 'A/D Move  Space Jump  J Attack  L Skill  I Ultimate  Shift Dodge  E Interact   ← → Difficulty   U Upgrades   M Sound', { fontFamily: 'monospace', fontSize: '14px', color: '#889' })
      .setOrigin(0.5);
    this.soundLabel = this.add.text(GAME_WIDTH - 20, 16, '', { fontFamily: 'monospace', fontSize: '14px', color: '#889' }).setOrigin(1, 0);

    const kb = this.input.keyboard!;
    kb.on('keydown', () => audio.unlock());
    this.input.on('pointerdown', () => audio.unlock());
    kb.on('keydown-LEFT', () => this.move(-1));
    kb.on('keydown-A', () => this.move(-1));
    kb.on('keydown-RIGHT', () => this.move(1));
    kb.on('keydown-D', () => this.move(1));
    kb.on('keydown-ENTER', () => this.start());
    kb.on('keydown-U', () => this.scene.start('Meta'));
    kb.on('keydown-SPACE', () => this.start());
    kb.on('keydown-M', () => {
      audio.muted = !audio.muted;
      this.save.settings.muted = audio.muted;
      writeSave(this.save);
      this.refresh();
    });
    this.refresh();
  }

  private move(dir: number): void {
    const i = DIFFICULTY_ORDER.indexOf(this.selected);
    this.select(DIFFICULTY_ORDER[Phaser.Math.Clamp(i + dir, 0, DIFFICULTY_ORDER.length - 1)]);
  }

  private select(d: Difficulty): void {
    if (!isDifficultyUnlocked(this.save, d)) return;
    this.selected = d;
    this.save.difficulty = d;
    writeSave(this.save);
    this.refresh();
  }

  private refresh(): void {
    DIFFICULTY_ORDER.forEach((d, i) => {
      const unlocked = isDifficultyUnlocked(this.save, d);
      const on = d === this.selected;
      this.labels[i]
        .setText(unlocked ? DIFFICULTIES[d].name : `${DIFFICULTIES[d].name} [LOCKED]`)
        .setColor(!unlocked ? '#555566' : on ? '#ffdd44' : '#ffffff')
        .setScale(on ? 1.2 : 1);
    });
    this.desc.setText(DIFFICULTIES[this.selected].desc);
    const s = this.save;
    const upgradeUnlocks = UNLOCK_RULES.filter((r) => r.id.startsWith('upgrade:'));
    const locked = DIFFICULTY_ORDER.filter((d) => !isDifficultyUnlocked(s, d)).map((d) => `${DIFFICULTIES[d].name}: ${unlockHint(d)}`);
    this.stats.setText(
      `BEST SCORE ${s.bestScore[this.selected].toLocaleString()}    BEST COMBO ${s.bestCombo}    CLEARED STAGE ${s.clearedStage}\n` +
        `SHARDS ${s.shards}  (U: permanent upgrades)    UNLOCKS ${s.unlocked.length}/${UNLOCK_RULES.length}` +
        (locked.length ? `    (${locked[0]})` : upgradeUnlocks.some((r) => !s.unlocked.includes(r.id)) ? `    (${upgradeUnlocks.find((r) => !s.unlocked.includes(r.id))!.hint})` : ''),
    );
    this.soundLabel.setText(audio.muted ? 'SOUND: OFF  (M)' : 'SOUND: ON  (M)');
  }

  private start(): void {
    audio.unlock();
    this.scene.start('Game', { run: newRun(this.selected, this.save.meta) });
  }
}
