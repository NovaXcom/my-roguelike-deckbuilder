import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EnemyManager } from '../src/game/Enemies';

function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('EnemyManager bookkeeping', () => {
  it('survives thousands of random spawn / damage / kill / removal cycles with consistent counts', () => {
    const rand = seeded(42);
    const m = new EnemyManager(new THREE.Scene(), 200);
    let alive = 0;
    for (let frame = 0; frame < 3000; frame++) {
      const spawns = Math.floor(rand() * 8);
      for (let k = 0; k < spawns; k++) if (m.spawn(['imp', 'runner', 'brute'][Math.floor(rand() * 3)] as 'imp', rand() * 40 - 20, rand() * 40 - 20, 10 + rand() * 50, rand() < 0.05)) alive++;
      m.update(0.016, 0, 0, frame * 0.016, 1, () => undefined, 1);
      // AoE-style damage that can hit the same enemy repeatedly in one frame
      for (let k = 0; k < 4; k++) m.forEachInCircle(rand() * 30 - 15, rand() * 30 - 15, 6, (i) => m.damage(i, rand() * 40, 1, 1));
      const dead = m.takeDead();
      expect(new Set(dead).size).toBe(dead.length);
      for (const i of dead) {
        expect(i).toBeLessThan(m.n);
        m.removeAt(i);
        alive--;
      }
      expect(m.n).toBe(alive);
      expect(m.n).toBeGreaterThanOrEqual(0);
      m.render(frame * 0.016);
      // nothing flagged dead may remain alive afterwards
      for (let i = 0; i < m.n; i++) expect(m.hp[i]).toBeGreaterThan(0);
    }
  });

  it('queries right after removals never touch stale indices (regression: enemy count went negative)', () => {
    const rand = seeded(7);
    const m = new EnemyManager(new THREE.Scene(), 300);
    for (let i = 0; i < 200; i++) m.spawn('imp', rand() * 20 - 10, rand() * 20 - 10, 5);
    m.update(0.016, 0, 0, 0, 1, () => undefined, 1);
    // kill and remove many, WITHOUT running update (like the frame boundary in the game)
    for (let i = 0; i < 120; i++) m.damage(i * 1, 999, 0, 0);
    for (const i of m.takeDead()) m.removeAt(i);
    m.rehash();
    expect(m.n).toBe(80);
    let seen = 0;
    m.forEachInCircle(0, 0, 40, (i) => {
      expect(i).toBeLessThan(m.n);
      m.damage(i, 999, 0, 0);
      seen++;
    });
    expect(seen).toBe(80);
    const dead = m.takeDead();
    expect(dead.length).toBe(80);
    for (const i of dead) m.removeAt(i);
    expect(m.n).toBe(0);
    // nothing left to find, and damage on a stale index is a no-op
    let any = false;
    m.forEachInCircle(0, 0, 100, () => (any = true));
    expect(any).toBe(false);
    expect(m.damage(5, 10, 0, 0)).toBe(false);
    expect(m.nearest(0, 0, 50)).toBe(-1);
    expect(m.n).toBe(0);
  });

  it('a spawned enemy is hittable in the same frame', () => {
    const m = new EnemyManager(new THREE.Scene(), 10);
    m.update(0.016, 0, 0, 0, 1, () => undefined, 1);
    m.spawn('imp', 3, 3, 10);
    expect(m.nearest(3, 3, 2)).toBe(0);
  });

  it('damage on an already-killed enemy in the same frame is ignored', () => {
    const m = new EnemyManager(new THREE.Scene(), 10);
    m.spawn('imp', 0, 0, 5);
    expect(m.damage(0, 100, 0, 0)).toBe(true);
    expect(m.damage(0, 100, 0, 0)).toBe(false);
    expect(m.takeDead()).toEqual([0]);
    m.removeAt(0);
    expect(m.n).toBe(0);
  });

  it('removing from the middle keeps the swapped-in enemy intact', () => {
    const m = new EnemyManager(new THREE.Scene(), 10);
    m.spawn('imp', 1, 1, 5);
    m.spawn('runner', 2, 2, 6);
    m.spawn('brute', 3, 3, 7, true);
    m.removeAt(0);
    expect(m.n).toBe(2);
    expect(m.x[0]).toBe(3);
    expect(m.hp[0]).toBe(7);
    expect(m.elite[0]).toBe(1);
    expect(m.kind[0]).toBe(2);
  });
});
