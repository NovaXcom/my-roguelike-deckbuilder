export type SoundType = 'bgm' | 'se';
export interface SoundDef { id: string; type: SoundType; loop: boolean }

/** Mirrors scripts/audio-manifest.json ids. Synth fallbacks exist for each. */
export const SOUNDS: SoundDef[] = [
  { id: 'bgm_dungeon', type: 'bgm', loop: true },
  { id: 'bgm_battle', type: 'bgm', loop: true },
  { id: 'se_slash', type: 'se', loop: false },
  { id: 'se_dragon_roar', type: 'se', loop: false },
  { id: 'se_level_up', type: 'se', loop: false },
];

/** Basename (without extension) -> URL of every audio file present in src/assets/audio. */
export function collectAudioUrls(modules: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, url] of Object.entries(modules)) {
    const m = /([^/\\]+)\.(mp3|wav)$/i.exec(path);
    if (m) out[m[1]] = url;
  }
  return out;
}
