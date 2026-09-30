import Phaser from 'phaser';
import type { AudioManager } from '../audio/AudioManager';

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create(): void {
    const { width, height } = this.scale;
    this.add.text(width / 2, height / 2, 'Click to Start', { fontSize: '32px', color: '#00f2fe' }).setOrigin(0.5);
    // Autoplay policy: unlock AudioContext only after the first user click.
    this.input.once('pointerdown', async () => {
      const snd = this.sound as Phaser.Sound.WebAudioSoundManager;
      try { await snd.context?.resume(); } catch { /* ignore */ }
      const audio = this.registry.get('audio') as AudioManager;
      audio.play('bgm_town');
      audio.play('ui_select');
    });
  }
}
