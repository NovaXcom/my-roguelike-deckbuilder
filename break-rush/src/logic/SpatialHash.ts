/**
 * Fixed-size uniform grid for fast "who is near me" queries over hundreds of moving things.
 * Buckets are linked lists in typed arrays, so rebuilding it every frame allocates nothing.
 */
export class SpatialHash {
  private head: Int32Array;
  private next: Int32Array;
  private ox = 0;
  private oz = 0;

  constructor(readonly cells = 64, readonly cellSize = 2, capacity = 1024) {
    this.head = new Int32Array(cells * cells).fill(-1);
    this.next = new Int32Array(capacity).fill(-1);
  }

  /** Centre the grid on (cx, cz) and clear it. */
  reset(cx: number, cz: number): void {
    const half = (this.cells * this.cellSize) / 2;
    this.ox = cx - half;
    this.oz = cz - half;
    this.head.fill(-1);
  }

  private cell(v: number, o: number): number {
    const c = Math.floor((v - o) / this.cellSize);
    return c < 0 ? 0 : c >= this.cells ? this.cells - 1 : c;
  }

  insert(id: number, x: number, z: number): void {
    if (id >= this.next.length) return;
    const idx = this.cell(z, this.oz) * this.cells + this.cell(x, this.ox);
    this.next[id] = this.head[idx];
    this.head[idx] = id;
  }

  /** Calls `cb` for every id that might lie within `r` of (x, z). Callers do the exact distance test. */
  query(x: number, z: number, r: number, cb: (id: number) => void): void {
    const x0 = this.cell(x - r, this.ox);
    const x1 = this.cell(x + r, this.ox);
    const z0 = this.cell(z - r, this.oz);
    const z1 = this.cell(z + r, this.oz);
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (let id = this.head[cz * this.cells + cx]; id !== -1; id = this.next[id]) cb(id);
      }
    }
  }
}
