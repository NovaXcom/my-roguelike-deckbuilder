import Phaser from 'phaser';
import { AudioManager, type SoundBackend } from '../audio/AudioManager';
import { SOUNDS, collectAudioUrls, fileKeys } from '../audio/audioIds';

// Only files that actually exist are matched; an empty folder yields {} and the game uses synth sounds.
// In `build:local` these are inlined as data URLs by Vite/vite-plugin-singlefile.
const audioModules = import.meta.glob('../assets/audio/*.{mp3,wav}', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>;

export class BootScene extends Phaser.Scene {
  private loaded = new Set<string>();

  constructor() { super('Boot'); }

  preload(): void {
    const urls = collectAudioUrls(audioModules);
    for (const s of SOUNDS) {
      for (const key of fileKeys(s)) if (urls[key]) this.load.audio(key, urls[key]);
    }
    // A missing/undecodable file must not stop the game.
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (f: Phaser.Loader.File) => {
      console.warn(`[audio] could not load ${f.key}; using synth fallback`);
    });
    this.load.on(Phaser.Loader.Events.FILE_COMPLETE, (key: string, type: string) => {
      if (type === 'audio') this.loaded.add(key);
    });
  }

  create(): void {
    const game = this.game;
    const backend: SoundBackend = {
      cacheHas: (k) => this.cache.audio.exists(k),
      play: (k, loop) => {
        const s = game.sound.add(k, { loop });
        s.play();
        return s;
      },
      context: () => (game.sound as Phaser.Sound.WebAudioSoundManager).context ?? null,
    };
    this.registry.set('audio', new AudioManager(backend, this.loaded));
    this.scene.start('Title');
  }
}
