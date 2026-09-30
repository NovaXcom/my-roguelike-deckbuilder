import { describe, it, expect, vi } from 'vitest';
import { AudioManager, type SoundBackend } from '../src/audio/AudioManager';
import { collectAudioUrls } from '../src/audio/audioIds';

function fakeCtx() {
  const osc = () => ({ type: '', frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    detune: { value: 0 }, connect: (n: unknown) => n, start: vi.fn(), stop: vi.fn() });
  const gain = () => ({ gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: (n: unknown) => n, disconnect: vi.fn() });
  return { currentTime: 0, destination: {}, createOscillator: vi.fn(osc), createGain: vi.fn(gain) } as unknown as AudioContext;
}

describe('collectAudioUrls', () => {
  it('maps basenames and ignores other files', () => {
    expect(collectAudioUrls({ '../assets/audio/se_slash.wav': 'a', '../assets/audio/x.txt': 'b' })).toEqual({ se_slash: 'a' });
  });
});

describe('AudioManager', () => {
  it('plays the file when loaded', () => {
    const play = vi.fn(() => ({ stop: vi.fn() }));
    const ctx = fakeCtx();
    const b: SoundBackend = { cacheHas: () => true, play, context: () => ctx };
    new AudioManager(b, new Set(['se_slash'])).play('se_slash');
    expect(play).toHaveBeenCalledWith('se_slash', false);
    expect(ctx.createOscillator).not.toHaveBeenCalled();
  });

  it('falls back to synth when not loaded', () => {
    const play = vi.fn();
    const ctx = fakeCtx();
    new AudioManager({ cacheHas: () => false, play, context: () => ctx }, new Set()).play('se_slash');
    expect(play).not.toHaveBeenCalled();
    expect(ctx.createOscillator).toHaveBeenCalled();
  });

  it('never throws and can stop looping synth bgm', () => {
    const ctx = fakeCtx();
    const m = new AudioManager({ cacheHas: () => false, play: () => null, context: () => ctx }, new Set());
    expect(() => { m.play('bgm_dungeon'); m.stop('bgm_dungeon'); }).not.toThrow();
    const bad = new AudioManager({ cacheHas: () => true, play: () => { throw new Error('x'); }, context: () => null }, new Set(['se_slash']));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => bad.play('se_slash')).not.toThrow();
  });
});
