import { describe, expect, it } from 'vitest';
import {
  BattleState, allActed, canUse, createBattle, currentIntent, endPlayerTurn, previewSkill, resolveTarget, startPlayerTurn, useSkill,
} from '../src/core/battle';
import { MEMBERS, SKILLS } from '../src/core/data';

const fresh = (): BattleState => {
  const s = createBattle();
  startPlayerTurn(s);
  return s;
};
const K = 0, E = 1;

describe('パーティ', () => {
  it('前衛ナイトと後衛エレメンタリストの2人で開始し、全スキルが定義済み', () => {
    const s = fresh();
    expect(s.party.map((m) => m.def.id)).toEqual(['knight', 'elementalist']);
    for (const m of s.party) for (const id of m.def.skills) expect(SKILLS[id]).toBeDefined();
    expect(s.party[K].hp).toBe(MEMBERS.knight.maxHp);
  });
});

describe('スキルとクールダウン', () => {
  it('使用後にクールダウンが付き、同ターンは各キャラ1回まで', () => {
    const s = fresh();
    expect(useSkill(s, K, 'shield_bash')).not.toBeNull();
    expect(s.party[K].cooldowns.shield_bash).toBe(2);
    expect(canUse(s, K, 'slash')).toBe(false); // 行動済み
    expect(useSkill(s, K, 'slash')).toBeNull();
    expect(canUse(s, E, 'firebolt')).toBe(true);
  });
  it('CD2のスキルは2ターン後(3ターン目)に再使用できる', () => {
    const s = fresh();
    useSkill(s, K, 'shield_bash');
    endPlayerTurn(s); // turn2
    expect(s.party[K].cooldowns.shield_bash).toBe(1);
    expect(canUse(s, K, 'shield_bash')).toBe(false);
    endPlayerTurn(s); // turn3
    expect(s.turn).toBe(3);
    expect(canUse(s, K, 'shield_bash')).toBe(true);
  });
  it('CD0のスキルは毎ターン使える', () => {
    const s = fresh();
    useSkill(s, K, 'slash');
    endPlayerTurn(s);
    expect(canUse(s, K, 'slash')).toBe(true);
  });
  it('全員行動済みを判定できる', () => {
    const s = fresh();
    expect(allActed(s)).toBe(false);
    useSkill(s, K, 'slash');
    useSkill(s, E, 'firebolt');
    expect(allActed(s)).toBe(true);
  });
});

describe('ダメージ計算', () => {
  it('シールド残存中は物理ダメージが軽減され、シールドゲージが減る', () => {
    const s = fresh();
    useSkill(s, K, 'slash'); // 8 * 0.75 = 6
    expect(s.enemy.hp).toBe(80 - 6);
    expect(s.enemy.shield).toBe(20 - 8);
  });
  it('弱点属性は1.5倍、耐性属性は0.5倍', () => {
    const s = fresh();
    expect(previewSkill(s, SKILLS.firebolt).hp).toBe(Math.floor(7 * 1.5 * 0.75)); // 7
    expect(previewSkill(s, SKILLS.ice_lance).hp).toBe(Math.floor(10 * 0.5 * 0.75)); // 3
    expect(previewSkill(s, SKILLS.thunder).hp).toBe(Math.floor(13 * 0.75)); // 9
  });
  it('プレビューと実際のダメージが一致する', () => {
    const s = fresh();
    const p = previewSkill(s, SKILLS.thunder);
    useSkill(s, E, 'thunder');
    expect(s.enemy.hp).toBe(80 - p.hp);
    expect(s.enemy.shield).toBe(20 - p.shield);
  });
});

describe('ブレイク＆チェイン', () => {
  it('シールドを削り切るとブレイクする', () => {
    const s = fresh();
    const ev = useSkill(s, K, 'shield_bash')!;
    expect(s.enemy.shield).toBe(0);
    expect(s.enemy.broken).toBe(true);
    expect(ev.some((e) => e.type === 'break')).toBe(true);
    expect(previewSkill(s, SKILLS.slash).breaks).toBe(false);
  });
  it('ブレイク中に魔法を当てるとチェイン(2倍)が発生する', () => {
    const s = fresh();
    useSkill(s, K, 'shield_bash');
    const hpBefore = s.enemy.hp;
    const ev = useSkill(s, E, 'firebolt')!;
    const expected = Math.floor(7 * 1.5 * 2); // 弱点×チェイン = 21
    expect(s.enemy.hp).toBe(hpBefore - expected);
    expect(ev.find((e) => e.type === 'chain')).toMatchObject({ amount: expected, element: 'fire' });
  });
  it('チェイン時はシールド軽減が掛からず、物理攻撃ではチェインしない', () => {
    const s = fresh();
    s.enemy.broken = true; s.enemy.shield = 0;
    expect(previewSkill(s, SKILLS.slash)).toMatchObject({ hp: 8, chain: false });
    expect(previewSkill(s, SKILLS.thunder)).toMatchObject({ hp: 26, chain: true });
  });
  it('魔法が先だとブレイクさせてもチェインしない（順序が重要）', () => {
    const s = fresh();
    useSkill(s, E, 'thunder'); // shield 20→10
    const ev = useSkill(s, K, 'shield_bash')!;
    expect(ev.some((e) => e.type === 'chain')).toBe(false);
    expect(s.enemy.broken).toBe(true);
  });
  it('ブレイク中の敵は次の敵ターンに行動不能になり、シールドが全回復する', () => {
    const s = fresh();
    useSkill(s, K, 'shield_bash');
    const ev = endPlayerTurn(s);
    expect(ev.map((e) => e.type)).toEqual(['stunned', 'recover']);
    expect(s.party[K].hp).toBe(90);
    expect(s.enemy.broken).toBe(false);
    expect(s.enemy.shield).toBe(20);
    expect(s.enemy.patternIndex).toBe(0); // 予告していた行動は潰れず持ち越し
  });
  it('シールドはターンを跨いで蓄積ダメージが残る', () => {
    const s = fresh();
    useSkill(s, K, 'slash');
    endPlayerTurn(s);
    expect(s.enemy.shield).toBe(12);
  });
});

describe('敵の行動とヘイト', () => {
  it('前衛狙いの攻撃はナイトに当たる', () => {
    const s = fresh();
    expect(currentIntent(s).target).toBe('front');
    endPlayerTurn(s);
    expect(s.party[K].hp).toBe(90 - 8);
  });
  it('後衛狙いはエレメンタリストに当たるが、挑発でナイトに逸れる', () => {
    const s = fresh();
    s.enemy.patternIndex = 1; // 溶解液(後衛,7)
    const a = structuredClone(s);
    endPlayerTurn(a);
    expect(a.party[E].hp).toBe(60 - 7);
    useSkill(s, K, 'provoke');
    expect(resolveTarget(s, currentIntent(s))).toBe(K);
    endPlayerTurn(s);
    expect(s.party[E].hp).toBe(60);
    expect(s.party[K].hp).toBe(90 - 0); // ガード10 > 7
  });
  it('ガードでダメージを吸収し、ターン開始時に消える', () => {
    const s = fresh();
    useSkill(s, K, 'guardian');
    expect(s.party[K].guard).toBe(6);
    expect(s.party[E].guard).toBe(10);
    endPlayerTurn(s); // 体当たり8: ガード6吸収→2ダメージ
    expect(s.party[K].hp).toBe(88);
    expect(s.party[K].guard).toBe(0);
    expect(s.party[E].guard).toBe(0);
  });
  it('ヒールは全員を回復し、最大HPを超えない', () => {
    const s = fresh();
    s.party[K].hp = 50; s.party[E].hp = 55;
    useSkill(s, E, 'heal');
    expect(s.party[K].hp).toBe(62);
    expect(s.party[E].hp).toBe(60);
  });
});

describe('勝敗', () => {
  it('敵HP0で勝利', () => {
    const s = fresh();
    s.enemy.hp = 3;
    useSkill(s, K, 'slash');
    expect(s.phase).toBe('won');
    expect(canUse(s, E, 'firebolt')).toBe(false);
  });
  it('片方が倒れても戦闘は続き、標的は生存者に切り替わる', () => {
    const s = fresh();
    s.party[K].hp = 5;
    const ev = endPlayerTurn(s);
    expect(ev.some((e) => e.type === 'down')).toBe(true);
    expect(s.phase).toBe('player');
    expect(canUse(s, K, 'slash')).toBe(false);
    s.enemy.patternIndex = 0;
    expect(resolveTarget(s, currentIntent(s))).toBe(E);
  });
  it('全滅で敗北', () => {
    const s = fresh();
    s.party[K].hp = 5; s.party[E].hp = 0;
    endPlayerTurn(s);
    expect(s.phase).toBe('lost');
  });
});
