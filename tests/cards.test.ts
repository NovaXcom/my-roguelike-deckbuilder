import { describe, expect, it } from 'vitest';
import { SKILLS, MEMBERS } from '../src/core/data';
import { newMeta } from '../src/core/meta';
import { Rng } from '../src/core/rng';
import {
  CARD_PRICE, MIN_DECK, addCard, buyCard, buyRemoval, cardPool, cardPriceOf, finishBattle, memberDeck, newRun, removalCost, removeCard,
  rollCardChoices, shopStock,
} from '../src/core/run';
import { createBattle, startPlayerTurn } from '../src/core/battle';
import { buildSetup } from '../src/core/run';
import type { MapNode } from '../src/core/map';

const node = (type: MapNode['type'], row: number): MapNode => ({ id: 0, row, col: 0, type, next: [] });
const won = () => { const s = createBattle('slime'); s.enemy.hp = 0; s.phase = 'won'; return s; };

describe('カード報酬', () => {
  it('報酬カードのプールは両キャラ・2レア度にあり、全て定義済み', () => {
    for (const role of ['knight', 'elementalist'] as const) {
      expect(cardPool(role, 'common').length).toBeGreaterThanOrEqual(3);
      expect(cardPool(role, 'rare').length).toBeGreaterThanOrEqual(2);
    }
    for (const id of cardPool()) expect(SKILLS[id].reward).toBeDefined();
  });
  it('3択は重複せず、通常戦闘の勝利で提示される(ボスは無し)', () => {
    const run = newRun(newMeta(), 31);
    const r = finishBattle(run, won(), node('battle', 2));
    expect(r.cards).toHaveLength(3);
    expect(new Set(r.cards).size).toBe(3);
    const boss = finishBattle(newRun(newMeta(), 32), won(), node('boss', 8));
    expect(boss.cards).toBeUndefined();
  });
  it('エリートはレアが出やすい', () => {
    const rate = (elite: boolean) => {
      const rng = new Rng(9);
      let rare = 0;
      for (let i = 0; i < 300; i++) rollCardChoices(rng, elite).forEach((id) => { if (SKILLS[id].reward!.rarity === 'rare') rare++; });
      return rare;
    };
    expect(rate(true)).toBeGreaterThan(rate(false));
  });
  it('カードを追加すると持ち主のデッキに入り、戦闘のデッキに反映される', () => {
    const run = newRun(newMeta(), 33);
    expect(addCard(run, 'power_strike')).toBe(true);
    expect(addCard(run, 'flame_burst')).toBe(true);
    expect(memberDeck(run, 0)).toContain('power_strike');
    expect(memberDeck(run, 1)).toContain('flame_burst');
    const s = createBattle('slime', buildSetup(run));
    startPlayerTurn(s);
    const all = (m: number) => [...s.party[m].deck.draw, ...s.party[m].deck.hand].map((c) => c.defId);
    expect(all(0)).toContain('power_strike');
    expect(all(0)).toHaveLength(11);
    expect(addCard(run, 'nope')).toBe(false);
  });
});

describe('カード削除', () => {
  it('削除でデッキが薄くなるが、最小枚数を下回れない', () => {
    const run = newRun(newMeta(), 34);
    expect(removeCard(run, 0, 'defend')).toBe(true);
    expect(memberDeck(run, 0)).toHaveLength(MIN_DECK + 3);
    while (run.party[0].deck.length > MIN_DECK) removeCard(run, 0, run.party[0].deck[0]);
    expect(removeCard(run, 0, run.party[0].deck[0])).toBe(false);
    expect(run.party[0].deck).toHaveLength(MIN_DECK);
  });
  it('持っていないカードは削除できない', () => {
    const run = newRun(newMeta(), 35);
    expect(removeCard(run, 0, 'firebolt')).toBe(false);
  });
  it('ショップの削除は料金が回数で上がり、ゴールドが足りなければ失敗', () => {
    const run = newRun(newMeta(), 36);
    run.gold = 30;
    expect(buyRemoval(run, 0, 'defend')).toBe(false);
    run.gold = 200;
    const c0 = removalCost(run);
    expect(buyRemoval(run, 0, 'defend')).toBe(true);
    expect(run.gold).toBe(200 - c0);
    expect(removalCost(run)).toBeGreaterThan(c0);
  });
});

describe('ショップのカード', () => {
  it('在庫に2枚のカードがあり、買うとデッキに入る', () => {
    const run = newRun(newMeta(), 37);
    const st = shopStock(run, 5);
    expect(st.cards).toHaveLength(2);
    const id = st.cards[0]!;
    run.gold = 500;
    expect(buyCard(run, 5, 0)).toBe(true);
    expect(run.gold).toBe(500 - cardPriceOf(id));
    expect(st.cards[0]).toBeNull();
    expect(buyCard(run, 5, 0)).toBe(false);
    expect(CARD_PRICE.rare).toBeGreaterThan(CARD_PRICE.common);
  });
  it('初期デッキは10枚', () => {
    expect(MEMBERS.knight.deck).toHaveLength(10);
  });
});
