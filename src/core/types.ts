export type Element = 'none' | 'fire' | 'ice' | 'thunder';
export type Role = 'knight' | 'elementalist';
/** physical: 物理 / magic: 魔法(ブレイク中に当てるとチェイン) / support: 補助 */
export type SkillKind = 'physical' | 'magic' | 'support';

export interface SkillDef {
  id: string;
  name: string;
  kind: SkillKind;
  element: Element;
  /** 使用後、再使用可能になるまでのターン数（0=毎ターン使用可） */
  cooldown: number;
  damage?: number;
  /** 敵シールドゲージへのダメージ */
  breakPower?: number;
  guardSelf?: number;
  guardAlly?: number;
  healAll?: number;
  /** 使用ターンの敵の攻撃を自分に引きつける(ヘイト) */
  taunt?: boolean;
  text: string;
}

export interface MemberDef {
  id: Role;
  name: string;
  title: string;
  position: '前衛' | '後衛';
  color: number;
  maxHp: number;
  description: string;
  skills: string[];
}

/** front=前衛狙い / back=後衛狙い（前衛がヘイトを取っていると前衛に逸れる） */
export type EnemyTarget = 'front' | 'back';

export interface EnemyIntent {
  name: string;
  value: number;
  target: EnemyTarget;
}

export interface EnemyDef {
  id: string;
  name: string;
  maxHp: number;
  maxShield: number;
  weak: Element;
  resist: Element;
  color: number;
  pattern: EnemyIntent[];
}

export interface MemberState {
  def: MemberDef;
  hp: number;
  maxHp: number;
  guard: number;
  taunt: boolean;
  acted: boolean;
  cooldowns: Record<string, number>;
}

export interface EnemyState {
  def: EnemyDef;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  broken: boolean;
  patternIndex: number;
}
