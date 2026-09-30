import { describe, expect, it } from 'vitest';
import { generateMap, startNodes } from '../src/core/map';
import { Rng } from '../src/core/rng';

describe('マップ生成', () => {
  it('同じシードで同じマップ、違うシードで別マップ', () => {
    const a = generateMap(new Rng(1)), b = generateMap(new Rng(1)), c = generateMap(new Rng(2));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  for (const seed of [1, 2, 3, 42, 99, 12345, 777, 31337]) {
    it(`seed=${seed}: 全ノードが到達可能で、ボスが最終階層に1つ`, () => {
      const m = generateMap(new Rng(seed));
      const boss = m.nodes.filter((n) => n.type === 'boss');
      expect(boss).toHaveLength(1);
      expect(boss[0].row).toBe(m.rows - 1);
      // 開始階層から辿れる
      const seen = new Set<number>(startNodes(m).map((n) => n.id));
      const queue = [...seen];
      while (queue.length) for (const nx of m.nodes[queue.pop()!].next) if (!seen.has(nx)) { seen.add(nx); queue.push(nx); }
      expect(seen.size).toBe(m.nodes.length);
      for (const n of m.nodes) {
        if (n.type !== 'boss') {
          expect(n.next.length).toBeGreaterThan(0); // 行き止まり無し
          for (const nx of n.next) expect(m.nodes[nx].row).toBe(n.row + 1);
        }
        if (n.row === 0) expect(n.type).toBe('battle');
      }
    });
    it(`seed=${seed}: 各階層2〜3ノード、ボス直前は休憩所、ショップと宝箱が存在`, () => {
      const m = generateMap(new Rng(seed));
      for (let r = 0; r < m.rows - 1; r++) {
        const cnt = m.nodes.filter((n) => n.row === r).length;
        expect(cnt).toBeGreaterThanOrEqual(2);
        expect(cnt).toBeLessThanOrEqual(3);
      }
      expect(m.nodes.filter((n) => n.row === m.rows - 2).every((n) => n.type === 'rest')).toBe(true);
      expect(m.nodes.some((n) => n.type === 'shop')).toBe(true);
      expect(m.nodes.some((n) => n.type === 'chest')).toBe(true);
    });
  }
});
