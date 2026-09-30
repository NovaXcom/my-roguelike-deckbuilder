import type { Element, EnemyDef, MemberDef, Role, SkillDef } from './types';

const sk = (d: SkillDef): [string, SkillDef] => [d.id, d];

export const SKILLS: Record<string, SkillDef> = Object.fromEntries([
  // --- ナイト ---
  sk({ id: 'slash', name: '斬撃', kind: 'physical', element: 'none', cooldown: 0, damage: 8, breakPower: 8,
    text: '8ダメージ。シールドゲージ-8。' }),
  sk({ id: 'shield_bash', name: 'シールドバッシュ', kind: 'physical', element: 'none', cooldown: 2, damage: 6, breakPower: 22,
    text: '6ダメージ。シールドゲージ-22。' }),
  sk({ id: 'provoke', name: '挑発の構え', kind: 'support', element: 'none', cooldown: 3, guardSelf: 10, taunt: true,
    text: '自分にガード10。敵の攻撃を自分に引きつける。' }),
  sk({ id: 'guardian', name: '守護の盾', kind: 'support', element: 'none', cooldown: 2, guardSelf: 6, guardAlly: 10,
    text: '自分にガード6、味方にガード10。' }),
  // --- エレメンタリスト ---
  sk({ id: 'firebolt', name: 'ファイアボルト', kind: 'magic', element: 'fire', cooldown: 0, damage: 7,
    text: '火属性7ダメージ。' }),
  sk({ id: 'ice_lance', name: 'アイスランス', kind: 'magic', element: 'ice', cooldown: 1, damage: 10,
    text: '氷属性10ダメージ。' }),
  sk({ id: 'thunder', name: 'サンダーボルト', kind: 'magic', element: 'thunder', cooldown: 2, damage: 13, breakPower: 10,
    text: '雷属性13ダメージ。シールドゲージ-10。' }),
  sk({ id: 'heal', name: 'ヒール', kind: 'support', element: 'none', cooldown: 3, healAll: 12,
    text: 'パーティ全員のHPを12回復。' }),
]);

export const MEMBERS: Record<Role, MemberDef> = {
  knight: {
    id: 'knight',
    name: 'ナイト',
    title: '前衛 / タンク・物理アタッカー',
    position: '前衛',
    color: 0xd64545,
    maxHp: 90,
    description: 'ヘイトを集めシールドで後衛を守る。武器スキルで敵の体勢を崩し、ブレイクさせる。',
    skills: ['slash', 'shield_bash', 'provoke', 'guardian'],
  },
  elementalist: {
    id: 'elementalist',
    name: 'エレメンタリスト',
    title: '後衛 / 魔法・サポーター',
    position: '後衛',
    color: 0x4a90e2,
    maxHp: 60,
    description: '火・氷・雷を操る。ブレイクした敵に魔法を撃ち込むとチェインが発生する。',
    skills: ['firebolt', 'ice_lance', 'thunder', 'heal'],
  },
};

export const PARTY_ORDER: Role[] = ['knight', 'elementalist'];

export const ENEMIES: Record<string, EnemyDef> = {
  slime: {
    id: 'slime',
    name: 'ジェルスライム',
    maxHp: 80,
    maxShield: 20,
    weak: 'fire',
    resist: 'ice',
    color: 0x7ac47a,
    pattern: [
      { name: '体当たり', value: 8, target: 'front' },
      { name: '溶解液', value: 7, target: 'back' },
      { name: '圧し掛かり', value: 13, target: 'front' },
    ],
  },
};

export const ELEMENT_LABEL: Record<Element, string> = { none: '無', fire: '火', ice: '氷', thunder: '雷' };
export const ELEMENT_COLOR: Record<Element, number> = { none: 0xd8d0c4, fire: 0xff7043, ice: 0x6fd3ff, thunder: 0xffe066 };
