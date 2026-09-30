import type { CharacterDef, CharacterId, EnemyDef } from './types';

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  ironbuster: {
    id: 'ironbuster',
    name: 'アイアンバスター',
    title: '戦士型 / 高火力・強固',
    color: 0xd64545,
    maxHp: 80,
    passive: '戦闘勝利時にHPを少し回復',
    description: '筋力を積み上げ、ブロックを力に変える重装の戦士。',
    starterDeck: ['strike', 'strike', 'strike', 'strike', 'strike', 'defend', 'defend', 'defend', 'defend', 'bash', 'iron_wall'],
  },
  spellweaver: {
    id: 'spellweaver',
    name: 'スペルウィーバー',
    title: '魔導士型 / コントロール・コンボ',
    color: 0x4a90e2,
    maxHp: 65,
    passive: '毎ターン開始時、1コスト以下の呪文を1枚生成',
    description: '手札補充・エナジー加速・毒と火傷で敵を蝕む魔導士。',
    starterDeck: ['spark', 'spark', 'spark', 'spark', 'spark', 'arcane_ward', 'arcane_ward', 'arcane_ward', 'arcane_ward', 'fireball', 'insight'],
  },
  shadowblade: {
    id: 'shadowblade',
    name: 'シャドウブレード',
    title: '刺客型 / 連続攻撃・トリッキー',
    color: 0x3fb56b,
    maxHp: 70,
    passive: '1ターンにカードを3枚使うたび、1ドロー',
    description: '0コストのナイフで手数を稼ぎ、攻撃を回避する刺客。',
    starterDeck: ['knife', 'knife', 'knife', 'knife', 'slash', 'slash', 'slash', 'evade', 'evade', 'evade', 'quick_step', 'quick_step'],
  },
};

export const CHARACTER_ORDER: CharacterId[] = ['ironbuster', 'spellweaver', 'shadowblade'];

export const ENEMIES: Record<string, EnemyDef> = {
  slime: {
    id: 'slime',
    name: 'ジェルスライム',
    maxHp: 46,
    color: 0x7ac47a,
    pattern: [
      { kind: 'attack', value: 8 },
      { kind: 'defend', value: 6 },
      { kind: 'attack', value: 12 },
    ],
  },
};
