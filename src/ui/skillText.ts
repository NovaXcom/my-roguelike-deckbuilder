import type { SkillDef } from '../core/types';

/**
 * スキルの要点を短い行にまとめる（コンパクト表示用: 長い説明文の代わりに大きな文字で表示）。
 * 例: シールドバッシュ → ['威力 6', 'ゲージ -22']
 */
export function skillSummary(sk: SkillDef): string[] {
  const out: string[] = [];
  if (sk.damage) out.push(`威力 ${sk.damage}`);
  if (sk.breakPower) out.push(`ゲージ -${sk.breakPower}`);
  if (sk.guardSelf && sk.guardAlly) out.push(`ガード ${sk.guardSelf}/${sk.guardAlly}`);
  else if (sk.guardSelf) out.push(`ガード ${sk.guardSelf}`);
  else if (sk.guardAlly) out.push(`味方ガード ${sk.guardAlly}`);
  if (sk.healAll) out.push(`全体回復 ${sk.healAll}`);
  if (sk.taunt) out.push('挑発');
  return out;
}
