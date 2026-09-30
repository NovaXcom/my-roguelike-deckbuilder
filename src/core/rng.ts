/** シード付き乱数 (mulberry32)。ラン生成・ドロップの再現性のため Math.random は使わない。 */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }
  range(min: number, maxInclusive: number): number {
    return min + this.int(maxInclusive - min + 1);
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }
  /** 重み付き抽選。キーごとの重みを渡す。 */
  weighted<K extends string>(weights: Record<K, number>): K {
    const keys = Object.keys(weights) as K[];
    let r = this.next() * keys.reduce((a, k) => a + weights[k], 0);
    for (const k of keys) {
      r -= weights[k];
      if (r < 0) return k;
    }
    return keys[keys.length - 1];
  }
}
