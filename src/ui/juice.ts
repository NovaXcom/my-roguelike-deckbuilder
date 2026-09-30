/**
 * 打撃感(Juice)のパラメータ計算。Phaser に依存しない純関数にしてあり、Vitest で検証できる。
 * ダメージが大きいほど「長いヒットストップ・強い画面揺れ・大きな数字」になる。
 */
export type ImpactKind = 'hit' | 'hurt' | 'break' | 'chain';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** ダメージ量の段階 0(小)〜3(特大) */
export function damageTier(amount: number): 0 | 1 | 2 | 3 {
  if (amount < 8) return 0;
  if (amount < 15) return 1;
  if (amount < 25) return 2;
  return 3;
}

/** ヒットストップ(ms)。おおむね 50〜170ms。 */
export function hitStopMs(amount: number, kind: ImpactKind): number {
  switch (kind) {
    case 'hit': return Math.round(clamp(45 + amount * 3, 50, 130));
    case 'hurt': return Math.round(clamp(55 + amount * 2.5, 60, 120));
    case 'break': return 130;
    case 'chain': return 100;
  }
}

/** 画面揺れ。duration(ms) と intensity(カメラ比率)。 */
export function shakeFor(amount: number, kind: ImpactKind): { ms: number; intensity: number } {
  switch (kind) {
    case 'hit': return { ms: Math.round(clamp(110 + amount * 5, 110, 320)), intensity: clamp(0.003 + amount * 0.0005, 0.003, 0.016) };
    case 'hurt': return { ms: Math.round(clamp(140 + amount * 6, 140, 360)), intensity: clamp(0.004 + amount * 0.0006, 0.004, 0.02) };
    case 'break': return { ms: 420, intensity: 0.024 };
    case 'chain': return { ms: 620, intensity: 0.034 };
  }
}

/** ダメージ数字のフォントサイズ。弱点/チェインで強調。 */
export function popupFontSize(amount: number, opts: { weak?: boolean; chain?: boolean } = {}): number {
  const base = 36 + clamp(amount * 1.1, 0, 30);
  return Math.round(base * (opts.chain ? 1.5 : opts.weak ? 1.2 : 1));
}

/** 被弾を強調する赤フラッシュを出すか（大ダメージのみ） */
export const shouldFlashHurt = (amount: number): boolean => damageTier(amount) >= 2;

/** ヒット時に飛ばす火花の数 */
export function sparkCount(amount: number): number {
  return 8 + damageTier(amount) * 5;
}
