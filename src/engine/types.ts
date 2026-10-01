// ゲームロジックの型定義（UIから完全に独立）

export type LocId =
  | 'home' | 'shopping' | 'station' | 'park' | 'school'
  | 'clinic' | 'beach' | 'shrine' | 'underground';

export type NpcId =
  | 'mina' | 'kuroda' | 'saeki' | 'yu' | 'shiori' | 'tadokoro'
  | 'shinohara' | 'asagiri' | 'gen' | 'hanako' | 'kubo' | 'shiina';

/** 条件。指定したものはすべて満たす必要がある（any は OR） */
export interface Cond {
  at?: LocId;                         // 現在地
  t?: [number, number];               // 時刻(分) [from, to]
  loop?: [number, number?];           // 周回数 [min, max]
  has?: string[];                     // 既知の情報(fact)
  not?: string[];                     // 未知の情報
  flag?: string[];                    // フラグ（"p:" 始まりは周回をまたいで残る）
  noFlag?: string[];
  done?: string[];                    // 過去に発生済みのイベント
  notDone?: string[];
  doneNow?: string[];                 // 今周回で発生済み
  notDoneNow?: string[];
  rel?: Partial<Record<NpcId, number>>; // 好感度の下限
  npc?: NpcId;                        // その場にいる
  recs?: number;                      // 集めた「記録」の数の下限
  since?: [string, number];           // 今周回でflagが立って n 分以上経過
  past?: string[];                    // 過去の周回で立った永続フラグ
  any?: Cond[];                       // いずれか
}

export type Visual = 'white' | 'dark' | 'flash' | 'shake' | 'crack' | 'clear' | 'glitch';

export interface Effect {
  fact?: string[];
  flag?: string[];
  unflag?: string[];
  rel?: [NpcId, number];
  time?: number;
  goto?: LocId;
  end?: string;                       // エンディングID
  vis?: Visual;
  sfx?: string;
}

export type Node =
  | { k: 'say'; s: string; t: string }
  | { k: 'nar'; t: string }
  | { k: 'choice'; opts: { t: string; show?: Cond; then: Node[] }[] }
  | { k: 'fx'; fx: Effect }
  | { k: 'if'; c: Cond; then: Node[]; else?: Node[] };

export type EventKind = 'talk' | 'look' | 'auto';

export interface GameEvent {
  id: string;
  kind: EventKind;
  label: string;
  cond: Cond;
  cost: number;                       // 所要時間(分)
  npc?: NpcId;
  once?: 'loop' | 'ever' | 'none';    // 既定: loop
  pri?: number;                       // autoの優先度
  script: Node[];
}

export interface ScheduleSlot {
  from: number;
  to: number;
  loc: LocId | null;                  // null = どこにもいない
  cond?: Cond;
}

export interface NpcDef {
  id: NpcId;
  name: string;
  role: string;
  schedule: ScheduleSlot[];           // 先頭から評価し、最初に合致したもの
}

export type FactCat = 'time' | 'person' | 'place' | 'doc' | 'truth' | 'deduce' | 'record' | 'whisper';

export interface FactDef {
  id: string;
  cat: FactCat;
  title: string;
  text: string;
  t?: number;                         // 時刻表に載せる時刻(分)
  who?: string;                       // 時刻表の見出し
  tell?: boolean;                     // 他人に「伝える」ことができる
  rumor?: boolean;                    // 知らなくても噂として流せる
}

export interface Deduction { a: string; b: string; result: string; msg: string }

export interface ThreadStep { done: string; req?: Cond; lead: string }
export interface Thread { id: string; name: string; steps: ThreadStep[] }

export interface Finale { id: string; cond: Cond; script: Node[] }

export interface GameState {
  loop: number;
  time: number;
  loc: LocId;
  flags: Record<string, number>;      // 今周回のフラグ → 立てた時刻
  pflags: Record<string, number>;     // 永続フラグ → 立てた周回
  facts: Record<string, number>;      // 既知の情報 → 知った周回
  newFacts: string[];                 // 今周回で新たに知った情報
  seen: Record<string, number>;       // イベント発生回数（通算）
  seenNow: Record<string, number>;    // 今周回での発生回数
  rel: Partial<Record<NpcId, number>>;
  told: Record<string, number>;       // "npc|fact" → 伝えた周回
  endings: string[];
  focus: string | null;
  over: string | null;                // 到達したエンディング
}

export type Step =
  | { t: 'say'; s: string; text: string }
  | { t: 'nar'; text: string }
  | { t: 'choice'; opts: string[] }
  | { t: 'vis'; v: Visual }
  | { t: 'sfx'; id: string }
  | { t: 'fact'; id: string }
  | { t: 'end'; id: string }
  | { t: 'auto'; id: string }
  | { t: 'move'; to: LocId }
  | { t: 'finale'; id: string }
  | { t: 'dayend' };
