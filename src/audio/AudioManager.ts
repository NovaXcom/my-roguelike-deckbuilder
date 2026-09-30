import { SOUNDS } from './audioIds';
import { playSynth, type Stop } from './synth';

/** Minimal subset of Phaser's sound manager used here (keeps logic testable without Phaser). */
export interface SoundBackend {
  cacheHas(key: string): boolean;
  play(key: string, loop: boolean): { stop(): void } | null;
  context(): AudioContext | null;
}

/**
 * Plays a loaded audio file when available, otherwise a Web Audio synth fallback.
 * Never throws: audio failures must not stop the game.
 */
export class AudioManager {
  private current = new Map<string, { stop(): void } | Stop>();
  private synthDest: AudioNode | null = null;

  constructor(private backend: SoundBackend, private loaded: Set<string>) {}

  has(id: string): boolean { return this.loaded.has(id) && this.backend.cacheHas(id); }

  play(id: string): void {
    const def = SOUNDS.find((s) => s.id === id);
    const loop = def?.loop ?? false;
    try {
      if (loop) this.stop(id);
      let handle: { stop(): void } | Stop | null = null;
      if (this.has(id)) {
        handle = this.backend.play(id, loop);
      } else {
        const ctx = this.backend.context();
        if (ctx) {
          this.synthDest ??= ctx.destination;
          handle = playSynth(id, ctx, this.synthDest);
        }
      }
      if (handle && loop) this.current.set(id, handle);
    } catch (e) {
      console.warn(`[audio] failed to play ${id}`, e);
    }
  }

  stop(id: string): void {
    const h = this.current.get(id);
    if (!h) return;
    try { typeof h === 'function' ? h() : h.stop(); } catch { /* ignore */ }
    this.current.delete(id);
  }
}
