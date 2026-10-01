export interface Scroll {
  id: string;
  name: string;
  desc: string;
}

export interface Mods {
  dmg: number;
  pipsMax: number;
  parryWindow: number;
  dashDist: number;
  vamp: number;
  waves: boolean;
  thunder: boolean;
  armor: number;
  echo: boolean;
  pipRegen: number;
  reach: number;
}

export const SCROLLS: Scroll[] = [
  { id: 'edge', name: '鋭刃  SHARP EDGE', desc: '与ダメージ +20%' },
  { id: 'tsubame', name: '燕返し  TSUBAME', desc: '斬撃ゲージの最大 +1' },
  { id: 'calm', name: '明鏡止水  CALM MIND', desc: 'パリィの受付 +0.09秒' },
  { id: 'wind', name: '疾風  WIND STEP', desc: '居合ダッシュの距離 +35%' },
  { id: 'blood', name: '血月  BLOOD MOON', desc: '敵を倒すとHP +6' },
  { id: 'whirl', name: '飛燕  FLYING SWALLOW', desc: '3連撃目が飛ぶ斬撃を放つ' },
  { id: 'thunder', name: '雷光  THUNDER', desc: 'パリィ成功で画面の敵に雷' },
  { id: 'iron', name: '鉄壁  IRON SKIN', desc: '被ダメージ −20%' },
  { id: 'echo', name: '残像  ZANZO', desc: '居合ダッシュが残像で2回斬る' },
  { id: 'flow', name: '気流  KI FLOW', desc: '斬撃ゲージの回復 ×1.7' },
  { id: 'reach', name: '長刀  LONG BLADE', desc: '斬撃のリーチ +0.7m' },
];

export function computeMods(ids: string[]): Mods {
  const has = (i: string) => ids.includes(i);
  return {
    dmg: has('edge') ? 1.2 : 1,
    pipsMax: has('tsubame') ? 1 : 0,
    parryWindow: has('calm') ? 0.09 : 0,
    dashDist: has('wind') ? 1.35 : 1,
    vamp: has('blood') ? 6 : 0,
    waves: has('whirl'),
    thunder: has('thunder'),
    armor: has('iron') ? 0.2 : 0,
    echo: has('echo'),
    pipRegen: has('flow') ? 1.7 : 1,
    reach: has('reach') ? 0.7 : 0,
  };
}
