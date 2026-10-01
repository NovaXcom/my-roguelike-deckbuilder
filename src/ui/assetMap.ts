import type { Element } from '../core/types';

/**
 * ゲームの状況 → 画像キーの対応表（Phaser非依存の純関数。テスト対象）。
 * キーは art/assets.json / src/assets/img/*.webp と同名。画像が無い場合は呼び出し側が図形描画にフォールバックする。
 */

/** スキルID → アイコン（スキルごとに1キー。元絵が足りないスキルは同系統の絵を流用している） */
/** 専用アイコンが無いカードは近い既存アイコンを流用する */
const SKILL_ICON_ALIAS: Record<string, string> = {
  defend: 'icon_skill_guardian', wait: 'icon_ui_wait', focus_mana: 'icon_status_charge',
  power_strike: 'icon_skill_slash', iron_wall: 'icon_skill_guardian', rally: 'icon_skill_provoke', whirlwind: 'icon_skill_cleave',
  crush: 'icon_skill_shield_bash', flame_burst: 'icon_skill_firebolt', chain_bolt: 'icon_skill_thunder', arcane_ward: 'icon_skill_guardian',
  chase: 'icon_status_intent_attack', enchant: 'icon_status_focus', convert: 'icon_status_freeze', counter: 'icon_status_guard',
  barrier: 'icon_skill_guardian', unison: 'icon_status_charge',
  frost_nova: 'icon_skill_blizzard', overcharge: 'icon_skill_thunderstorm',
};
export const skillIconKey = (skillId: string): string => SKILL_ICON_ALIAS[skillId] ?? `icon_skill_${skillId}`;

/** 装備 → アイコン（固有の絵がある装備だけ個別、他は 部位×レア度） */
export function equipIconKey(item: { templateId: string; slot: string; rarity: string }): string {
  if (item.templateId === 'dragon_claw') return 'icon_equip_dragon_claw';
  return `icon_equip_${item.slot}_${item.rarity}`;
}

export const elementIconKey = (el: Element): string => `icon_element_${el}`;

export function nodeIconKey(type: string, state: 'normal' | 'visited' | 'current' = 'normal'): string {
  if (state === 'visited') return 'icon_node_visited';
  if (state === 'current') return 'icon_node_current';
  return `icon_node_${type}`;
}

/** 敵ID → スプライト。null は図形描画 */
const ENEMY_SPRITE: Record<string, string> = {
  slime: 'enemy_slime', bat: 'enemy_bat', skeleton: 'enemy_skeleton', golem: 'enemy_golem', dragon: 'enemy_dragon',
};
export const enemySpriteKey = (enemyId: string): string | null => ENEMY_SPRITE[enemyId] ?? null;

/** 戦闘での表示の高さ(px, 論理座標)。行動予告アイコンと重ならないよう背の高い敵は小さめ */
export const ENEMY_DISPLAY_H: Record<string, number> = { slime: 100, bat: 150, skeleton: 185, golem: 215, dragon: 235 };
export const HERO_DISPLAY_H = 235;

export type HeroPose = 'idle' | 'hit' | 'attack' | 'down';
/** 役職 → 戦闘スプライト（ポーズ別。無ければ図形描画/ポーズ切替なし） */
export const HERO_SPRITE: Record<string, Record<HeroPose, string> | undefined> = {
  knight: { idle: 'char_knight_idle', hit: 'char_knight_hit', attack: 'char_knight_attack', down: 'char_knight_down' },
  elementalist: { idle: 'char_elementalist_idle', hit: 'char_elementalist_hit', attack: 'char_elementalist_attack', down: 'char_elementalist_down' },
};

/** 背景: 場面ごとの画像キー（null は図形描画）と暗くする度合い */
export function bgKeyFor(sceneKey: string, opts: { boss?: boolean; row?: number; enemyId?: string } = {}): string | null {
  switch (sceneKey) {
    case 'Title': return 'bg_title';
    case 'Town': case 'Party': case 'Shop': case 'Loot': case 'Gear': case 'Chest': case 'RunEnd': return 'bg_base';
    case 'Rest': return 'bg_battle_dungeon';
    case 'Battle':
      if (opts.boss) return 'bg_battle_boss';
      return (opts.row ?? 0) >= 3 || opts.enemyId === 'skeleton' || opts.enemyId === 'golem' ? 'bg_battle_crypt' : 'bg_battle_dungeon';
    case 'Map': return 'bg_map';
    default: return null;
  }
}

export function bgDim(sceneKey: string): number {
  switch (sceneKey) {
    case 'Title': return 0.1;
    case 'Battle': return 0.2;
    case 'Town': return 0.35;
    case 'Rest': return 0.45;
    case 'Map': return 0.6;
    default: return 0.55; // 文字中心の画面は読みやすさ優先
  }
}
