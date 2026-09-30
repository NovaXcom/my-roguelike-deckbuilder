import { SOUNDS, fileKeys } from './audioIds';
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
  private last = new Map<string, string>();
  private synthDest: AudioNode | null = null;

  constructor(private backend: SoundBackend, private loaded: Set<string>) {}

  private hasKey(key: string): boolean { return this.loaded.has(key) && this.backend.cacheHas(key); }

  /** True if at least one file for this sound id is loaded. */
  has(id: string): boolean {
    const def = SOUNDS.find((s) => s.id === id);
    return (def ? fileKeys(def) : [id]).some((k) => this.hasKey(k));
  }

  /** Picks a random loaded variant, avoiding an immediate repeat when possible. */
  private pick(id: string): string | null {
    const def = SOUNDS.find((s) => s.id === id);
    const keys = (def ? fileKeys(def) : [id]).filter((k) => this.hasKey(k));
    if (!keys.length) return null;
    const pool = keys.length > 1 ? keys.filter((k) => k !== this.last.get(id)) : keys;
    const key = pool[Math.floor(Math.random() * pool.length)];
    this.last.set(id, key);
    return key;
  }

  play(id: string): void {
    const def = SOUNDS.find((s) => s.id === id);
    const loop = def?.loop ?? false;
    try {
      if (loop) this.stop(id);
      let handle: { stop(): void } | Stop | null = null;
      const key = this.pick(id);
      if (key) {
        handle = this.backend.play(key, loop);
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
