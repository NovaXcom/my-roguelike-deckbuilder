/** Limits how many enemies attack at once so crowds stay fair and readable. */
export class AttackTokens {
  private holders = new Set<unknown>();

  constructor(readonly max: number) {}

  acquire(holder: unknown): boolean {
    if (this.holders.has(holder)) return true;
    if (this.holders.size >= this.max) return false;
    this.holders.add(holder);
    return true;
  }

  has(holder: unknown): boolean {
    return this.holders.has(holder);
  }

  release(holder: unknown): void {
    this.holders.delete(holder);
  }

  get count(): number {
    return this.holders.size;
  }
}
