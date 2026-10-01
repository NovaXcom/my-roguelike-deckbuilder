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
  /** 命中時に敵へ付与する状態（火傷など） */
  inflict?: 'burn';
  /** 行動ポイント消費(既定1)。強力なスキルは2 */
  cost?: number;
  /** 報酬カードのレア度(報酬プールに入るカードのみ)。owner=使えるキャラ */
  reward?: { owner: Role; rarity: 'common' | 'rare' };
  /** 使うと次のダメージスキルが強化される(帯電と同じ)自己バフ */
  chargeSelf?: boolean;
  /** 待機カード: CD/疲労-1・ガード+5・次のダメージスキル強化 */
  waitEffect?: boolean;
  /** 全体攻撃: 生存している敵全員に当たる。値はダメージ/ゲージ削りの倍率(例: 0.7) */
  aoe?: number;
  /** 条件を満たすと発動する追加効果（「今使う価値があるか」を考えさせる） */
  conds?: SkillCond[];
  text: string;
}

/** スキルの発動条件（敵の状態） */
export type CondWhen =
  | { kind: 'shieldAtLeast'; n: number }
  | { kind: 'shieldAtMost'; n: number }
  | { kind: 'broken' }
  | { kind: 'burning' }
  | { kind: 'bleeding' };

export interface SkillBonus {
  breakBonus?: number;
  damageBonus?: number;
  damageMult?: number;
  /** 凍結を付与（シールド回復が半分になる） */
  freeze?: boolean;
}

export interface SkillCond {
  when: CondWhen;
  then: SkillBonus;
  /** UI表示用（例: 「シールド10以上: ブレイク+10」） */
  label: string;
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
  /** 初期デッキ(カードID。重複で枚数) */
  deck: string[];
}

/** front=前衛狙い / back=後衛狙い（前衛がヘイトを取っていると前衛に逸れる） / all=全体攻撃 */
export type EnemyTarget = 'front' | 'back' | 'all';

/** attack=通常攻撃 / heavy=強攻撃(ブレイクで阻止できる) / charge=溜め(次の強攻撃の予告) / guard=自己防御 / disrupt=妨害(標的のスキルを封印する) */
export type IntentKind = 'attack' | 'heavy' | 'charge' | 'guard' | 'disrupt';

export interface EnemyIntent {
  name: string;
  value: number;
  target: EnemyTarget;
  kind?: IntentKind;
  /** kind=guard のとき敵が得る防御値 */
  guard?: number;
}

/** 敵の特性（攻略の手がかり。UIに表示する） */
export interface EnemyTraits {
  /** 物理スキルの被ダメージ倍率（例: 0.75） */
  physMult?: number;
  /** シールド残存中の被ダメージ倍率（既定0.75） */
  shieldedMult?: number;
  /** 与ダメージの割合だけ自分が回復 */
  lifesteal?: number;
  /** HPがこの割合以下で攻撃力が上がる */
  enrage?: { below: number; mult: number };
  /** 「守護」: 健在な間、仲間(自分以外)が受けるダメージ倍率(例: 0.75)。ブレイクすると解除 */
  protects?: number;
  /** 「奮起」: 仲間が倒れるたび攻撃力が上がる割合(例: 0.25) */
  rally?: number;
  /** 説明文（攻略のヒント） */
  text: string[];
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
  traits?: EnemyTraits;
}

export interface MemberState {
  def: MemberDef;
  hp: number;
  maxHp: number;
  guard: number;
  taunt: boolean;
  acted: boolean;
  /** このターンに使った行動(スキルID/'wait')。同じ行動は1ターン1回まで */
  used: string[];
  cooldowns: Record<string, number>;
  /** 使用可能なスキルID（基本スキル + 装備スキル） */
  skills: string[];
  /** 装備・パッシブによる補正 */
  power: number;
  guardBonus: number;
  breakBonus: number;
  /** 山札・手札・捨て札・疲労(デッキ戦闘)。旧方式では手札=全スキル固定 */
  deck: DeckState;
  /** 戦闘開始ターンのみ得るガード */
  openingGuard: number;
  /** スキルごとのレベル(1〜3)。未設定は1 */
  levels: Record<string, number>;
  /** 装備の固有効果 */
  effects: EquipEffectId[];
  /** 待機で溜めた集中: 次のダメージスキルが強化される */
  focus: boolean;
  /** 感電爆発で得る帯電: 次のダメージスキル+30% */
  charged: boolean;
}

/** 装備の固有効果（「強い装備」ではなく「この装備を軸にビルドする」ための仕組み） */
export type EquipEffectId =
  | 'bleed_on_break' | 'ignite' | 'guard_power' | 'low_hp_cd' | 'break_guard' | 'holy_break' | 'freeze_ice' | 'storm_chain';

/** カードの実体(同名カードを複数持てる) */
export interface CardInst {
  uid: number;
  defId: string;
  /** 封印(残りターン)。>0 の間は使えない */
  sealed: number;
}
export interface DeckState {
  draw: CardInst[];
  hand: CardInst[];
  discard: CardInst[];
  /** 疲労中のカード(残りターン後に山札へ戻る) */
  fatigued: { card: CardInst; turns: number }[];
  exhausted: CardInst[];
}

export type DotKind = 'burn' | 'bleed';
export interface DotStatus {
  turns: number;
  dmg: number;
}

/** ランごとの特殊条件（「今回の旅」） */
export interface RunMods {
  id: string;
  name: string;
  text: string;
  elementMult?: Partial<Record<Element, number>>;
  /** この属性のスキルの再使用待ちが増える */
  elementCdPlus?: Partial<Record<Element, number>>;
  healCdPlus?: number;
  breakMult?: number;
  guardMult?: number;
  enemyHpMult?: number;
  enemyAtkMult?: number;
  goldMult?: number;
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
  /** 敵の防御値（ダメージを先に吸収する） */
  guard: number;
  burn: DotStatus | null;
  bleed: DotStatus | null;
  /** 凍結: ブレイクから復帰してもシールドが半分しか戻らない */
  frozen: boolean;
  /** 弱体: 次の攻撃のダメージが25%減る */
  weakened: boolean;
  /** 最後に命中した属性（チェイン反応の起点） */
  lastElement: Element | null;
}
