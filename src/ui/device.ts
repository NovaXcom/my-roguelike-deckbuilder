/**
 * 端末判定（タッチ端末かつ表示が小さいとき「コンパクトUI」にする）。
 * 論理解像度は 1280x720 固定でスケール表示されるため、スマホ横向き(高さ約390px)では
 * 表示倍率が約0.54になり、小さな文字が読めなくなる。そこで最小フォントを引き上げ、
 * タップ領域を広げる。
 */
export const DESIGN_W = 1280;
export const DESIGN_H = 720;
/** 表示倍率がこれ未満のタッチ端末をコンパクト扱いにする */
export const COMPACT_SCALE = 0.75;
/** コンパクト時の最小フォントサイズ（論理px）。0.54倍表示でも約8.5px相当 */
export const MIN_FONT_COMPACT = 16;
/** コンパクト時にタップ領域へ足す余白（論理px） */
export const HIT_PAD_COMPACT = 14;

/** 表示領域(w×h)でのFIT倍率 */
export function fitScale(w: number, h: number): number {
  return Math.min(w / DESIGN_W, h / DESIGN_H);
}

export function decideCompact(w: number, h: number, touch: boolean): boolean {
  return touch && fitScale(w, h) < COMPACT_SCALE;
}

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
}

/** 現在の表示でコンパクトUIにするか（シーン生成時に評価する） */
export function compact(): boolean {
  if (typeof window === 'undefined') return false;
  return decideCompact(window.innerWidth, window.innerHeight, isTouchDevice());
}

/** コンパクト時は最小フォントに引き上げ */
export function fontSize(size: number): number {
  return compact() ? Math.max(size, MIN_FONT_COMPACT) : size;
}
