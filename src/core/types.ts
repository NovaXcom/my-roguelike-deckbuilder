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

/** front=前衛狙い / back=後衛狙い（前衛がヘイトを取っていると前衛に逸れる） / all=全体攻撃 */
export type EnemyTarget = 'front' | 'back' | 'all';

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
  /** 使用可能なスキルID（基本スキル + 装備スキル） */
  skills: string[];
  /** 装備・パッシブによる補正 */
  power: number;
  guardBonus: number;
  breakBonus: number;
  /** 戦闘開始ターンのみ得るガード */
  openingGuard: number;
}

export interface EnemyState {
  def: EnemyDef;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  broken: boolean;
  patternIndex: number;
  /** 攻撃力倍率（階層による強化） */
  atkMult: number;
}
