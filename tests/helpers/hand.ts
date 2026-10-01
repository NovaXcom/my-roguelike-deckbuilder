import type { BattleState } from '../../src/core/battle';

/** デッキ戦闘の状態でも、各キャラが持つ全種類のカードを1枚ずつ手札に持たせる(テスト用) */
export function fullHand(s: BattleState): BattleState {
  let uid = 9000;
  for (const m of s.party) {
    m.deck.hand = m.skills.map((id) => ({ uid: uid++, defId: id, sealed: 0 }));
    m.deck.draw = []; m.deck.discard = []; m.deck.fatigued = [];
  }
  return s;
}
