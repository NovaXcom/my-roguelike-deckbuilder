import { SOUNDS, fileKeys, type ManifestId } from './ids';

/**
 * 音量設計: 各音の目標ラウドネス(dBFS)。
 * 効果音・ジングルは「最大100ms窓のRMS」、BGMは「全体RMS」で測る。
 * scripts/measure-audio.cjs が実ファイルを測定し、この目標に合わせた補正値を trims.json に書き出す。
 * 階層: UI < 通常SE < 戦闘SE < ブレイク < チェイン。BGMは戦闘SEより10dB以上小さい。
 */
export const FILE_TARGET_DB: Record<ManifestId, number> = {
  ui_click: -28, ui_select: -26, ui_cancel: -26, deny: -22,
  atk_slash: -16, atk_bash: -15, atk_heavy: -14,
  mag_cast_fire: -18, mag_cast_ice: -18, mag_cast_thunder: -18,
  mag_hit_fire: -15, mag_hit_ice: -15, mag_hit_thunder: -15,
  sup_guard: -19, sup_heal: -21, sup_taunt: -18,
  hit_enemy: -15, hit_weak: -13, hit_resist: -17,
  hit_party_s: -15, hit_party_l: -13, hit_blocked: -19,
  fx_break: -12, fx_chain: -10,
  en_slime: -17, en_skeleton: -17, en_golem: -15, en_dragon_claw: -15, en_dragon_breath: -13,
  die_large: -13, die_boss: -11, party_down: -14,
  map_battle: -20, chest_open: -20, coin: -24,
  jg_win: -17, jg_lose: -17, jg_clear: -15, jg_legendary: -17,
  bgm_town: -28, bgm_map: -28, bgm_battle: -28, bgm_boss: -28,
};

/** ファイルキー(`atk_slash_2`) → マニフェストID(`atk_slash`) */
export function idOfKey(key: string): ManifestId | null {
  for (const def of SOUNDS) if ((fileKeys(def) as string[]).includes(key)) return def.id;
  return null;
}

/** 測定値から補正ゲインを求める。目標に合わせ、ピークが上限を超えないよう頭打ちにする。 */
export function trimFor(measuredDb: number, targetDb: number, peak: number, peakCap = 0.9, maxGain = 4): number {
  const want = 10 ** ((targetDb - measuredDb) / 20);
  const cap = peak > 0 ? peakCap / peak : maxGain;
  return Math.min(want, cap, maxGain);
}
