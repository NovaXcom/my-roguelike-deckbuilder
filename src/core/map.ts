import type { Rng } from './rng';

export type NodeType = 'battle' | 'chest' | 'rest' | 'shop' | 'boss';

export interface MapNode {
  id: number;
  row: number;
  col: number;
  type: NodeType;
  /** 次の階層で選択可能なノードID */
  next: number[];
}

export interface DungeonMap {
  rows: number; // ボス階層を含む
  cols: number;
  nodes: MapNode[];
}

export const NODE_LABEL: Record<NodeType, string> = {
  battle: '戦闘', chest: '宝箱', rest: '休憩所', shop: 'ショップ', boss: 'ボス',
};

/**
 * ランダムなルート選択マップを生成する。
 * 各階層に2〜3ノード、隣接レーンへ枝を伸ばす。最終階層はボス1つ。
 * 全ノードが開始階層から到達可能で、行き止まり(ボス以外の next=空)は無い。
 */
export function generateMap(rng: Rng, floors = 8, cols = 3): DungeonMap {
  const nodes: MapNode[] = [];
  const rowsIds: number[][] = [];
  const bossRow = floors;
  for (let r = 0; r < floors; r++) {
    const count = rng.range(2, 3);
    const lanes: number[] = [];
    while (lanes.length < count) {
      const c = rng.int(cols);
      if (!lanes.includes(c)) lanes.push(c);
    }
    lanes.sort((a, b) => a - b);
    const ids = lanes.map((col) => {
      const id = nodes.length;
      nodes.push({ id, row: r, col, type: 'battle', next: [] });
      return id;
    });
    rowsIds.push(ids);
  }
  const boss: MapNode = { id: nodes.length, row: bossRow, col: (cols - 1) / 2, type: 'boss', next: [] };
  nodes.push(boss);
  rowsIds.push([boss.id]);

  // 枝: 各ノードを次階層の最寄り(1〜2個)へ接続し、入次数0のノードは最寄りの前階層ノードから接続
  for (let r = 0; r < bossRow; r++) {
    const cur = rowsIds[r].map((i) => nodes[i]);
    const nxt = rowsIds[r + 1].map((i) => nodes[i]);
    for (const n of cur) {
      const sorted = [...nxt].sort((a, b) => Math.abs(a.col - n.col) - Math.abs(b.col - n.col) || a.id - b.id);
      n.next.push(sorted[0].id);
      if (sorted.length > 1 && rng.next() < 0.5 && !n.next.includes(sorted[1].id)) n.next.push(sorted[1].id);
    }
    for (const m of nxt) {
      if (!cur.some((n) => n.next.includes(m.id))) {
        const nearest = [...cur].sort((a, b) => Math.abs(a.col - m.col) - Math.abs(b.col - m.col) || a.id - b.id)[0];
        nearest.next.push(m.id);
      }
    }
  }

  // ノード種別: 序盤は戦闘、終盤直前は休憩所を保証。中間は戦闘多めに宝箱/休憩/ショップ
  for (const n of nodes) {
    if (n.type === 'boss') continue;
    if (n.row === 0) n.type = 'battle';
    else if (n.row === bossRow - 1) n.type = 'rest';
    else n.type = rng.weighted<NodeType>({ battle: 50, chest: 18, rest: 16, shop: 16, boss: 0 });
  }
  // 全体で最低1つずつ宝箱とショップを確保（中間階層から選ぶ）
  const mid = nodes.filter((n) => n.row >= 1 && n.row <= bossRow - 2);
  for (const type of ['shop', 'chest'] as const) {
    if (!nodes.some((n) => n.type === type) && mid.length > 0) rng.pick(mid).type = type;
  }
  return { rows: bossRow + 1, cols, nodes };
}

export function startNodes(map: DungeonMap): MapNode[] {
  return map.nodes.filter((n) => n.row === 0);
}
