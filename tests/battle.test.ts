import { describe, expect, it } from 'vitest';
import { BASE_ENERGY, HAND_SIZE, canPlay, createBattle, currentIntent, drawCards, endPlayerTurn, playCard, startPlayerTurn } from '../src/core/battle';
import { CHARACTERS, CHARACTER_ORDER } from '../src/core/characters';
import { getCard } from '../src/core/cards';
import { Rng } from '../src/core/rng';

const total = (s: ReturnType<typeof createBattle>) =>
  s.drawPile.length + s.hand.length + s.discardPile.length + s.exhaustPile.length;

describe('characters', () => {
  it('全キャラの初期デッキは実在カードのみ', () => {
    for (const id of CHARACTER_ORDER) {
      for (const cid of CHARACTERS[id].starterDeck) expect(() => getCard(cid)).not.toThrow();
    }
  });
});

describe('turn start', () => {
  it('エナジー3/3で手札5枚を引く', () => {
    const s = createBattle('ironbuster', 1);
    startPlayerTurn(s);
    expect(s.energy).toBe(BASE_ENERGY);
    expect(s.hand).toHaveLength(HAND_SIZE);
    expect(s.drawPile).toHaveLength(CHARACTERS.ironbuster.starterDeck.length - HAND_SIZE);
  });
  it('同じシードなら同じ手札', () => {
    const a = createBattle('shadowblade', 42), b = createBattle('shadowblade', 42);
    startPlayerTurn(a); startPlayerTurn(b);
    expect(a.hand.map((c) => c.defId)).toEqual(b.hand.map((c) => c.defId));
  });
});

describe('playCard', () => {
  it('エナジーを消費し捨て札へ送りダメージを与える', () => {
    const s = createBattle('ironbuster', 1);
    startPlayerTurn(s);
    s.hand[0] = { uid: 900, defId: 'strike' };
    const ev = playCard(s, 0)!;
    expect(s.energy).toBe(2);
    expect(s.hand).toHaveLength(4);
    expect(s.discardPile.at(-1)!.uid).toBe(900);
    expect(s.enemy.hp).toBe(s.enemy.maxHp - 6);
    expect(ev[0]).toMatchObject({ type: 'damage', amount: 6 });
  });
  it('ブロックは敵ダメージを吸収する', () => {
    const s = createBattle('ironbuster', 1);
    startPlayerTurn(s);
    s.hand[0] = { uid: 900, defId: 'defend' };
    playCard(s, 0);
    expect(s.player.block).toBe(5);
    s.enemy.patternIndex = 0; // 攻撃8
    endPlayerTurn(s);
    expect(s.player.hp).toBe(s.player.maxHp - 3);
  });
  it('エナジー不足では使用できない', () => {
    const s = createBattle('ironbuster', 1);
    startPlayerTurn(s);
    s.energy = 1;
    s.hand[0] = { uid: 900, defId: 'bash' };
    expect(canPlay(s, 0)).toBe(false);
    expect(playCard(s, 0)).toBeNull();
    expect(s.hand).toHaveLength(HAND_SIZE);
  });
  it('ドロー効果とカード総数保存', () => {
    const s = createBattle('spellweaver', 3);
    startPlayerTurn(s);
    s.hand[0] = { uid: 900, defId: 'insight' };
    const n = total(s);
    playCard(s, 0);
    expect(s.hand).toHaveLength(HAND_SIZE - 1 + 2);
    expect(s.energy).toBe(BASE_ENERGY); // 0コスト
    expect(total(s)).toBe(n);
  });
  it('敵HP0で勝利', () => {
    const s = createBattle('ironbuster', 1);
    startPlayerTurn(s);
    s.enemy.hp = 5;
    s.hand[0] = { uid: 900, defId: 'strike' };
    playCard(s, 0);
    expect(s.phase).toBe('won');
    expect(canPlay(s, 0)).toBe(false);
  });
});

describe('endPlayerTurn / deck cycle', () => {
  it('手札は捨て札へ、敵が行動し、次ターンで5枚引き直す', () => {
    const s = createBattle('ironbuster', 5);
    startPlayerTurn(s);
    const intent = currentIntent(s);
    endPlayerTurn(s);
    expect(intent).toEqual({ kind: 'attack', value: 8 });
    expect(s.player.hp).toBe(s.player.maxHp - 8);
    expect(s.turn).toBe(2);
    expect(s.hand).toHaveLength(HAND_SIZE);
    expect(s.energy).toBe(BASE_ENERGY);
    expect(currentIntent(s)).toEqual({ kind: 'defend', value: 6 });
  });
  it('山札が尽きたら捨て札をシャッフルして山札にする', () => {
    const s = createBattle('ironbuster', 7); // 11枚
    startPlayerTurn(s); // 山札6
    endPlayerTurn(s);   // 山札1, 捨て札5→ドローで再シャッフル
    expect(s.hand).toHaveLength(HAND_SIZE);
    expect(total(s)).toBe(11);
    endPlayerTurn(s);
    expect(total(s)).toBe(11);
  });
  it('引くカードが無ければ引ける分だけ', () => {
    const s = createBattle('ironbuster', 1);
    s.drawPile = s.drawPile.slice(0, 2);
    drawCards(s, 5);
    expect(s.hand).toHaveLength(2);
  });
  it('プレイヤーHP0で敗北', () => {
    const s = createBattle('ironbuster', 1);
    startPlayerTurn(s);
    s.player.hp = 3;
    endPlayerTurn(s);
    expect(s.phase).toBe('lost');
  });
});

describe('Rng', () => {
  it('shuffle は要素を保存する', () => {
    const r = new Rng(9);
    expect(r.shuffle([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
