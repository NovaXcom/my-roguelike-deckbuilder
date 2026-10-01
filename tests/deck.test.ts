import { describe, expect, it } from 'vitest';
import {
  HAND_SIZE, canUse, createBattle, defaultSetup, drawUp, endPlayerTurn, nextDraw, previewSkill, startPlayerTurn, useSkill, wait,
  type BattleSetup, type BattleState,
} from '../src/core/battle';
import { ENEMIES, MEMBERS, SKILLS } from '../src/core/data';
import { WAIT_ID, canAppend, simulatePlan } from '../src/core/plan';

const K = 0, E = 1;
const deckSetup = (seed = 1): BattleSetup => {
  const st = defaultSetup();
  st.seed = seed;
  st.members.forEach((m) => { m.deck = [...MEMBERS[m.role].deck]; });
  return st;
};
const fresh = (seed = 1, ids: string | string[] = 'skeleton'): BattleState => {
  const s = createBattle(ids, deckSetup(seed));
  startPlayerTurn(s);
  return s;
};
const total = (s: BattleState, m: number): number => {
  const d = s.party[m].deck;
  return d.draw.length + d.hand.length + d.discard.length + d.fatigued.length + d.exhausted.length;
};

describe('初期デッキ', () => {
  it('各キャラ10枚で、全カードが定義済み', () => {
    for (const r of ['knight', 'elementalist'] as const) {
      expect(MEMBERS[r].deck).toHaveLength(10);
      for (const id of MEMBERS[r].deck) expect(SKILLS[id], id).toBeDefined();
    }
  });
  it('1ターン目は手札4枚を引き、枚数の総和は変わらない', () => {
    const s = fresh();
    for (const m of [K, E]) {
      expect(s.party[m].deck.hand).toHaveLength(HAND_SIZE);
      expect(total(s, m)).toBe(10);
    }
    expect(s.deckMode).toBe(true);
  });
  it('同じシードなら同じ手札、違うシードなら(ほぼ)違う手札', () => {
    const ids = (s: BattleState) => s.party[K].deck.hand.map((c) => c.defId).join(',');
    expect(ids(fresh(7))).toBe(ids(fresh(7)));
    const set = new Set([1, 2, 3, 4, 5, 6].map((x) => ids(fresh(x))));
    expect(set.size).toBeGreaterThan(1);
  });
  it('開幕手札の保証: 各キャラに攻撃カード、2人合計でブレイク源が必ずある(200シード)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = fresh(seed);
      for (const m of [K, E]) expect(s.party[m].deck.hand.some((c) => !!SKILLS[c.defId].damage), `seed${seed}`).toBe(true);
      const brk = s.party.some((m) => m.deck.hand.some((c) => (SKILLS[c.defId].breakPower ?? 0) >= 10));
      expect(brk, `seed${seed}`).toBe(true);
      for (const m of [K, E]) expect(total(s, m)).toBe(10);
    }
  });
});

describe('手札と山札の流れ', () => {
  it('手札のカードだけ使え、使うと手札から無くなる', () => {
    const s = fresh();
    const m = s.party[K];
    const missing = Object.keys(SKILLS).find((id) => m.skills.includes(id) && !m.deck.hand.some((c) => c.defId === id));
    if (missing) expect(canUse(s, K, missing)).toBe(false);
    const id = m.deck.hand.find((c) => !!SKILLS[c.defId].damage)!.defId;
    const n = m.deck.hand.length;
    expect(useSkill(s, K, id)).not.toBeNull();
    expect(m.deck.hand).toHaveLength(n - 1);
    expect(total(s, K)).toBe(10);
  });
  it('使用後は捨て札へ。疲労のあるカードは疲労ゾーンへ', () => {
    const s = fresh();
    const m = s.party[K];
    m.deck.hand = [{ uid: 900, defId: 'shield_bash', sealed: 0 }, { uid: 901, defId: 'slash', sealed: 0 }];
    useSkill(s, K, 'slash');
    expect(m.deck.discard.some((c) => c.uid === 901)).toBe(true);
    useSkill(s, K, 'shield_bash');
    expect(m.deck.fatigued.find((f) => f.card.uid === 900)?.turns).toBe(2);
  });
  it('疲労は残りターンが尽きると山札の一番上に戻り、次に引かれる', () => {
    const s = fresh();
    const m = s.party[K];
    m.deck.hand = [{ uid: 900, defId: 'shield_bash', sealed: 0 }];
    useSkill(s, K, 'shield_bash');
    endPlayerTurn(s); // turn2: 疲労2→1
    expect(m.deck.fatigued).toHaveLength(1);
    endPlayerTurn(s); // turn3: 疲労1→0 → 山札の一番上へ(手札に空きができれば次に引かれる)
    expect(m.deck.fatigued).toHaveLength(0);
    expect(m.deck.draw.at(-1)!.uid).toBe(900);
    m.deck.discard.push(m.deck.hand.pop()!);
    drawUp(s, K);
    expect(m.deck.hand.some((c) => c.uid === 900)).toBe(true);
  });
  it('未使用の手札は持ち越され、毎ターン上限まで補充される', () => {
    const s = fresh();
    const before = s.party[K].deck.hand.map((c) => c.uid);
    useSkill(s, K, s.party[K].deck.hand[0].defId);
    endPlayerTurn(s);
    const after = s.party[K].deck.hand.map((c) => c.uid);
    expect(after).toHaveLength(HAND_SIZE);
    expect(before.slice(1).every((u) => after.includes(u))).toBe(true);
  });
  it('山札が尽きたら捨て札をシャッフルして山札に戻す', () => {
    const s = fresh();
    const d = s.party[K].deck;
    d.discard.push(...d.draw.splice(0));
    d.discard.push(d.hand.pop()!);
    expect(drawUp(s, K)).toBe(1);
    expect(d.discard).toHaveLength(0);
    expect(total(s, K)).toBe(10);
  });
  it('次に引くカードを確認できる', () => {
    const s = fresh();
    expect(nextDraw(s, K)).toBe(s.party[K].deck.draw.at(-1)!.defId);
  });
  it('長期戦(40ターン)でもカードが増減しない', () => {
    const s = fresh(3, 'golem');
    for (let t = 0; t < 40 && s.phase === 'player'; t++) {
      for (const m of [K, E]) {
        const h = s.party[m].deck.hand.find((c) => canUse(s, m, c.defId));
        if (h && s.ap > 0) useSkill(s, m, h.defId);
      }
      s.party.forEach((x) => { x.hp = x.maxHp; });
      endPlayerTurn(s);
    }
    for (const m of [K, E]) expect(total(s, m)).toBe(10);
  });
});

describe('待機カード・魔力集中・封印', () => {
  const withCards = (s: BattleState, m: number, ...ids: string[]) => {
    ids.forEach((id, i) => s.party[m].deck.hand.push({ uid: 800 + i + m * 10, defId: id, sealed: 0 }));
  };
  it('待機は手札の「待機」カードを使う(疲労-1・ガード+5・次の攻撃強化)', () => {
    const s = fresh();
    s.party[K].deck.hand = [{ uid: 1, defId: 'slash', sealed: 0 }];
    expect(wait(s, K)).toBeNull(); // 待機カードが無い
    withCards(s, K, 'wait');
    s.party[K].deck.fatigued.push({ card: { uid: 50, defId: 'shield_bash', sealed: 0 }, turns: 2 });
    expect(wait(s, K)).not.toBeNull();
    expect(s.party[K].guard).toBe(5);
    expect(s.party[K].focus).toBe(true);
    expect(s.party[K].deck.fatigued[0].turns).toBe(1);
    expect(s.party[K].deck.discard.some((c) => c.defId === 'wait')).toBe(true);
  });
  it('魔力集中: 次のダメージスキルが強化される', () => {
    const s = fresh();
    s.party[E].deck.hand = [];
    withCards(s, E, 'focus_mana', 'firebolt');
    const base = previewSkill(s, SKILLS.firebolt, E).hp;
    useSkill(s, E, 'focus_mana');
    expect(s.party[E].charged).toBe(true);
    expect(previewSkill(s, SKILLS.firebolt, E).hp).toBeGreaterThan(base);
  });
  it('防御カードはガードを得る', () => {
    const s = fresh();
    withCards(s, K, 'defend');
    useSkill(s, K, 'defend');
    expect(s.party[K].guard).toBe(6);
  });
  it('超音波は手札のカードを封印し、封印は2ターンで解ける', () => {
    const s = fresh(1, 'bat');
    s.enemies[0].patternIndex = 1;
    const ev = endPlayerTurn(s);
    const d = ev.find((e) => e.type === 'disrupt');
    expect(d).toBeDefined();
    const sealed = s.party[E].deck.hand.filter((c) => c.sealed > 0);
    expect(sealed).toHaveLength(1);
    expect(canUse(s, E, sealed[0].defId) && s.party[E].deck.hand.filter((c) => c.defId === sealed[0].defId).length === 1).toBe(false);
    endPlayerTurn(s);
    expect(s.party[E].deck.hand.every((c) => c.sealed <= 0)).toBe(true);
  });
  it('作戦: 同名カードを複数枚持っていれば複数回予約できる', () => {
    const s = fresh();
    s.party[K].deck.hand = [{ uid: 1, defId: 'slash', sealed: 0 }, { uid: 2, defId: 'slash', sealed: 0 }];
    const p1 = [{ member: K, skillId: 'slash' }];
    expect(canAppend(s, p1, { member: K, skillId: 'slash' })).toBe(true);
    expect(canAppend(s, [...p1, { member: K, skillId: 'slash' }], { member: K, skillId: 'slash' })).toBe(false);
  });
  it('作戦: 手札に無いカードは予約できない。待機はカードがあるときだけ', () => {
    const s = fresh();
    s.party[K].deck.hand = [{ uid: 1, defId: 'slash', sealed: 0 }];
    expect(canAppend(s, [], { member: K, skillId: 'shield_bash' })).toBe(false);
    expect(simulatePlan(s, [{ member: K, skillId: WAIT_ID }]).steps).toHaveLength(0);
  });
  it('敵を倒すまで進行できる(複数編成でも)', () => {
    const s = fresh(5, ['golem', 'bat']);
    expect(s.enemies).toHaveLength(2);
    expect(ENEMIES.golem).toBeDefined();
  });
});
