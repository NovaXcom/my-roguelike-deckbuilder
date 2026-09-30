import type { CardDef } from './types';

const c = (d: CardDef): [string, CardDef] => [d.id, d];

/** マイルストーン1用の基本カード。シナジー系(筋力/毒等)はマイルストーン2で拡張。 */
export const CARDS: Record<string, CardDef> = Object.fromEntries([
  // 共通/戦士
  c({ id: 'strike', name: 'ストライク', cost: 1, type: 'attack', target: 'enemy', damage: 6, text: '6ダメージ。' }),
  c({ id: 'defend', name: 'ディフェンド', cost: 1, type: 'skill', target: 'self', block: 5, text: 'ブロック5を得る。' }),
  c({ id: 'bash', name: 'スマッシュ', cost: 2, type: 'attack', target: 'enemy', damage: 10, text: '10ダメージ。' }),
  c({ id: 'iron_wall', name: '鉄壁', cost: 2, type: 'skill', target: 'self', block: 12, text: 'ブロック12を得る。' }),
  // 魔導士
  c({ id: 'spark', name: 'スパーク', cost: 1, type: 'attack', target: 'enemy', damage: 5, text: '5ダメージ。' }),
  c({ id: 'arcane_ward', name: '魔力障壁', cost: 1, type: 'skill', target: 'self', block: 5, text: 'ブロック5を得る。' }),
  c({ id: 'fireball', name: 'ファイアボール', cost: 2, type: 'attack', target: 'enemy', damage: 12, text: '12ダメージ。' }),
  c({ id: 'insight', name: '洞察', cost: 0, type: 'skill', target: 'self', draw: 2, text: 'カードを2枚引く。' }),
  // 刺客
  c({ id: 'knife', name: 'ナイフ', cost: 0, type: 'attack', target: 'enemy', damage: 3, text: '3ダメージ。' }),
  c({ id: 'slash', name: 'スラッシュ', cost: 1, type: 'attack', target: 'enemy', damage: 7, text: '7ダメージ。' }),
  c({ id: 'evade', name: '見切り', cost: 1, type: 'skill', target: 'self', block: 7, text: 'ブロック7を得る。' }),
  c({ id: 'quick_step', name: '足さばき', cost: 0, type: 'skill', target: 'self', block: 2, draw: 1, text: 'ブロック2を得る。1枚引く。' }),
]);

export function getCard(id: string): CardDef {
  const def = CARDS[id];
  if (!def) throw new Error(`Unknown card: ${id}`);
  return def;
}
