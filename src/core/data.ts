import type { Element, EnemyDef, MemberDef, Role, SkillDef } from './types';

const sk = (d: SkillDef): [string, SkillDef] => [d.id, d];

export const SKILLS: Record<string, SkillDef> = Object.fromEntries([
  // --- ナイト ---
  sk({ id: 'slash', name: '斬撃', kind: 'physical', element: 'none', cooldown: 0, damage: 8, breakPower: 8,
    conds: [{ when: { kind: 'bleeding' }, then: { damageBonus: 4 }, label: '出血中の敵: ダメージ+4' }],
    text: '8ダメージ。シールドゲージ-8。' }),
  sk({ id: 'shield_bash', name: 'シールドバッシュ', kind: 'physical', element: 'none', cooldown: 2, damage: 6, breakPower: 14,
    conds: [{ when: { kind: 'shieldAtLeast', n: 10 }, then: { breakBonus: 10 }, label: 'シールド10以上の敵: ブレイク力+10' }],
    text: '6ダメージ。シールドゲージ-14。' }),
  sk({ id: 'provoke', name: '挑発の構え', kind: 'support', element: 'none', cooldown: 3, guardSelf: 10, taunt: true,
    text: '自分にガード10。敵の攻撃を自分に引きつける。' }),
  sk({ id: 'guardian', name: '守護の盾', kind: 'support', element: 'none', cooldown: 2, guardSelf: 6, guardAlly: 10,
    text: '自分にガード6、味方にガード10。' }),
  sk({ id: 'defend', name: '防御', kind: 'support', element: 'none', cooldown: 0, guardSelf: 6,
    text: '自分にガード6。' }),
  sk({ id: 'wait', name: '待機', kind: 'support', element: 'none', cooldown: 0, waitEffect: true,
    text: '疲労-1・ガード+5・次のダメージスキルが強化(×1.2・ゲージ-5)。' }),
  sk({ id: 'focus_mana', name: '魔力集中', kind: 'support', element: 'none', cooldown: 1, chargeSelf: true,
    text: '次のダメージスキルが+30%。' }),
  // --- エレメンタリスト ---
  sk({ id: 'firebolt', name: 'ファイアボルト', kind: 'magic', element: 'fire', cooldown: 0, damage: 7,
    conds: [{ when: { kind: 'burning' }, then: { damageBonus: 5 }, label: '火傷中の敵: ダメージ+5' }],
    text: '火属性7ダメージ。' }),
  sk({ id: 'ice_lance', name: 'アイスランス', kind: 'magic', element: 'ice', cooldown: 1, damage: 10,
    conds: [{ when: { kind: 'broken' }, then: { freeze: true }, label: 'ブレイク中の敵: 凍結(復帰時シールド半減)' }],
    text: '氷属性10ダメージ。' }),
  sk({ id: 'thunder', name: 'サンダーボルト', kind: 'magic', element: 'thunder', cooldown: 2, damage: 13, breakPower: 10,
    conds: [{ when: { kind: 'shieldAtMost', n: 12 }, then: { breakBonus: 8 }, label: 'シールド12以下の敵: ブレイク力+8' }],
    text: '雷属性13ダメージ。シールドゲージ-10。' }),
  sk({ id: 'heal', name: 'ヒール', kind: 'support', element: 'none', cooldown: 3, healAll: 12,
    text: 'パーティ全員のHPを12回復。' }),
  // --- 装備固有スキル（装備すると使用可能） ---
  sk({ id: 'cleave', cost: 2, aoe: 0.7, name: 'なぎ払い', kind: 'physical', element: 'none', cooldown: 2, damage: 11, breakPower: 12,
    text: '【全体】11ダメージ・ゲージ-12（×0.7）' }),
  sk({ id: 'sword_guard', name: '守護の剣技', kind: 'physical', element: 'none', cooldown: 2, damage: 7, breakPower: 5, guardSelf: 8,
    text: '7ダメージ。ゲージ-5。自分にガード8。' }),
  sk({ id: 'dragon_slash', cost: 2, name: 'ドラゴンスラッシュ', kind: 'physical', element: 'fire', cooldown: 3, damage: 18, breakPower: 14, inflict: 'burn',
    conds: [{ when: { kind: 'broken' }, then: { damageMult: 1.5 }, label: 'ブレイク中の敵: ダメージ×1.5' }],
    text: '火属性18ダメージ。シールドゲージ-14。敵を火傷にする。' }),
  sk({ id: 'holy_strike', cost: 2, name: '聖なる一撃', kind: 'physical', element: 'none', cooldown: 3, damage: 12, guardSelf: 12, healAll: 6,
    text: '12ダメージ。自分にガード12。全員HP6回復。' }),
  sk({ id: 'blizzard', cost: 2, aoe: 0.7, name: 'ブリザード', kind: 'magic', element: 'ice', cooldown: 3, damage: 15, breakPower: 8,
    conds: [{ when: { kind: 'broken' }, then: { freeze: true }, label: 'ブレイク中の敵: 凍結(復帰時シールド半減)' }],
    text: '【全体】氷15ダメージ・ゲージ-8（×0.7）' }),
  sk({ id: 'inferno', cost: 2, name: 'インフェルノ', kind: 'magic', element: 'fire', cooldown: 3, damage: 18, inflict: 'burn',
    text: '火属性18ダメージ。敵を火傷にする。' }),
  sk({ id: 'meteor', cost: 2, aoe: 0.8, name: 'メテオ', kind: 'magic', element: 'fire', cooldown: 3, damage: 22, breakPower: 12,
    text: '【全体】火22ダメージ・ゲージ-12（×0.8）' }),
  sk({ id: 'thunderstorm', cost: 2, aoe: 0.7, name: 'サンダーストーム', kind: 'magic', element: 'thunder', cooldown: 3, damage: 14, breakPower: 20,
    conds: [{ when: { kind: 'shieldAtMost', n: 20 }, then: { breakBonus: 10 }, label: 'シールド20以下の敵: ブレイク力+10' }],
    text: '【全体】雷14ダメージ・ゲージ-20（×0.7）' }),
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
    deck: ['slash', 'slash', 'slash', 'shield_bash', 'shield_bash', 'provoke', 'guardian', 'guardian', 'defend', 'wait'],
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
    deck: ['firebolt', 'firebolt', 'firebolt', 'ice_lance', 'ice_lance', 'ice_lance', 'thunder', 'heal', 'focus_mana', 'wait'],
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
    traits: { physMult: 0.75, text: ['ぷるぷる: 物理ダメージ-25%（魔法が通りやすい）'] },
    pattern: [
      { name: '体当たり', value: 8, target: 'front' },
      { name: '溶解液', value: 7, target: 'back' },
      { name: '圧し掛かり', value: 13, target: 'front' },
    ],
  },
  bat: {
    id: 'bat',
    name: 'ナイトバット',
    maxHp: 58,
    maxShield: 14,
    weak: 'ice',
    resist: 'thunder',
    color: 0x6b5b95,
    traits: { lifesteal: 0.5, text: ['吸血: 与えたダメージの50%を回復', '後衛ばかり狙う（挑発か速攻で対処）', '超音波: 標的のスキルを1つ封印する'] },
    pattern: [
      { name: '急降下', value: 6, target: 'back' },
      { name: '超音波', value: 0, target: 'back', kind: 'disrupt' },
      { name: '吸血', value: 7, target: 'back' },
      { name: '体当たり', value: 10, target: 'front' },
    ],
  },
  skeleton: {
    id: 'skeleton',
    name: 'スケルトン戦士',
    maxHp: 95,
    maxShield: 24,
    weak: 'thunder',
    resist: 'none',
    color: 0xd9d4c5,
    traits: { rally: 0.25, text: ['溜めてからの「大振り」が最大の脅威', 'ブレイクさせれば大振りを阻止できる', '仲間が倒れると攻撃力+25%(奮起)'] },
    pattern: [
      { name: '斬りつけ', value: 10, target: 'front' },
      { name: '弓射', value: 9, target: 'back' },
      { name: '力を溜める', value: 0, target: 'front', kind: 'charge' },
      { name: '大振り', value: 24, target: 'front', kind: 'heavy' },
    ],
  },
  golem: {
    id: 'golem',
    name: 'ストーンゴーレム',
    maxHp: 130,
    maxShield: 36,
    weak: 'ice',
    resist: 'fire',
    color: 0x8d8a82,
    traits: { shieldedMult: 0.5, protects: 0.75, text: ['岩の装甲: シールド中の被ダメージ半減', '守護: 健在な間、仲間の被ダメージ-25%(ブレイクで解除)', '構えは仲間にも防御を分ける'] },
    pattern: [
      { name: '岩拳', value: 14, target: 'front' },
      { name: '岩の構え', value: 0, target: 'front', kind: 'guard', guard: 22 },
      { name: '地響き', value: 9, target: 'all' },
      { name: '剛腕', value: 26, target: 'front', kind: 'heavy' },
    ],
  },
  dragon: {
    id: 'dragon',
    name: '灰燼の竜',
    maxHp: 250,
    maxShield: 44,
    weak: 'ice',
    resist: 'fire',
    color: 0xb5473a,
    traits: { enrage: { below: 0.5, mult: 1.25 }, text: ['HP半分以下で激昂（攻撃力+25%）', '咆哮の後の「灼熱の息吹」は全体の大技'] },
    pattern: [
      { name: '爪撃', value: 13, target: 'front' },
      { name: '炎のブレス', value: 11, target: 'all' },
      { name: '咆哮', value: 0, target: 'front', kind: 'charge' },
      { name: '灼熱の息吹', value: 24, target: 'all', kind: 'heavy' },
    ],
  },
};

export const ELEMENT_LABEL: Record<Element, string> = { none: '無', fire: '火', ice: '氷', thunder: '雷' };
export const ELEMENT_COLOR: Record<Element, number> = { none: 0xd8d0c4, fire: 0xff7043, ice: 0x6fd3ff, thunder: 0xffe066 };

/** スキルの条件付き効果の説明行（UIのツールチップ/詳細表示用） */
export const skillCondLines = (sk: SkillDef): string[] => (sk.conds ?? []).map((c) => c.label);
