import { describe, expect, it } from 'vitest';
import { createBattle, endPlayerTurn, intentValue, resolveTarget, startPlayerTurn, usePotion, currentIntent } from '../src/core/battle';
import { makeItem, EQUIP_TEMPLATES } from '../src/core/equipment';
import { newMeta, type MetaState } from '../src/core/meta';
import {
  POTION_PRICE, availableNodes, buildSetup, enemyScale, buyItem, buyPotion, enterNode, finishBattle, memberMaxHp, newRun, openChest, pickEnemy,
  priceOf, rest, shopStock, usePotionOnMap,
} from '../src/core/run';
import { autoRun } from './helpers/bot';
import { ENEMIES } from '../src/core/data';

describe('ラン進行', () => {
  it('開始階層のノードのみ選べ、隣接ノード以外へは進めない', () => {
    const run = newRun(newMeta(), 3);
    const start = availableNodes(run);
    expect(start.every((n) => n.row === 0)).toBe(true);
    expect(enterNode(run, run.map.nodes.find((n) => n.row === 3)!.id)).toBeNull();
    const n = enterNode(run, start[0].id)!;
    expect(availableNodes(run).map((x) => x.id)).toEqual(n.next);
  });

  it('初期状態はHP満タンで、装備を持つ', () => {
    const run = newRun(newMeta(), 1);
    run.party.forEach((m, i) => {
      expect(m.hp).toBe(memberMaxHp(run, i));
      expect(m.gear.weapon).toBeTruthy();
      expect(m.gear.armor).toBeTruthy();
    });
  });

  it('戦闘勝利でHPを持ち越し、戦闘不能者は25%で復活、報酬を得る', () => {
    const run = newRun(newMeta(), 7);
    const node = enterNode(run, availableNodes(run)[0].id)!;
    const s = createBattle(pickEnemy(run, node), buildSetup(run));
    startPlayerTurn(s);
    s.party[0].hp = 30;
    s.party[1].hp = 0;
    s.enemy.hp = 0;
    s.phase = 'won';
    const gold0 = run.gold;
    const r = finishBattle(run, s, node);
    expect(run.party[0].hp).toBe(30);
    expect(run.party[1].hp).toBe(Math.round(memberMaxHp(run, 1) * 0.25));
    expect(r.gold).toBeGreaterThan(0);
    expect(r.stones).toBeGreaterThanOrEqual(3);
    expect(run.gold).toBe(gold0 + r.gold);
    expect(run.stones).toBe(r.stones);
    expect(run.finished).toBeNull();
  });

  it('ボス撃破で踏破(Legendary確定+魔導石ボーナス)、全滅で敗北', () => {
    const run = newRun(newMeta(), 5);
    const boss = run.map.nodes.find((n) => n.type === 'boss')!;
    expect(pickEnemy(run, boss)).toBe('dragon');
    const s = createBattle('dragon', buildSetup(run));
    startPlayerTurn(s);
    s.phase = 'won'; s.enemy.hp = 0;
    const r = finishBattle(run, s, boss);
    expect(r.item?.rarity).toBe('legendary');
    expect(r.stones).toBeGreaterThanOrEqual(40);
    expect(run.finished).toBe('victory');

    const run2 = newRun(newMeta(), 5);
    const s2 = createBattle('slime', buildSetup(run2));
    s2.party.forEach((m) => { m.hp = 0; });
    s2.phase = 'lost';
    finishBattle(run2, s2, run2.map.nodes[0]);
    expect(run2.finished).toBe('defeat');
    expect(availableNodes(run2)).toEqual([]);
  });

  it('宝箱は装備・ゴールド・魔導石を与える', () => {
    const run = newRun(newMeta(), 2);
    const r = openChest(run);
    expect(r.item).toBeTruthy();
    expect(r.gold).toBeGreaterThanOrEqual(20);
    expect(run.stones).toBe(5);
  });
});

describe('ショップ・休憩・ポーション', () => {
  it('装備を購入するとゴールドが減り、在庫から消える。所持金不足なら買えない', () => {
    const run = newRun(newMeta(), 4);
    const stock = shopStock(run, 10);
    expect(stock.items.filter(Boolean)).toHaveLength(3);
    expect(shopStock(run, 10)).toBe(stock); // 同じ店は在庫が固定
    run.gold = 0;
    expect(buyItem(run, 10, 0)).toBeNull();
    run.gold = 1000;
    const price = priceOf(stock.items[0]!);
    const item = buyItem(run, 10, 0)!;
    expect(item).toBeTruthy();
    expect(run.gold).toBe(1000 - price);
    expect(buyItem(run, 10, 0)).toBeNull();
  });
  it('ポーション購入は在庫2個まで', () => {
    const run = newRun(newMeta(), 4);
    run.gold = 1000;
    const p0 = run.potions;
    expect(buyPotion(run, 10)).toBe(true);
    expect(buyPotion(run, 10)).toBe(true);
    expect(buyPotion(run, 10)).toBe(false);
    expect(run.potions).toBe(p0 + 2);
    expect(run.gold).toBe(1000 - POTION_PRICE * 2);
  });
  it('休憩所: HP30%回復 / 修練で最大HP+6', () => {
    const run = newRun(newMeta(), 4);
    run.party[0].hp = 10;
    rest(run, 'heal');
    expect(run.party[0].hp).toBe(10 + Math.ceil(memberMaxHp(run, 0) * 0.3));
    const max = memberMaxHp(run, 1);
    rest(run, 'train');
    expect(memberMaxHp(run, 1)).toBe(max + 6);
  });
  it('マップ上/戦闘中のポーション', () => {
    const run = newRun(newMeta(), 4);
    run.party[0].hp = 10;
    const n = run.potions;
    expect(usePotionOnMap(run)).toBe(true);
    expect(run.potions).toBe(n - 1);
    expect(run.party[0].hp).toBeGreaterThan(10);
    run.potions = 0;
    expect(usePotionOnMap(run)).toBe(false);

    const s = createBattle('slime', buildSetup(newRun(newMeta(), 4)));
    startPlayerTurn(s);
    s.party[1].hp = 20;
    const ev = usePotion(s)!;
    expect(s.party[1].hp).toBe(20 + Math.ceil(s.party[1].maxHp * 0.35));
    expect(ev.some((e) => e.type === 'heal')).toBe(true);
    expect(s.ap).toBe(3); // 行動ポイントは消費しない
  });
});

describe('全体攻撃', () => {
  it('全体攻撃は両者にダメージ、ヘイトの影響を受けない', () => {
    const s = createBattle('golem');
    startPlayerTurn(s);
    s.enemy.patternIndex = 2; // 地響き(全体9)
    expect(resolveTarget(s, currentIntent(s))).toBe(-1);
    s.party[0].taunt = true;
    s.party[1].guard = 4;
    const ev = endPlayerTurn(s);
    expect(ev.filter((e) => e.type === 'hurt')).toHaveLength(2);
    expect(s.party[0].hp).toBe(s.party[0].maxHp - 9);
    expect(s.party[1].hp).toBe(s.party[1].maxHp - 5);
  });
});

describe('ランのシミュレーション(自動プレイ)', () => {
  it('全ての敵が定義済みで、装備テンプレートIDが重複しない', () => {
    const ids = EQUIP_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(makeItem(EQUIP_TEMPLATES[0], 1, null).name).toBe('鉄の剣');
  });
  it('ボットで40ランを最後まで進めても矛盾なく終了し、魔導石が貯まる', () => {
    let wins = 0;
    let stones = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const meta: MetaState = newMeta();
      const run = autoRun(meta, seed);
      expect(run.finished).not.toBeNull();
      expect(run.banked).toBe(true);
      run.party.forEach((m, i) => {
        expect(m.hp).toBeGreaterThanOrEqual(1);
        expect(m.hp).toBeLessThanOrEqual(memberMaxHp(run, i));
      });
      expect(meta.stones).toBe(run.stones);
      if (run.finished === 'victory') wins++;
      stones += run.stones;
    }
    console.log(`[balance] 強化なしボット: 40ランで踏破 ${wins} 回 / 平均魔導石 ${(stones / 40).toFixed(1)}`);
    expect(stones).toBeGreaterThan(0);
  });
  it('拠点を強化すると同じシードのボットの踏破率が下がらない（永続成長の効果）', () => {
    const rate = (mk: () => MetaState) => {
      let w = 0;
      for (let seed = 1; seed <= 40; seed++) if (autoRun(mk(), seed).finished === 'victory') w++;
      return w;
    };
    const base = rate(newMeta);
    const maxed = rate(() => ({ ...newMeta(), smith: 5, alchemy: 5, training: 5 }));
    console.log(`[balance] 踏破: 強化なし ${base}/40 → 全強化 ${maxed}/40`);
    expect(maxed).toBeGreaterThanOrEqual(base);
  });
});

describe('難易度カーブ', () => {
  it('階層が深いほど敵のHPと攻撃力が上がり、ボスは通常戦闘より強い', () => {
    const run = newRun(newMeta(), 1);
    const at = (row: number) => run.map.nodes.find((n) => n.row === row && n.type !== 'boss')!;
    expect(enemyScale(at(0))).toEqual({ hp: 1, atk: 1 });
    expect(enemyScale(at(5)).hp).toBeGreaterThan(enemyScale(at(2)).hp);
    expect(enemyScale(at(5)).atk).toBeGreaterThan(enemyScale(at(2)).atk);
    const boss = run.map.nodes.find((n) => n.type === 'boss')!;
    // ボスは中盤の通常敵より硬く、3つの形態(シールド全回復×2)を持つので実質の戦闘量は終盤の通常敵を上回る
    const hp = (id: string, n: typeof boss) => createBattle(id, undefined, enemyScale(n)).enemy.maxHp;
    expect(hp('dragon', boss)).toBeGreaterThan(hp('golem', at(5)));
    expect(hp('dragon', boss) * (1 + ENEMIES.dragon.phases!.length)).toBeGreaterThan(hp('golem', at(7)));
  });
  it('階層補正は敵HPと実ダメージ(インテント値)に反映される', () => {
    const s = createBattle('slime', undefined, { hp: 2, atk: 1.5 });
    expect(s.enemy.maxHp).toBe(160);
    expect(intentValue(s)).toBe(12); // 体当たり8 × 1.5
    startPlayerTurn(s);
    endPlayerTurn(s);
    expect(s.party[0].hp).toBe(90 - 12);
  });
});

describe('デッキ構築の効果(Bot)', () => {
  it('強いカードを選んで取る方が、何でも取るより踏破しやすい(デッキが厚くなる代償)', async () => {
    const { botOptions } = await import('./helpers/bot');
    const rate = (th: number) => {
      botOptions.cardThreshold = th;
      let w = 0;
      for (let seed = 1; seed <= 40; seed++) if (autoRun(newMeta(), seed).finished === 'victory') w++;
      return w;
    };
    const selective = rate(21);
    const greedy = rate(-999);
    botOptions.cardThreshold = 21;
    console.log(`[balance] カード選択: 厳選 ${selective}/40 / 何でも取る ${greedy}/40`);
    expect(selective).toBeGreaterThan(greedy);
  });
});
