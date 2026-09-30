export type SoundType = 'bgm' | 'jingle' | 'se';
/** variants: number of files named `<id>_1..<id>_n` (1 = single file named `<id>`). */
export interface SoundDef { id: string; type: SoundType; loop: boolean; variants: number }

/** Mirrors scripts/audio-manifest.json (checked by tests/audio.test.ts). Every id has a synth fallback. */
export const SOUNDS: SoundDef[] = [
  { id: 'bgm_town', type: 'bgm', loop: true, variants: 1 },
  { id: 'bgm_map', type: 'bgm', loop: true, variants: 1 },
  { id: 'bgm_battle', type: 'bgm', loop: true, variants: 1 },
  { id: 'bgm_boss', type: 'bgm', loop: true, variants: 1 },
  { id: 'jg_win', type: 'jingle', loop: false, variants: 1 },
  { id: 'jg_clear', type: 'jingle', loop: false, variants: 1 },
  { id: 'jg_lose', type: 'jingle', loop: false, variants: 1 },
  { id: 'jg_legendary', type: 'jingle', loop: false, variants: 1 },
  { id: 'atk_slash', type: 'se', loop: false, variants: 3 },
  { id: 'atk_bash', type: 'se', loop: false, variants: 1 },
  { id: 'atk_heavy', type: 'se', loop: false, variants: 1 },
  { id: 'mag_cast_fire', type: 'se', loop: false, variants: 1 },
  { id: 'mag_cast_ice', type: 'se', loop: false, variants: 1 },
  { id: 'mag_cast_thunder', type: 'se', loop: false, variants: 1 },
  { id: 'mag_hit_fire', type: 'se', loop: false, variants: 1 },
  { id: 'mag_hit_ice', type: 'se', loop: false, variants: 1 },
  { id: 'mag_hit_thunder', type: 'se', loop: false, variants: 1 },
  { id: 'sup_guard', type: 'se', loop: false, variants: 1 },
  { id: 'sup_heal', type: 'se', loop: false, variants: 1 },
  { id: 'sup_taunt', type: 'se', loop: false, variants: 1 },
  { id: 'hit_enemy', type: 'se', loop: false, variants: 3 },
  { id: 'hit_weak', type: 'se', loop: false, variants: 1 },
  { id: 'hit_resist', type: 'se', loop: false, variants: 1 },
  { id: 'hit_party_s', type: 'se', loop: false, variants: 2 },
  { id: 'hit_party_l', type: 'se', loop: false, variants: 1 },
  { id: 'hit_blocked', type: 'se', loop: false, variants: 1 },
  { id: 'fx_break', type: 'se', loop: false, variants: 1 },
  { id: 'fx_chain', type: 'se', loop: false, variants: 1 },
  { id: 'en_slime', type: 'se', loop: false, variants: 1 },
  { id: 'en_skeleton', type: 'se', loop: false, variants: 1 },
  { id: 'en_golem', type: 'se', loop: false, variants: 1 },
  { id: 'en_dragon_claw', type: 'se', loop: false, variants: 1 },
  { id: 'en_dragon_breath', type: 'se', loop: false, variants: 1 },
  { id: 'die_large', type: 'se', loop: false, variants: 1 },
  { id: 'die_boss', type: 'se', loop: false, variants: 1 },
  { id: 'party_down', type: 'se', loop: false, variants: 1 },
  { id: 'deny', type: 'se', loop: false, variants: 1 },
  { id: 'ui_click', type: 'se', loop: false, variants: 3 },
  { id: 'ui_select', type: 'se', loop: false, variants: 1 },
  { id: 'ui_cancel', type: 'se', loop: false, variants: 1 },
  { id: 'map_battle', type: 'se', loop: false, variants: 1 },
  { id: 'chest_open', type: 'se', loop: false, variants: 1 },
  { id: 'coin', type: 'se', loop: false, variants: 1 },
];

/** File keys (as named in the manifest / on disk) for a sound. */
export function fileKeys(def: SoundDef): string[] {
  return def.variants <= 1 ? [def.id] : Array.from({ length: def.variants }, (_, i) => `${def.id}_${i + 1}`);
}

/** Basename (without extension) -> URL of every audio file present in src/assets/audio. */
export function collectAudioUrls(modules: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, url] of Object.entries(modules)) {
    const m = /([^/\\]+)\.(mp3|wav)$/i.exec(path);
    if (m) out[m[1]] = url;
  }
  return out;
}
