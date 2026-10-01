export interface Perk {
  id: string;
  name: string;
  desc: string;
}

export interface Mods {
  dmg: number;
  vamp: number;
  perfect: number;
  iframes: number;
  meterGain: number;
  counterBlast: boolean;
  durability: number;
  startWeapon: boolean;
  comboWin: number;
  blast: number;
  blastSafe: boolean;
  throwDmg: number;
  armor: number;
  reach: number;
  maxHp: number;
}

export const PERKS: Perk[] = [
  { id: 'brawler', name: 'BRAWLER', desc: '与ダメージ +20%' },
  { id: 'iron', name: 'IRON BODY', desc: '最大HP +30（その分回復）' },
  { id: 'vamp', name: 'BLOODLUST', desc: '敵を倒すとHP +5 回復' },
  { id: 'sharp', name: 'SHARP EYES', desc: 'パーフェクトカウンターの受付 +0.09秒' },
  { id: 'ghost', name: 'GHOST STEP', desc: '回避の無敵時間 +0.12秒' },
  { id: 'adrenaline', name: 'ADRENALINE', desc: 'RUSHゲージの増加 ×1.6' },
  { id: 'shock', name: 'SHOCKWAVE', desc: 'カウンター成功で周囲の敵も吹き飛ばす' },
  { id: 'hardwood', name: 'HARD WOOD', desc: '武器の耐久 ×2' },
  { id: 'arsenal', name: 'ARSENAL', desc: '各ウェーブ開始時にバットを持っている' },
  { id: 'flow', name: 'FLOW', desc: 'コンボの猶予時間 +60%' },
  { id: 'demolition', name: 'DEMOLITION', desc: '爆発のダメージ ×1.6、自分は爆発で傷つかない' },
  { id: 'wrecking', name: 'WRECKING BALL', desc: '投げた敵のダメージ ×2' },
  { id: 'kevlar', name: 'KEVLAR', desc: '受けるダメージ −15%' },
  { id: 'longlegs', name: 'LONG REACH', desc: '攻撃のリーチ +0.45m' },
];

export function computeMods(ids: string[]): Mods {
  const has = (id: string) => ids.includes(id);
  return {
    dmg: has('brawler') ? 1.2 : 1,
    vamp: has('vamp') ? 5 : 0,
    perfect: has('sharp') ? 0.09 : 0,
    iframes: has('ghost') ? 0.12 : 0,
    meterGain: has('adrenaline') ? 1.6 : 1,
    counterBlast: has('shock'),
    durability: has('hardwood') ? 2 : 1,
    startWeapon: has('arsenal'),
    comboWin: has('flow') ? 1.6 : 1,
    blast: has('demolition') ? 1.6 : 1,
    blastSafe: has('demolition'),
    throwDmg: has('wrecking') ? 2 : 1,
    armor: has('kevlar') ? 0.15 : 0,
    reach: has('longlegs') ? 0.45 : 0,
    maxHp: has('iron') ? 30 : 0,
  };
}
