/**
 * WebAudio 合成音（音声ファイルが無い/読み込み前のフォールバック）。
 *
 * - 合成ロジックは (ctx, 出力先) を受け取る純粋な関数にしてあり、OfflineAudioContext で
 *   実際にレンダリングしてピーク/ラウドネスを測定・調整できる（measureSfx / measureBgm）。
 * - 実際の再生管理（ファイル読み込み・BGM切替・バス構成）は index.ts。
 */

export type SfxKind =
  | 'click' | 'hover' | 'select' | 'skill' | 'magic' | 'enemyHit' | 'hit' | 'block' | 'heal'
  | 'break' | 'chain' | 'turn' | 'win' | 'lose' | 'equip' | 'loot' | 'coin';

export const SFX_KINDS: SfxKind[] = [
  'click', 'hover', 'select', 'skill', 'magic', 'enemyHit', 'hit', 'block', 'heal',
  'break', 'chain', 'turn', 'win', 'lose', 'equip', 'loot', 'coin',
];

/**
 * ラウドネス設計（最大100msのRMS, dBFS）。UI音 < 通常SE < 戦闘SE < ブレイク < チェイン の階層。
 * measureSfx() の実測で TRIM を調整し、この目標に揃えている。
 */
export const SFX_TARGET_DB: Record<SfxKind, number> = {
  hover: -36, click: -28, select: -26, equip: -22, coin: -24, loot: -22, turn: -22, heal: -21, block: -19,
  magic: -18, skill: -16, enemyHit: -15, hit: -14, win: -17, lose: -17, break: -12, chain: -10,
};

/** 音種ごとの音量補正（測定値に基づく調整済みの値） */
const TRIM: Record<SfxKind, number> = {
  click: 0.79,
  hover: 1.19,
  select: 0.59,
  skill: 0.62,
  magic: 0.77,
  enemyHit: 0.68,
  hit: 0.78,
  block: 0.91,
  heal: 0.54,
  break: 0.56,
  chain: 0.65,
  turn: 1.0,
  win: 1.26,
  lose: 2.02,
  equip: 0.73,
  loot: 0.6,
  coin: 1.46,
};

export const BGM_TARGET_DB = -30;

/** 再現性のあるノイズ（測定が毎回同じ結果になるよう疑似乱数） */
export function makeNoise(ctx: BaseAudioContext, seconds = 2): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  let s = 123456789;
  for (let i = 0; i < d.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    d[i] = s / 2147483648 - 1;
  }
  return buf;
}

class Voice {
  constructor(private ctx: BaseAudioContext, private out: AudioNode, private noiseBuf: AudioBuffer, private t0: number) {}

  private env(g: GainNode, t: number, peak: number, dur: number, attack = 0.006): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  tone(type: OscillatorType, f0: number, f1: number, dur: number, peak: number, delay = 0, attack = 0.006): void {
    const t = this.t0 + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    this.env(g, t, peak, dur, attack);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** ノイズバースト。f1 を指定するとフィルタ周波数をスイープ（ウーシュ音など） */
  burst(dur: number, freq: number, q: number, peak: number, type: BiquadFilterType = 'bandpass', delay = 0, f1?: number, attack = 0.006): void {
    const t = this.t0 + delay;
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t, peak, dur, attack);
    n.connect(f).connect(g).connect(this.out);
    n.start(t, 0, dur + 0.05);
  }
}

/** 効果音を合成して out に接続する。t0 は開始時刻（秒）。 */
export function synthSfx(ctx: BaseAudioContext, dest: AudioNode, noise: AudioBuffer, kind: SfxKind, t0 = ctx.currentTime): void {
  const trim = ctx.createGain();
  trim.gain.value = TRIM[kind];
  trim.connect(dest);
  const v = new Voice(ctx, trim, noise, t0);
  switch (kind) {
    case 'hover': v.tone('sine', 1500, 1500, 0.035, 0.12); break;
    case 'click': v.tone('triangle', 660, 880, 0.08, 0.4); break;
    case 'select':
      v.tone('triangle', 520, 520, 0.09, 0.4);
      v.tone('triangle', 780, 780, 0.14, 0.4, 0.07);
      break;
    case 'skill': // 物理スキル: 風切り + 重い踏み込み
      v.burst(0.16, 500, 1.2, 0.5, 'bandpass', 0, 2600, 0.03);
      v.tone('sine', 150, 42, 0.3, 0.9, 0.1);
      v.burst(0.1, 420, 0.8, 0.5, 'lowpass', 0.1);
      break;
    case 'magic': // 魔法詠唱: 上昇音 + きらめき
      v.tone('sine', 380, 1500, 0.34, 0.5);
      v.tone('triangle', 760, 3000, 0.34, 0.16, 0.02);
      v.burst(0.3, 3500, 1.5, 0.35, 'highpass', 0.05, undefined, 0.08);
      break;
    case 'enemyHit': // 被弾(敵): 打撃 + 破裂
      v.tone('sine', 190, 48, 0.28, 0.9);
      v.tone('square', 320, 100, 0.14, 0.2);
      v.burst(0.12, 1800, 0.9, 0.4, 'bandpass');
      break;
    case 'hit': // 被弾(味方): 鈍く重い
      v.tone('sawtooth', 170, 45, 0.28, 0.5);
      v.tone('sine', 110, 40, 0.3, 0.8);
      v.burst(0.2, 700, 0.7, 0.7, 'lowpass');
      break;
    case 'block': // 金属音
      v.tone('square', 1180, 1170, 0.18, 0.2);
      v.tone('triangle', 1770, 1760, 0.32, 0.3);
      v.tone('sine', 2650, 2640, 0.4, 0.2);
      v.burst(0.05, 5000, 1, 0.3, 'highpass');
      break;
    case 'heal': [660, 880, 1320].forEach((f, i) => v.tone('sine', f, f, 0.45, 0.4, i * 0.09, 0.02)); break;
    case 'break': // ガラスが砕ける音 + 重低音
      v.burst(0.55, 4500, 0.6, 0.5, 'highpass');
      v.tone('square', 900, 110, 0.45, 0.25);
      v.tone('sine', 80, 28, 0.9, 0.9);
      v.tone('triangle', 2400, 600, 0.35, 0.2, 0.02);
      break;
    case 'chain': // 溜め → 大爆発 → 上昇アルペジオ
      v.tone('sawtooth', 100, 900, 0.45, 0.35, 0, 0.15);
      v.burst(0.45, 300, 0.8, 0.5, 'bandpass', 0, 3000, 0.2);
      v.tone('sine', 70, 24, 1.3, 0.9, 0.42);
      v.burst(0.8, 1800, 0.5, 0.5, 'bandpass', 0.42);
      v.tone('square', 250, 60, 0.45, 0.25, 0.42);
      [523, 784, 1047, 1568].forEach((f, i) => v.tone('triangle', f, f, 0.55, 0.3, 0.5 + i * 0.08));
      break;
    case 'turn': v.tone('triangle', 330, 495, 0.2, 0.4); v.tone('triangle', 495, 660, 0.25, 0.35, 0.12); break;
    case 'win': [523, 659, 784, 1047].forEach((f, i) => v.tone('triangle', f, f, 0.4, 0.4, i * 0.14, 0.02)); break;
    case 'lose': [392, 330, 262, 196].forEach((f, i) => v.tone('sawtooth', f, f * 0.98, 0.55, 0.25, i * 0.22, 0.03)); break;
    case 'equip': // 金属が噛み合う音
      v.tone('triangle', 2400, 2300, 0.12, 0.3);
      v.tone('sine', 3200, 3100, 0.2, 0.2, 0.03);
      v.burst(0.06, 4000, 1.2, 0.4, 'highpass');
      v.tone('sine', 200, 90, 0.1, 0.4, 0.02);
      break;
    case 'loot': [1046, 1318, 1568, 2093].forEach((f, i) => v.tone('sine', f, f, 0.35, 0.3, i * 0.07, 0.01)); break;
    case 'coin':
      v.tone('square', 1320, 1320, 0.07, 0.12);
      v.tone('square', 1760, 1760, 0.22, 0.12, 0.06);
      break;
  }
}

export type BgmMood = 'calm' | 'battle';
const PENTATONIC = [220, 261.63, 329.63, 392, 440, 523.25, 659.25];

/**
 * BGM: 重厚なドローン + 風ノイズ + 稀に鳴る鐘(短調ペンタトニック) + 戦闘時の低い鼓動。
 * ドローン本体は即時に構築し、鐘と鼓動は tick(now) で先読みスケジュールする。
 */
export function createBgm(ctx: BaseAudioContext, dest: AudioNode, noise: AudioBuffer) {
  const bus = ctx.createGain();
  bus.gain.value = 0.055;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 380;
  lp.Q.value = 2;
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.07;
  lfoGain.gain.value = 200;
  lfo.connect(lfoGain).connect(lp.frequency);
  lfo.start();
  for (const [f, det, gain] of [[55, -6, 0.5], [55, 7, 0.5], [82.4, 0, 0.25], [110, 4, 0.18]] as const) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = det;
    const g = ctx.createGain();
    g.gain.value = gain;
    o.connect(g).connect(bus);
    o.start();
  }
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = 41.2;
  const subG = ctx.createGain();
  subG.gain.value = 0.35;
  sub.connect(subG).connect(bus);
  sub.start();
  bus.connect(lp).connect(dest);

  // 風（ゆっくり揺れるバンドパスノイズ）
  const wind = ctx.createBufferSource();
  wind.buffer = noise;
  wind.loop = true;
  const wf = ctx.createBiquadFilter();
  wf.type = 'bandpass';
  wf.frequency.value = 500;
  wf.Q.value = 0.6;
  const wg = ctx.createGain();
  wg.gain.value = 0.006;
  const wl = ctx.createOscillator();
  wl.frequency.value = 0.05;
  const wlg = ctx.createGain();
  wlg.gain.value = 250;
  wl.connect(wlg).connect(wf.frequency);
  wl.start();
  wind.connect(wf).connect(wg).connect(dest);
  wind.start();

  let mood: BgmMood = 'calm';
  let nextBell = 0;
  let nextBeat = 0;
  let step = 0;
  const bellOut = ctx.createGain();
  bellOut.gain.value = 0.35;
  bellOut.connect(dest);

  const bell = (t: number, f: number) => {
    for (const [mul, peak, dur] of [[1, 0.2, 3.2], [2.76, 0.06, 1.6], [5.4, 0.03, 0.8]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(bellOut);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  };
  const thump = (t: number, accent: boolean) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(accent ? 80 : 62, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(accent ? 0.16 : 0.09, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.35);
  };

  return {
    setMood(m: BgmMood): void {
      mood = m;
      const t = ctx.currentTime;
      lp.frequency.cancelScheduledValues(t);
      lp.frequency.setTargetAtTime(m === 'battle' ? 620 : 380, t, 1.2);
    },
    /** 先読みスケジューラ: 定期的に呼ぶ（now = ctx.currentTime） */
    tick(now: number, lookahead = 0.8): void {
      if (nextBell === 0) { nextBell = now + 2; nextBeat = now + 0.5; }
      while (nextBell < now + lookahead) {
        bell(nextBell, PENTATONIC[(Math.random() * PENTATONIC.length) | 0] * (Math.random() < 0.3 ? 2 : 1));
        nextBell += (mood === 'battle' ? 3.5 : 5.5) + Math.random() * 3;
      }
      while (nextBeat < now + lookahead) {
        if (mood === 'battle') thump(nextBeat, step % 4 === 0);
        step++;
        nextBeat += 0.6;
      }
    },
  };
}

// ---------------------------------------------------------------- 測定（オフラインレンダリング）
export interface Measure {
  /** 最大サンプル絶対値 (0..1) */
  peak: number;
  /** 最大100ms窓のRMS (dBFS) */
  loudDb: number;
  /** 有音区間の長さ (秒) */
  seconds: number;
}

function analyze(data: Float32Array, sr: number): Measure {
  let peak = 0;
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]);
    if (a > peak) peak = a;
    if (a > 0.002) last = i;
  }
  const win = Math.floor(sr * 0.1);
  let best = 0;
  for (let s = 0; s + win <= data.length; s += Math.floor(win / 4)) {
    let sum = 0;
    for (let i = s; i < s + win; i++) sum += data[i] * data[i];
    best = Math.max(best, sum / win);
  }
  return { peak, loudDb: 10 * Math.log10(best + 1e-12), seconds: last / sr };
}

/** 効果音を無音の出力へオフラインで描画して実測する（コンプレッサー前の素の値） */
export async function measureSfx(kind: SfxKind): Promise<Measure> {
  const sr = 44100;
  const ctx = new OfflineAudioContext(1, sr * 3, sr);
  synthSfx(ctx, ctx.destination, makeNoise(ctx), kind, 0);
  const buf = await ctx.startRendering();
  return analyze(buf.getChannelData(0), sr);
}

/** BGMのドローン床を実測（最後の3秒） */
export async function measureBgm(mood: BgmMood = 'calm'): Promise<Measure> {
  const sr = 44100;
  const ctx = new OfflineAudioContext(1, sr * 6, sr);
  const bgm = createBgm(ctx, ctx.destination, makeNoise(ctx));
  bgm.setMood(mood);
  const buf = await ctx.startRendering();
  return analyze(buf.getChannelData(0).slice(sr * 3), sr);
}
