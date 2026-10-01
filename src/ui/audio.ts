// WebAudio 合成音（音声ファイル不要）。Autoplay対策：最初のクリックで AudioContext を開放する。
import type { LocId } from '../engine/types';

const MOOD: Record<LocId, { root: number; scale: number[]; vol: number }> = {
  home:        { root: 110.0, scale: [0, 4, 7, 11], vol: 0.8 },
  shopping:    { root: 130.8, scale: [0, 4, 7, 9], vol: 0.8 },
  clinic:      { root: 98.0, scale: [0, 3, 7, 10], vol: 0.7 },
  station:     { root: 87.3, scale: [0, 5, 7, 10], vol: 0.8 },
  park:        { root: 146.8, scale: [0, 4, 7, 9], vol: 0.8 },
  school:      { root: 123.5, scale: [0, 2, 7, 9], vol: 0.7 },
  beach:       { root: 110.0, scale: [0, 2, 7, 9], vol: 0.9 },
  shrine:      { root: 92.5, scale: [0, 3, 5, 10], vol: 0.8 },
  underground: { root: 55.0, scale: [0, 1, 7, 8], vol: 0.9 },
};

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private bgm!: GainNode;
  private pad: OscillatorNode[] = [];
  private padGain!: GainNode;
  private filter!: BiquadFilterNode;
  private noiseGain!: GainNode;
  private cicada!: GainNode;
  private pluck: number | null = null;
  private loc: LocId = 'home';
  private night = 0;
  muted = false;

  get ready() { return !!this.ctx; }

  /** ユーザー操作の中で呼ぶこと */
  init() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.7; this.master.connect(ctx.destination);
    this.bgm = ctx.createGain(); this.bgm.gain.value = 0.5; this.bgm.connect(this.master);
    this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 900; this.filter.Q.value = 0.7;
    this.padGain = ctx.createGain(); this.padGain.gain.value = 0.0; this.padGain.connect(this.filter); this.filter.connect(this.bgm);
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator(); o.type = i === 0 ? 'sine' : 'triangle';
      const g = ctx.createGain(); g.gain.value = i === 0 ? 0.5 : 0.18; o.connect(g); g.connect(this.padGain); o.start(); this.pad.push(o);
    }
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08; const lg = ctx.createGain(); lg.gain.value = 300; lfo.connect(lg); lg.connect(this.filter.frequency); lfo.start();
    // 波の音と蝉
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const mk = (type: BiquadFilterType, f: number) => { const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; const bq = ctx.createBiquadFilter(); bq.type = type; bq.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0; s.connect(bq); bq.connect(g); g.connect(this.bgm); s.start(); return { g, bq }; };
    const sea = mk('lowpass', 500); this.noiseGain = sea.g;
    const wl = ctx.createOscillator(); wl.frequency.value = 0.12; const wg = ctx.createGain(); wg.gain.value = 250; wl.connect(wg); wg.connect(sea.bq.frequency); wl.start();
    const ci = mk('bandpass', 5200); this.cicada = ci.g; ci.bq.Q.value = 4;
    const am = ctx.createOscillator(); am.frequency.value = 22; const ag = ctx.createGain(); ag.gain.value = 0.02; am.connect(ag); ag.connect(ci.g.gain); am.start();
    this.padGain.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 3);
    this.applyMood();
    this.schedulePluck();
  }

  toggle(): boolean {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.7, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  /** 場所と時刻でBGMの雰囲気を変える */
  setScene(loc: LocId, time: number, flags: { blackout?: boolean; light?: boolean }) {
    this.loc = loc;
    this.night = Math.max(0, Math.min(1, (time - 1080) / 180));
    if (flags.light) this.night = 1.4;
    this.applyMood();
  }

  private applyMood() {
    if (!this.ctx) return;
    const m = MOOD[this.loc], t = this.ctx.currentTime;
    const root = m.root * (this.night > 0.6 ? 0.75 : 1);
    const r = [1, Math.pow(2, m.scale[1] / 12), 2, Math.pow(2, m.scale[2] / 12) * 2];
    this.pad.forEach((o, i) => o.frequency.setTargetAtTime(root * r[i], t, 1.2));
    this.filter.frequency.setTargetAtTime(this.night > 1 ? 400 : 700 + (1 - this.night) * 700, t, 1.5);
    this.noiseGain.gain.setTargetAtTime((this.loc === 'beach' ? 0.13 : this.loc === 'home' || this.loc === 'shrine' ? 0.03 : 0) * m.vol, t, 1);
    this.cicada.gain.setTargetAtTime(this.night < 0.2 && this.loc !== 'underground' && this.loc !== 'home' ? 0.025 : 0, t, 1);
  }

  private schedulePluck() {
    if (this.pluck) window.clearTimeout(this.pluck);
    const run = () => {
      if (this.ctx && !this.muted && this.ctx.state === 'running') {
        const m = MOOD[this.loc];
        const semi = m.scale[Math.floor(Math.random() * m.scale.length)] + (Math.random() < 0.4 ? 12 : 24);
        this.tone(m.root * Math.pow(2, semi / 12), 0.9 + Math.random(), 0.05 * m.vol * (1 - Math.min(0.6, this.night * 0.4)), 'sine', this.bgm);
      }
      this.pluck = window.setTimeout(run, 2200 + Math.random() * 3200);
    };
    run();
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', dest?: AudioNode, slide = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest ?? this.master); o.start(t); o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, f = 1200, type: BiquadFilterType = 'lowpass') {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ctx.createBufferSource(); s.buffer = b; const bq = ctx.createBiquadFilter(); bq.type = type; bq.frequency.value = f;
    const g = ctx.createGain(); g.gain.value = vol; s.connect(bq); bq.connect(g); g.connect(this.master); s.start();
  }

  sfx(id: string) {
    if (!this.ctx) return;
    switch (id) {
      case 'blip': this.tone(520 + Math.random() * 60, 0.04, 0.04, 'square'); break;
      case 'select': this.tone(660, 0.08, 0.08, 'triangle'); this.tone(990, 0.1, 0.05, 'triangle'); break;
      case 'hover': this.tone(440, 0.03, 0.025, 'triangle'); break;
      case 'step': this.noise(0.08, 0.08, 600); break;
      case 'move': this.noise(0.25, 0.06, 900); this.tone(330, 0.2, 0.04, 'triangle', undefined, 80); break;
      case 'chime': [880, 1318, 1760].forEach((f, i) => window.setTimeout(() => this.tone(f, 0.9, 0.07, 'sine'), i * 90)); break;
      case 'boom': this.tone(70, 1.6, 0.35, 'sine', undefined, -40); this.noise(1.2, 0.25, 300); break;
      case 'rumble': this.tone(48, 3, 0.25, 'sawtooth', undefined, 10); this.noise(2.5, 0.12, 200); break;
      case 'crack': this.noise(0.5, 0.25, 4000, 'highpass'); this.tone(1800, 0.4, 0.06, 'square', undefined, -1500); break;
      case 'glitch': for (let i = 0; i < 6; i++) window.setTimeout(() => this.tone(200 + Math.random() * 1800, 0.05, 0.05, 'square'), i * 40); break;
      case 'white': this.tone(1200, 2.4, 0.05, 'sine'); this.tone(1204, 2.4, 0.05, 'sine'); break;
      case 'ending': [262, 330, 392, 523].forEach((f, i) => window.setTimeout(() => this.tone(f, 2.5, 0.08, 'sine'), i * 380)); break;
    }
  }
}
