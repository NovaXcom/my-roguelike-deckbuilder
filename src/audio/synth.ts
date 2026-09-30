/** Programmatic Web Audio fallback sounds. Each returns a stop() function. */
export type Stop = () => void;

function tone(ctx: AudioContext, dest: AudioNode, type: OscillatorType, f0: number, f1: number,
  start: number, dur: number, vol: number): void {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, start);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), start + dur);
  g.gain.setValueAtTime(vol, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(dest);
  o.start(start);
  o.stop(start + dur + 0.05);
}

function drone(ctx: AudioContext, dest: AudioNode, freqs: number[], vol: number): Stop {
  const g = ctx.createGain();
  g.gain.value = vol;
  g.connect(dest);
  const oscs = freqs.map((f, i) => {
    const o = ctx.createOscillator();
    o.type = i % 2 ? 'sawtooth' : 'sine';
    o.frequency.value = f;
    o.detune.value = (i - 1) * 6;
    o.connect(g);
    o.start();
    return o;
  });
  return () => { oscs.forEach((o) => { try { o.stop(); } catch { /* already stopped */ } }); g.disconnect(); };
}

function noise(ctx: AudioContext, dest: AudioNode, start: number, dur: number, vol: number, cutoff: number): void {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(dest);
  src.start(start);
}

function arp(ctx: AudioContext, dest: AudioNode, notes: number[], step: number, dur: number, vol: number): void {
  notes.forEach((f, i) => tone(ctx, dest, 'triangle', f, f, ctx.currentTime + i * step, dur, vol));
}

const MAJOR = [523, 659, 784, 1046];
const MINOR = [440, 349, 294, 220];

/** Category fallback by id prefix so every manifest id has some sound without a file. */
export function playSynth(id: string, ctx: AudioContext, dest: AudioNode): Stop | null {
  const t = ctx.currentTime;
  if (id === 'bgm_battle' || id === 'bgm_boss') return drone(ctx, dest, [65.4, 98, 130.8, 196], id === 'bgm_boss' ? 0.18 : 0.14);
  if (id.startsWith('bgm_')) return drone(ctx, dest, [55, 82.4, 110.5], 0.12);
  if (id === 'jg_lose') { arp(ctx, dest, MINOR, 0.4, 0.8, 0.2); return null; }
  if (id.startsWith('jg_')) { arp(ctx, dest, MAJOR, 0.15, 0.5, 0.2); return null; }
  if (id.startsWith('ui_') || id === 'deny' || id === 'turn_start') {
    tone(ctx, dest, 'square', id === 'deny' ? 120 : id === 'ui_cancel' ? 300 : 600, id === 'ui_cancel' ? 200 : 800, t, 0.08, 0.08);
    return null;
  }
  if (id.startsWith('atk_') || id === 'en_dragon_claw') { noise(ctx, dest, t, 0.2, 0.3, 4000); tone(ctx, dest, 'sawtooth', 900, 150, t, 0.12, 0.15); return null; }
  if (id.startsWith('hit_') || id === 'party_down') { noise(ctx, dest, t, 0.12, 0.35, 1500); tone(ctx, dest, 'square', 160, 60, t, 0.12, 0.2); return null; }
  if (id.startsWith('mag_cast')) { tone(ctx, dest, 'sine', 300, 1200, t, 0.6, 0.15); return null; }
  if (id.startsWith('mag_hit') || id.startsWith('die_') || id === 'fx_break' || id === 'en_dragon_breath') { noise(ctx, dest, t, 0.5, 0.4, 2500); tone(ctx, dest, 'sawtooth', 120, 40, t, 0.5, 0.3); return null; }
  if (id === 'fx_chain') { tone(ctx, dest, 'sawtooth', 200, 1400, t, 0.6, 0.2); noise(ctx, dest, t + 0.6, 0.5, 0.45, 3000); return null; }
  if (id.startsWith('en_')) { noise(ctx, dest, t, 0.3, 0.3, 1200); tone(ctx, dest, 'sawtooth', 200, 80, t, 0.3, 0.2); return null; }
  if (id.startsWith('sup_') || id === 'coin' || id === 'loot_legendary') { arp(ctx, dest, [880, 1320], 0.08, 0.25, 0.15); return null; }
  if (id === 'chest_open' || id === 'map_battle') { tone(ctx, dest, 'triangle', 200, 500, t, 0.5, 0.2); return null; }
  tone(ctx, dest, 'square', 440, 440, t, 0.1, 0.12);
  return null;
}
