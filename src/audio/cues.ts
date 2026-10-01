import type { Element, EnemyIntent, SkillDef } from '../core/types';
import type { ManifestId } from './ids';

/** ゲーム状況 → 鳴らす音IDの対応（純関数。Phaser非依存でテスト可能） */
export interface Cue {
  id: ManifestId;
  /** 再生速度（1=そのまま）。専用音が無い敵の流用に使う */
  rate?: number;
}

/** スキル使用開始時の音。補助スキルはイベント側(ガード/回復/挑発)で鳴るので null */
export function castCue(skill: SkillDef): Cue | null {
  if (skill.kind === 'physical') {
    if (skill.id === 'slash') return { id: 'atk_slash' };
    if (skill.id === 'shield_bash') return { id: 'atk_bash' };
    return { id: 'atk_heavy' };
  }
  if (skill.kind === 'magic') return { id: castMagicId(skill.element) };
  return null;
}

function castMagicId(el: Element): ManifestId {
  return el === 'ice' ? 'mag_cast_ice' : el === 'thunder' ? 'mag_cast_thunder' : 'mag_cast_fire';
}

/** 敵への命中音（属性ヒット＋弱点/耐性の強調を重ねる） */
export function impactCues(e: { element: Element; weak: boolean; resist: boolean }): Cue[] {
  const out: Cue[] = [];
  if (e.element === 'fire') out.push({ id: 'mag_hit_fire' });
  else if (e.element === 'ice') out.push({ id: 'mag_hit_ice' });
  else if (e.element === 'thunder') out.push({ id: 'mag_hit_thunder' });
  if (e.weak) out.push({ id: 'hit_weak' });
  else if (e.resist) out.push({ id: 'hit_resist' });
  else if (e.element === 'none') out.push({ id: 'hit_enemy' });
  return out;
}

/** 味方が被弾したときの音 */
export function hurtCue(amount: number): Cue {
  if (amount <= 0) return { id: 'hit_blocked' };
  return { id: amount >= 12 ? 'hit_party_l' : 'hit_party_s' };
}

/** 敵の攻撃モーションの音。専用音が無い敵(コウモリ)は斬撃音を高速再生で流用 */
export function enemyAttackCue(enemyId: string, intent: EnemyIntent): Cue | null {
  switch (enemyId) {
    case 'slime': return { id: 'en_slime' };
    case 'skeleton': return { id: 'en_skeleton' };
    case 'golem': return { id: 'en_golem' };
    case 'dragon': return { id: intent.target === 'all' ? 'en_dragon_breath' : 'en_dragon_claw' };
    case 'bat': return { id: 'atk_slash', rate: 1.5 };
    default: return null;
  }
}

export function deathCue(enemyId: string): Cue {
  return { id: enemyId === 'dragon' ? 'die_boss' : 'die_large' };
}

/** 場面 → BGM。null は無音(ジングルに任せる) */
export type BgmId = 'bgm_town' | 'bgm_map' | 'bgm_battle' | 'bgm_boss';
export function bgmForScene(key: string, opts: { boss?: boolean } = {}): BgmId | null {
  switch (key) {
    case 'Title': case 'Town': case 'Party': return 'bgm_town';
    case 'Map': case 'Chest': case 'Rest': case 'Shop': case 'Gear': case 'Skills': case 'Deck': case 'CardReward': case 'Loot': return 'bgm_map';
    case 'Battle': return opts.boss ? 'bgm_boss' : 'bgm_battle';
    default: return null;
  }
}
