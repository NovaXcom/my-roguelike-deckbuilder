import type { Rng } from './rng';
import type { RunMods } from './types';

/** ランごとの特殊条件「今回の旅」。長所と短所がセットで、ビルドの方向性を決める。 */
export const RUN_MODS: RunMods[] = [
  { id: 'fire', name: '炎の旅', text: '火属性ダメージ+30% / 氷スキルの疲労+1', elementMult: { fire: 1.3 }, elementCdPlus: { ice: 1 } },
  { id: 'ice', name: '氷の旅', text: '氷属性ダメージ+30% / 火スキルの疲労+1', elementMult: { ice: 1.3 }, elementCdPlus: { fire: 1 } },
  { id: 'thunder', name: '雷の旅', text: '雷属性ダメージ+30% / 回復スキルの疲労+1', elementMult: { thunder: 1.3 }, healCdPlus: 1 },
  { id: 'crush', name: '砕きの旅', text: 'ブレイク力+50% / 敵HP+20%', breakMult: 1.5, enemyHpMult: 1.2 },
  { id: 'iron', name: '鉄の旅', text: 'ガード量+50% / 敵攻撃力+15%', guardMult: 1.5, enemyAtkMult: 1.15 },
  { id: 'greed', name: '欲の旅', text: '獲得ゴールド+50% / 敵攻撃力+20%', goldMult: 1.5, enemyAtkMult: 1.2 },
];

export const modById = (id: string): RunMods | null => RUN_MODS.find((m) => m.id === id) ?? null;

/** 出発前に提示する3択 */
export function rollModChoices(rng: Rng, n = 3): RunMods[] {
  const pool = [...RUN_MODS];
  const out: RunMods[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(rng.int(pool.length), 1)[0]);
  return out;
}
