export type SfxName =
  | 'swing' | 'hit' | 'hitHeavy' | 'break' | 'kill' | 'rush' | 'rushHit'
  | 'dodge' | 'counter' | 'hurt' | 'milestone' | 'multikill' | 'horde' | 'warn';

/**
 * Synthesised sound effects (no audio files needed).
 * The AudioContext is only created inside a user gesture (browser autoplay rules).
 */
class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  /** Safe to call on every input event; creates/resumes the context as needed. */
  unlock(): void {
    if (this.ctx?.state === 'running') return;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  play(name: SfxName, pitch = 1): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const p = pitch;
    switch (name) {
      case 'swing':
        this.noise(0.09, 0.12, 2200 * p, 500 * p, 'bandpass');
        break;
      case 'hit':
        this.noise(0.05, 0.45, 3000 * p, 3000 * p, 'highpass');
        this.tone('square', 240 * p, 90 * p, 0.09, 0.35);
        break;
      case 'hitHeavy':
        this.noise(0.14, 0.7, 900 * p, 200 * p, 'lowpass');
        this.tone('sawtooth', 150 * p, 40, 0.22, 0.6);
        this.tone('square', 300 * p, 100, 0.1, 0.3);
        break;
      case 'break':
        this.tone('square', 900, 1800, 0.12, 0.3);
        this.tone('triangle', 1200, 2600, 0.22, 0.3, 0.06);
        this.noise(0.2, 0.4, 4000, 1000, 'highpass');
        break;
      case 'kill':
        this.tone('sawtooth', 520, 60, 0.28, 0.4);
        this.noise(0.22, 0.5, 1500, 200, 'lowpass');
        break;
      case 'rush':
        this.noise(0.28, 0.3, 500, 3500, 'bandpass');
        this.tone('sawtooth', 200, 900, 0.26, 0.2);
        break;
      case 'rushHit':
        this.play('hitHeavy', 1.2);
        this.tone('triangle', 1800, 600, 0.3, 0.3);
        break;
      case 'dodge':
        this.noise(0.14, 0.25, 1400, 300, 'bandpass');
        break;
      case 'counter':
        this.tone('triangle', 1600, 700, 0.3, 0.4);
        this.tone('square', 2400, 1200, 0.18, 0.2, 0.03);
        this.play('hitHeavy', 1.1);
        break;
      case 'hurt':
        this.tone('sawtooth', 170, 55, 0.22, 0.5);
        this.noise(0.12, 0.3, 700, 300, 'lowpass');
        break;
      case 'milestone':
        [523, 659, 784, 1047].forEach((f, i) => this.tone('square', f, f, 0.09, 0.25, i * 0.07));
        break;
      case 'multikill':
        this.tone('sine', 110, 28, 0.7, 0.9);
        this.noise(0.55, 0.6, 700, 120, 'lowpass');
        [392, 523, 659, 784, 1047].forEach((f, i) => this.tone('square', f, f, 0.1, 0.22, 0.15 + i * 0.06));
        break;
      case 'warn':
        this.tone('square', 1100, 1100, 0.05, 0.14);
        this.tone('square', 1400, 1400, 0.06, 0.14, 0.07);
        break;
      case 'horde':
        this.tone('sawtooth', 440, 440, 0.15, 0.3);
        this.tone('sawtooth', 330, 330, 0.15, 0.3, 0.2);
        this.tone('sawtooth', 440, 440, 0.15, 0.3, 0.4);
        break;
    }
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, f0), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, f0: number, f1: number, filter: BiquadFilterType, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(Math.max(20, f0), t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }
}

export const audio = new AudioSystem();
