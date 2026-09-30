/**
 * WebAudio 合成のみで SE/BGM を鳴らす（音声ファイル不要）。
 * AudioContext はブラウザの Autoplay 制限に従い、最初のユーザー操作(unlock)まで生成しない。
 */
class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private droneStarted = false;
  muted = false;

  /** タイトル画面での最初のクリックから呼ぶ */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.7;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.startDrone();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.7;
    return this.muted;
  }

  private noise(dur: number): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  private env(g: GainNode, t: number, peak: number, dur: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, peak: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    this.env(g, t, peak, dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, freq: number, q: number, peak: number, filter: BiquadFilterType = 'bandpass', delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const n = this.noise(dur);
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, peak, dur);
    n.connect(f).connect(g).connect(this.master!);
    n.start(t);
  }

  play(kind: 'click' | 'draw' | 'shuffle' | 'card' | 'block' | 'hit' | 'enemyHit' | 'turn' | 'win' | 'lose'): void {
    if (!this.ctx || !this.master) return;
    switch (kind) {
      case 'click': this.tone('triangle', 660, 880, 0.08, 0.15); break;
      case 'draw': this.burst(0.09, 3200, 1.2, 0.18, 'bandpass'); break;
      case 'shuffle':
        for (let i = 0; i < 5; i++) this.burst(0.07, 2500 + i * 300, 1, 0.14, 'bandpass', i * 0.05);
        break;
      case 'card': // ドシッという重い打撃音
        this.tone('sine', 140, 38, 0.28, 0.7);
        this.burst(0.12, 400, 0.8, 0.4, 'lowpass');
        break;
      case 'block': // 金属音
        this.tone('square', 1180, 1170, 0.18, 0.12);
        this.tone('triangle', 1770, 1760, 0.3, 0.14);
        this.tone('sine', 2650, 2640, 0.35, 0.08);
        break;
      case 'hit':
        this.tone('sawtooth', 220, 50, 0.22, 0.4);
        this.burst(0.18, 900, 0.7, 0.5, 'lowpass');
        break;
      case 'enemyHit':
        this.tone('square', 300, 90, 0.16, 0.25);
        this.burst(0.14, 1400, 0.9, 0.4, 'bandpass');
        break;
      case 'turn': this.tone('triangle', 330, 495, 0.2, 0.2); this.tone('triangle', 495, 660, 0.25, 0.18, 0.12); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.35, 0.22, i * 0.14)); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => this.tone('sawtooth', f, f * 0.98, 0.5, 0.15, i * 0.22)); break;
    }
  }

  /** 重厚なアンビエントドローン（BGM 代替） */
  private startDrone(): void {
    if (this.droneStarted || !this.ctx || !this.master) return;
    this.droneStarted = true;
    const ctx = this.ctx;
    const bus = ctx.createGain();
    bus.gain.value = 0.16;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    lp.Q.value = 2;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start();
    for (const [f, det] of [[55, -6], [55, 7], [82.4, 0], [110, 4]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = f < 100 ? 0.5 : 0.25;
      o.connect(g).connect(bus);
      o.start();
    }
    bus.connect(lp).connect(this.master);
  }
}

export const audio = new AudioManager();
