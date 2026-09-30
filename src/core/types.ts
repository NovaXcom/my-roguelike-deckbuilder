export type CharacterId = 'ironbuster' | 'spellweaver' | 'shadowblade';
export type CardType = 'attack' | 'skill' | 'power';
export type CardTarget = 'enemy' | 'self';

export interface CardDef {
  id: string;
  name: string;
  cost: number;
  type: CardType;
  target: CardTarget;
  damage?: number;
  block?: number;
  draw?: number;
  text: string;
}

export interface CharacterDef {
  id: CharacterId;
  name: string;
  title: string;
  color: number; // テーマカラー
  maxHp: number;
  passive: string;
  description: string;
  starterDeck: string[]; // card id
}

export type Intent =
  | { kind: 'attack'; value: number }
  | { kind: 'defend'; value: number }
  | { kind: 'debuff' }
  | { kind: 'buff' };

export interface EnemyDef {
  id: string;
  name: string;
  maxHp: number;
  color: number;
  /** 行動パターン（循環） */
  pattern: Intent[];
}

export interface Combatant {
  hp: number;
  maxHp: number;
  block: number;
}

export interface EnemyState extends Combatant {
  def: EnemyDef;
  patternIndex: number;
}

export interface CardInstance {
  uid: number;
  defId: string;
}
