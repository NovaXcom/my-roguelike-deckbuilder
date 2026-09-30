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

export function playSynth(id: string, ctx: AudioContext, dest: AudioNode): Stop | null {
  const t = ctx.currentTime;
  switch (id) {
    case 'bgm_dungeon': return drone(ctx, dest, [55, 82.4, 110.5], 0.12);
    case 'bgm_battle': return drone(ctx, dest, [65.4, 98, 130.8, 196], 0.14);
    case 'se_slash': tone(ctx, dest, 'sawtooth', 1800, 200, t, 0.15, 0.25); return null;
    case 'se_dragon_roar': tone(ctx, dest, 'sawtooth', 140, 45, t, 1.2, 0.4); return null;
    case 'se_level_up': [523, 659, 784, 1046].forEach((f, i) => tone(ctx, dest, 'triangle', f, f, t + i * 0.09, 0.25, 0.2)); return null;
    default: tone(ctx, dest, 'square', 440, 440, t, 0.1, 0.15); return null;
  }
}
