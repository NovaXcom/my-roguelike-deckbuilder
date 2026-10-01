// 画像素材の読み込み。素材が無い・読み込みに失敗した場合は null を返し、描画側が手続き描画にフォールバックする。
import type { LocId } from '../engine/types';

const urls = import.meta.glob('../assets/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const byName: Record<string, string> = {};
for (const [path, url] of Object.entries(urls)) byName[path.replace(/^.*\/|\.png$/g, '')] = url;

const cache = new Map<string, HTMLImageElement | null>();

export const assetUrl = (name: string): string | null => byName[name] ?? null;

/** 読み込み済みの画像だけ返す（未読み込み・失敗は null） */
export function asset(name: string): HTMLImageElement | null {
  if (cache.has(name)) {
    const im = cache.get(name)!;
    return im && im.complete && im.naturalWidth > 0 ? im : null;
  }
  const url = byName[name];
  if (!url) { cache.set(name, null); return null; }
  const im = new Image();
  im.onerror = () => cache.set(name, null);
  im.src = url;
  cache.set(name, im);
  return im.complete && im.naturalWidth > 0 ? im : null;
}

export const preloadAssets = () => { for (const n of Object.keys(byName)) asset(n); };

export const bgImage = (loc: LocId, controlRoom = false) => asset(controlRoom && loc === 'underground' ? 'bg_control_room' : `bg_${loc}`);

/** スプライトシート：24×40 のコマを横に並べる（待機2・歩行4・しゃがみ1[・花を持つ1]） */
export const SHEET_W = 24;
export const SHEET_H = 40;
export const sheetImage = (id: string) => asset(`ch_${id}`);
