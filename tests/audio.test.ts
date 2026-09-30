import { describe, it, expect, vi } from 'vitest';
import { AudioManager, type SoundBackend } from '../src/audio/AudioManager';
import { collectAudioUrls, fileKeys, SOUNDS } from '../src/audio/audioIds';
import { readFileSync } from 'node:fs';
import { playSynth } from '../src/audio/synth';

function fakeCtx() {
  const osc = () => ({ type: '', frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    detune: { value: 0 }, connect: (n: unknown) => n, start: vi.fn(), stop: vi.fn() });
  const gain = () => ({ gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: (n: unknown) => n, disconnect: vi.fn() });
  const src = () => ({ buffer: null, connect: (n: unknown) => n, start: vi.fn() });
  const filt = () => ({ type: '', frequency: { value: 0 }, connect: (n: unknown) => n });
  return { currentTime: 0, sampleRate: 8000, destination: {}, createOscillator: vi.fn(osc), createGain: vi.fn(gain),
    createBuffer: () => ({ getChannelData: () => new Float32Array(10) }), createBufferSource: src, createBiquadFilter: filt } as unknown as AudioContext;
}

describe('collectAudioUrls', () => {
  it('maps basenames and ignores other files', () => {
    expect(collectAudioUrls({ '../assets/audio/atk_slash_1.wav': 'a', '../assets/audio/x.txt': 'b' })).toEqual({ atk_slash_1: 'a' });
  });
});

describe('AudioManager', () => {
  it('plays the file when loaded', () => {
    const play = vi.fn(() => ({ stop: vi.fn() }));
    const ctx = fakeCtx();
    const b: SoundBackend = { cacheHas: () => true, play, context: () => ctx };
    new AudioManager(b, new Set(['hit_blocked'])).play('hit_blocked');
    expect(play).toHaveBeenCalledWith('hit_blocked', false);
    expect(ctx.createOscillator).not.toHaveBeenCalled();
  });

  it('falls back to synth when not loaded', () => {
    const play = vi.fn();
    const ctx = fakeCtx();
    new AudioManager({ cacheHas: () => false, play, context: () => ctx }, new Set()).play('hit_blocked');
    expect(play).not.toHaveBeenCalled();
    expect(ctx.createOscillator).toHaveBeenCalled();
  });

  it('never throws and can stop looping synth bgm', () => {
    const ctx = fakeCtx();
    const m = new AudioManager({ cacheHas: () => false, play: () => null, context: () => ctx }, new Set());
    expect(() => { m.play('bgm_map'); m.stop('bgm_map'); }).not.toThrow();
    const bad = new AudioManager({ cacheHas: () => true, play: () => { throw new Error('x'); }, context: () => null }, new Set(['hit_blocked']));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => bad.play('hit_blocked')).not.toThrow();
  });
});

describe('variants', () => {
  it('picks only loaded variants and avoids immediate repeats', () => {
    const play = vi.fn(() => ({ stop: vi.fn() }));
    const m = new AudioManager({ cacheHas: () => true, play, context: () => null }, new Set(['atk_slash_1', 'atk_slash_2']));
    for (let i = 0; i < 20; i++) m.play('atk_slash');
    const keys = play.mock.calls.map((c) => (c as unknown[])[0]);
    expect(new Set(keys)).toEqual(new Set(['atk_slash_1', 'atk_slash_2']));
    keys.slice(1).forEach((k, i) => expect(k).not.toBe(keys[i]));
  });
});

describe('manifest sync', () => {
  const manifest = JSON.parse(readFileSync('scripts/audio-manifest.json', 'utf8')) as
    { assets: { id: string; type: string; loop: boolean; path: string }[] };
  it('audioIds files match manifest ids/types/loops exactly', () => {
    const fromCode = SOUNDS.flatMap((d) => fileKeys(d).map((k) => `${k}|${d.type}|${d.loop}`)).sort();
    const fromJson = manifest.assets.map((a) => `${a.id}|${a.type}|${a.loop}`).sort();
    expect(fromCode).toEqual(fromJson);
  });
  it('has the minimum set: 4 bgm, 4 jingles, ~35 se', () => {
    expect(SOUNDS.filter((d) => d.type === 'bgm')).toHaveLength(4);
    expect(SOUNDS.filter((d) => d.type === 'jingle')).toHaveLength(4);
    expect(SOUNDS.filter((d) => d.type === 'se')).toHaveLength(35);
  });
  it('every sound has a synth fallback that does not throw', () => {
    const ctx = fakeCtx();
    for (const d of SOUNDS) expect(() => playSynth(d.id, ctx, ctx.destination)).not.toThrow();
  });
  it('sizes stay within budget (se as wav, music as mp3)', () => {
    expect(manifest.assets.filter((a) => a.type !== 'se').every((a) => a.path.endsWith('.mp3'))).toBe(true);
    expect(manifest.assets.filter((a) => a.type === 'se').every((a) => a.path.endsWith('.wav'))).toBe(true);
  });
});
