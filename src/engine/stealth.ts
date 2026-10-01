// 追跡・隠れるアクションの判定（UI非依存の純粋ロジック）。
// 対象は経路に沿って歩き、一定間隔で振り返る。振り返る直前に「？」で予告する。
// 物陰で立ち止まると隠れられる。視界に入り続けると警戒度が上がり、1.0 で見つかる。
import type { LocId, Node, NpcId } from './types';

export interface StealthDef {
  id: string;                                        // 成功時に実行するイベントID
  mode: 'hide' | 'tail';                             // hide=近づいて聞き耳を立てる / tail=一定距離で追い続ける
  loc: LocId;
  target: NpcId;
  start: number;                                     // 主人公の開始位置x
  path: { x: number; wait: number }[];               // 対象の経路（先頭は開始位置）
  speed: number;                                     // 対象の歩く速さ px/s
  spots: { x: number; w: number }[];                 // 物陰（中心x, 幅）
  vision: number;                                    // 視界の長さ px
  glance: { every: number; dur: number; warn: number };
  goal?: { x: number; r: number; hold: number; hear: number }; // hide: 聞き耳の位置(半径r)で、対象が hear px 以内にいる間、静かに hold 秒居続ける
  tail?: { min: number; max: number; hold: number }; // tail: 離れすぎてはいけない距離。最後に近くにいること
  intro: Node[];
  failCost: number;                                  // 失敗時に失う分
  caught: Node[];
  lost: Node[];
}

/** 追跡・隠れる場面での主人公の歩く速さ px/s（通常は80）。忍び足 */
export const STEALTH_SPEED = 55;
/** 通常時の視界は、進行方向のこの割合だけ。振り返り中は全方位・全距離 */
export const AHEAD_RATIO = 0.6;

export type StealthStatus = 'run' | 'success' | 'caught' | 'lost';

export interface StealthState {
  def: StealthDef;
  ease: number;
  x: number; idx: number; wait: number; dir: number; facing: number;
  nextGlance: number; warn: boolean; glancing: number;
  alert: number; hold: number; far: number; hidden: boolean;
  status: StealthStatus; t: number; rand: () => number;
}

/** fails: これまでの失敗回数。失敗するほど判定が甘くなる（取り返しのつかない失敗は作らない） */
export function createStealth(def: StealthDef, fails = 0, rand: () => number = Math.random): StealthState {
  const dir = Math.sign(def.path[1].x - def.path[0].x) || 1;
  return {
    def, ease: Math.max(0.55, 1 - 0.15 * fails), x: def.path[0].x, idx: 0, wait: def.path[0].wait, dir, facing: dir,
    nextGlance: def.glance.every * (0.9 + rand() * 0.3), warn: false, glancing: 0,
    alert: 0, hold: 0, far: 0, hidden: false, status: 'run', t: 0, rand,
  };
}

export const inSpot = (def: StealthDef, x: number) => def.spots.some((s) => Math.abs(x - s.x) <= s.w / 2);

export function stepStealth(st: StealthState, dt: number, hero: { x: number; moving: boolean }) {
  if (st.status !== 'run') return;
  const d = st.def;
  st.t += dt;

  // 対象の移動
  const wp = d.path[st.idx + 1];
  let finished = false;
  if (st.wait > 0) st.wait -= dt;
  else if (wp) {
    const dx = wp.x - st.x, step = d.speed * dt;
    if (Math.abs(dx) <= step) { st.x = wp.x; st.idx++; st.wait = wp.wait; }
    else { st.x += Math.sign(dx) * step; st.dir = Math.sign(dx); }
  } else finished = true;

  // 振り返り（予告 → 振り返る → 戻る）
  if (st.glancing > 0) {
    st.glancing -= dt;
    if (st.glancing <= 0) { st.nextGlance = d.glance.every * (0.75 + st.rand() * 0.5); st.facing = st.dir; }
  } else {
    st.nextGlance -= dt;
    st.warn = st.nextGlance <= d.glance.warn;
    if (st.nextGlance <= 0) { st.glancing = d.glance.dur; st.facing = -st.dir; st.warn = false; }
    else st.facing = st.dir;
  }

  // 隠れる／見つかる
  st.hidden = !hero.moving && inSpot(d, hero.x);
  const dx = hero.x - st.x, ad = Math.abs(dx), vision = d.vision * st.ease;
  const inView = st.glancing > 0 ? ad < vision : dx * st.dir > 0 && ad < vision * AHEAD_RATIO;
  const visible = !st.hidden && (inView || ad < 14);
  if (visible) st.alert += ((1.5 + (1 - Math.min(1, ad / vision)) * 1.5) + (ad < 14 ? 2 : 0)) * st.ease * dt;
  else st.alert = Math.max(0, st.alert - 0.8 * dt);
  if (st.alert >= 1) { st.alert = 1; st.status = 'caught'; return; }

  if (d.goal) {
    const inZone = Math.abs(hero.x - d.goal.x) <= d.goal.r && ad <= d.goal.hear;
    st.hold = inZone && st.alert < 0.6 ? st.hold + dt : Math.max(0, st.hold - dt * 0.5);
    if (st.hold >= d.goal.hold) { st.status = 'success'; return; }
  }
  if (d.tail) {
    st.far = ad > d.tail.max ? st.far + dt : Math.max(0, st.far - dt);
    if (st.far > 2.2) { st.status = 'lost'; return; }
    if (ad <= d.tail.max && ad >= d.tail.min) st.hold = Math.min(d.tail.hold, st.hold + dt); else st.hold = Math.max(0, st.hold - dt);
  }
  if (finished) {
    if (d.tail) st.status = ad <= d.tail.max && st.hold >= d.tail.hold * 0.5 ? 'success' : 'lost';
    else st.status = 'lost';
  }
}
