import { describe, expect, it } from 'vitest';
import {
  CHAIN_MULT, createBattle, currentIntent, effectiveSkill, endPlayerTurn, intentValue, previewSkill, startPlayerTurn,
  useSkill, wait, defaultSetup, type BattleSetup, type BattleState,
} from '../src/core/battle';
import { ENEMIES, SKILLS } from '../src/core/data';
import { enemyScale, newRun, upgradeSkill, openChest, finishBattle, memberMaxHp, buildSetup, startBattle } from '../src/core/run';
import { newMeta } from '../src/core/meta';
import { RUN_MODS, rollModChoices } from '../src/core/mods';
import { Rng } from '../src/core/rng';
import type { MapNode } from '../src/core/map';
import { fullHand } from './helpers/hand';

const K = 0;
const E = 1;
const fresh = (id = 'skeleton', setup: BattleSetup = defaultSetup()): BattleState => {
  const s = createBattle(id, setup);
  startPlayerTurn(s);
  return s;
};
const brokenEnemy = (s: BattleState): void => { s.enemy.broken = true; s.enemy.shield = 0; };
const node = (type: MapNode['type'], row: number, danger = false): MapNode => ({ id: 0, row, col: 0, type, next: [], danger });

describe('条件付きスキル', () => {
  it('シールドバッシュ: シールド10以上ならブレイク力+10', () => {
    const s = fresh('golem');
    expect(previewSkill(s, SKILLS.shield_bash, K).shield).toBe(24);
    s.enemy.shield = 9;
    expect(previewSkill(s, SKILLS.shield_bash, K).shield).toBe(9);
  });
  it('サンダー: シールド残量が少ないほどブレイク力が伸びる', () => {
    const s = fresh('skeleton');
    expect(previewSkill(s, SKILLS.thunder, E).shield).toBe(10);
    s.enemy.shield = 12;
    const p = previewSkill(s, SKILLS.thunder, E);
    expect(p.shield).toBe(12);
    expect(p.breaks).toBe(true);
    expect(p.conds.length).toBe(1);
  });
  it('アイスランスはブレイク中の敵を凍結し、復帰時のシールドが半分になる', () => {
    const s = fresh('skeleton');
    brokenEnemy(s);
    useSkill(s, E, 'ice_lance');
    expect(s.enemy.frozen).toBe(true);
    endPlayerTurn(s);
    expect(s.enemy.shield).toBe(Math.floor(s.enemy.maxShield * 0.5));
    expect(s.enemy.frozen).toBe(false);
  });
  it('ファイアボルトは火傷中の敵に+5、斬撃は出血中に+4', () => {
    const s = fresh('bat');
    const base = previewSkill(s, SKILLS.firebolt, E).hp;
    s.enemy.burn = { turns: 2, dmg: 4 };
    expect(previewSkill(s, SKILLS.firebolt, E).hp).toBeGreaterThan(base);
    const b0 = previewSkill(s, SKILLS.slash, K).hp;
    s.enemy.bleed = { turns: 2, dmg: 4 };
    expect(previewSkill(s, SKILLS.slash, K).hp).toBeGreaterThan(b0);
  });
  it('プレビューと実ダメージが一致する(条件・反応込み)', () => {
    const s = fresh('skeleton');
    s.enemy.lastElement = 'fire';
    brokenEnemy(s);
    const p = previewSkill(s, SKILLS.thunder, E);
    const hp0 = s.enemy.hp;
    useSkill(s, E, 'thunder');
    expect(hp0 - s.enemy.hp).toBe(p.hp - p.absorbed);
  });
});

describe('属性チェイン反応', () => {
  const chain = (prev: 'fire' | 'ice' | 'thunder', skill: string) => {
    const s = fresh('skeleton');
    s.enemy.lastElement = prev;
    brokenEnemy(s);
    const ev = useSkill(s, E, skill)!;
    return { s, ev };
  };
  it('火→雷: 感電爆発(追加ダメージ+味方が帯電)', () => {
    const { s, ev } = chain('fire', 'thunder');
    expect(ev.some((e) => e.type === 'reaction' && e.id === 'shock')).toBe(true);
    expect(s.party.every((m) => m.charged)).toBe(true);
    expect(previewSkill(s, SKILLS.thunder, E).hp).toBeGreaterThan(0);
  });
  it('帯電すると次のダメージスキルが+30%で、使うと消える', () => {
    const s = fresh('skeleton');
    const base = previewSkill(s, SKILLS.slash, K).hp;
    s.party[K].charged = true;
    expect(previewSkill(s, SKILLS.slash, K).hp).toBeGreaterThan(base);
    useSkill(s, K, 'slash');
    expect(s.party[K].charged).toBe(false);
  });
  it('雷→火: 過電流(強火傷) / 氷→雷: 凍結粉砕 / 雷→氷: 超伝導でCD-1', () => {
    expect(chain('thunder', 'firebolt').s.enemy.burn).toEqual({ turns: 3, dmg: 5 });
    expect(chain('ice', 'thunder').s.enemy.frozen).toBe(true);
    const s = fresh('skeleton');
    s.party[K].cooldowns.shield_bash = 2;
    s.enemy.lastElement = 'thunder';
    brokenEnemy(s);
    useSkill(s, E, 'ice_lance');
    expect(s.party[K].cooldowns.shield_bash).toBe(1);
  });
  it('火→氷: 蒸気爆発で敵が弱体化し、次の攻撃が25%減る', () => {
    const { s } = chain('fire', 'ice_lance');
    expect(s.enemy.weakened).toBe(true);
    const v = intentValue(s);
    s.enemy.weakened = false;
    expect(v).toBeLessThan(intentValue(s));
  });
  it('同属性の連続・非ブレイク中では反応しない', () => {
    const s = fresh('skeleton');
    s.enemy.lastElement = 'fire';
    expect(previewSkill(s, SKILLS.thunder, E).reaction).toBeNull();
    brokenEnemy(s);
    expect(previewSkill(s, SKILLS.firebolt, E).reaction).toBeNull();
  });
  it('ブレイク復帰で反応の起点がリセットされる', () => {
    const s = fresh('skeleton');
    useSkill(s, E, 'firebolt');
    expect(s.enemy.lastElement).toBe('fire');
    brokenEnemy(s);
    endPlayerTurn(s);
    expect(s.enemy.lastElement).toBeNull();
  });
});

describe('待機', () => {
  it('待機で自分のCD-1・ガード+5・次のスキルが強化される', () => {
    const s = fresh('skeleton');
    s.party[K].cooldowns.shield_bash = 2;
    const base = previewSkill(s, SKILLS.slash, K);
    expect(wait(s, K)).not.toBeNull();
    expect(s.ap).toBe(2);
    expect(s.party[K].cooldowns.shield_bash).toBe(1);
    expect(s.party[K].guard).toBe(5);
    expect(wait(s, K)).toBeNull(); // 同じターンに待機は1回まで
    const next = previewSkill(s, SKILLS.slash, K);
    expect(next.hp).toBeGreaterThanOrEqual(base.hp);
    expect(next.shield).toBe(base.shield + 5);
    endPlayerTurn(s);
    useSkill(s, K, 'slash');
    expect(s.party[K].focus).toBe(false);
  });
});

describe('敵の予告行動と特性', () => {
  it('スケルトンの強攻撃(大振り)はブレイクで阻止できる', () => {
    const s = fresh('skeleton');
    s.enemy.patternIndex = 3;
    expect(currentIntent(s).kind).toBe('heavy');
    brokenEnemy(s);
    const hp = s.party[K].hp;
    const ev = endPlayerTurn(s);
    expect(ev.some((e) => e.type === 'canceled')).toBe(true);
    expect(s.party[K].hp).toBe(hp);
    expect(s.enemy.patternIndex).toBe(4);
  });
  it('溜め中にブレイクすると、続く強攻撃まで消える', () => {
    const s = fresh('skeleton');
    s.enemy.patternIndex = 2;
    brokenEnemy(s);
    endPlayerTurn(s);
    expect(currentIntent(s).name).toBe('斬りつけ');
  });
  it('溜めは攻撃せず、次のターンに強攻撃が来る', () => {
    const s = fresh('skeleton');
    s.enemy.patternIndex = 2;
    const hp = s.party.map((m) => m.hp);
    endPlayerTurn(s);
    expect(s.party.map((m) => m.hp)).toEqual(hp);
    expect(currentIntent(s).kind).toBe('heavy');
  });
  it('ゴーレムの構えは防御値を得て、ダメージを先に吸収する', () => {
    const s = fresh('golem');
    s.enemy.patternIndex = 1;
    const ev = endPlayerTurn(s);
    expect(ev.some((e) => e.type === 'enemyGuard')).toBe(true);
    expect(s.enemy.guard).toBe(22);
    const hp0 = s.enemy.hp;
    const p = previewSkill(s, SKILLS.firebolt, E);
    expect(p.absorbed).toBe(Math.min(22, p.hp));
    useSkill(s, E, 'firebolt');
    expect(hp0 - s.enemy.hp).toBe(p.hp - p.absorbed);
    expect(s.enemy.guard).toBe(22 - p.absorbed);
  });
  it('ゴーレムのシールド中は被ダメージ半減、スライムは物理に強い', () => {
    const g = fresh('golem');
    expect(previewSkill(g, SKILLS.firebolt, E).hp).toBe(Math.floor(7 * 0.5 * 0.5));
    const sl = fresh('slime');
    expect(previewSkill(sl, SKILLS.slash, K).hp).toBeLessThan(previewSkill(fresh('bat'), SKILLS.slash, K).hp);
  });
  it('コウモリは与えたダメージの半分を回復する', () => {
    const s = fresh('bat');
    s.enemy.hp -= 20;
    s.enemy.patternIndex = 2; // 体当たり(前衛)
    const before = s.enemy.hp;
    const ev = endPlayerTurn(s);
    expect(ev.some((e) => e.type === 'enemyHeal')).toBe(true);
    expect(s.enemy.hp).toBeGreaterThan(before);
  });
  it('竜は形態が変わるたび攻撃力が上がる(激昂)', () => {
    const s = fresh('dragon');
    const v = intentValue(s);
    useSkill(s, E, 'firebolt'); // 形態変化を直接起こす
    s.enemy.hp = Math.floor(s.enemy.maxHp * 0.2);
    useSkill(s, K, 'slash');
    expect(s.enemy.phase).toBe(2);
    expect(intentValue(s)).toBeGreaterThan(v);
  });
  it('全ての敵に特性の説明がある', () => {
    for (const e of Object.values(ENEMIES)) expect(e.traits?.text.length).toBeGreaterThan(0);
  });
});

describe('継続ダメージ', () => {
  it('火傷・出血は敵のターン開始時にガードを無視して減り、ターン数が尽きると消える', () => {
    const s = fresh('golem');
    s.enemy.guard = 50;
    s.enemy.burn = { turns: 2, dmg: 4 };
    s.enemy.bleed = { turns: 1, dmg: 4 };
    const hp = s.enemy.hp;
    endPlayerTurn(s);
    expect(s.enemy.hp).toBe(hp - 8);
    expect(s.enemy.bleed).toBeNull();
    expect(s.enemy.burn?.turns).toBe(1);
  });
  it('DoTで倒せば敵は行動せず勝利する', () => {
    const s = fresh('slime');
    s.enemy.hp = 3;
    s.enemy.burn = { turns: 2, dmg: 4 };
    const ev = endPlayerTurn(s);
    expect(s.phase).toBe('won');
    expect(ev.some((e) => e.type === 'enemyAttack')).toBe(false);
  });
});

describe('装備の固有効果', () => {
  const withEffects = (role: 0 | 1, effects: string[]): BattleSetup => {
    const st = defaultSetup();
    (st.members[role] as { effects: string[] }).effects = effects;
    return st;
  };
  it('砕きの腕輪: ブレイクで敵が出血する', () => {
    const s = fresh('slime', withEffects(K, ['bleed_on_break']) );
    s.enemy.shield = 5;
    useSkill(s, K, 'slash');
    expect(s.enemy.broken).toBe(true);
    expect(s.enemy.bleed).not.toBeNull();
  });
  it('炎の魔導書: 火属性攻撃で火傷', () => {
    const s = fresh('skeleton', withEffects(E, ['ignite']));
    useSkill(s, E, 'firebolt');
    expect(s.enemy.burn).not.toBeNull();
  });
  it('守護の剣: ガード中は与ダメージ+20%', () => {
    const s = fresh('skeleton', withEffects(K, ['guard_power']));
    const base = previewSkill(s, SKILLS.slash, K).hp;
    s.party[K].guard = 5;
    expect(previewSkill(s, SKILLS.slash, K).hp).toBeGreaterThanOrEqual(base);
    s.enemy.broken = true; s.enemy.shield = 0;
    const a = previewSkill(s, SKILLS.slash, K).hp;
    s.party[K].guard = 0;
    expect(a).toBeGreaterThan(previewSkill(s, SKILLS.slash, K).hp);
  });
  it('竜の心臓: HP50%以下でターン開始時にCD-1', () => {
    const s = fresh('skeleton', withEffects(K, ['low_hp_cd']));
    s.party[K].cooldowns.shield_bash = 2;
    s.party[K].hp = Math.floor(s.party[K].maxHp * 0.4);
    endPlayerTurn(s);
    expect(s.party[K].cooldowns.shield_bash).toBe(0);
  });
  it('騎士の大剣: ブレイク時に全員ガード+8', () => {
    const s = fresh('slime', withEffects(K, ['break_guard']));
    s.enemy.shield = 5;
    useSkill(s, K, 'slash');
    expect(s.party.every((m) => m.guard >= 8)).toBe(true);
  });
  it('嵐の王笏: 反応ダメージが1.5倍', () => {
    const a = fresh('skeleton'); brokenEnemy(a); a.enemy.lastElement = 'fire';
    const b = fresh('skeleton', withEffects(E, ['storm_chain'])); brokenEnemy(b); b.enemy.lastElement = 'fire';
    expect(previewSkill(b, SKILLS.thunder, E).hp - previewSkill(a, SKILLS.thunder, E).hp).toBe(6);
  });
});

describe('スキルレベル', () => {
  it('Lv2は×1.2、Lv3は×1.45で、CD2以上は-1', () => {
    const sk = SKILLS.thunder;
    expect(effectiveSkill(sk, 2).damage).toBe(Math.round(13 * 1.2));
    expect(effectiveSkill(sk, 3).damage).toBe(Math.round(13 * 1.45));
    expect(effectiveSkill(sk, 3).cooldown).toBe(sk.cooldown - 1);
    expect(effectiveSkill(SKILLS.slash, 3).cooldown).toBe(0);
  });
  it('スキルポイントで強化でき、戦闘に反映される', () => {
    const run = newRun(newMeta(), 7);
    expect(upgradeSkill(run, 0, 'slash')).toBe(false);
    run.skillPoints = 3;
    expect(upgradeSkill(run, 0, 'slash')).toBe(true);
    expect(upgradeSkill(run, 0, 'slash')).toBe(false); // Lv3へは分岐の選択が必要
    expect(upgradeSkill(run, 0, 'slash', 'b')).toBe(true);
    expect(upgradeSkill(run, 0, 'slash', 'a')).toBe(false); // 最大Lv
    expect(run.skillPoints).toBe(0);
    expect(run.party[0].levels.slash).toBe(3);
    const s = createBattle('bat', buildSetup(run));
    startPlayerTurn(s);
    const lv1 = createBattle('bat'); startPlayerTurn(lv1);
    expect(previewSkill(s, SKILLS.slash, 0).hp).toBeGreaterThan(previewSkill(lv1, SKILLS.slash, 0).hp);
  });
  it('持っていないスキルは強化できない', () => {
    const run = newRun(newMeta(), 7);
    run.skillPoints = 5;
    expect(upgradeSkill(run, 0, 'dragon_slash')).toBe(false);
  });
});

describe('今回の旅(ランの特殊条件)', () => {
  it('3択が重複なく提示される', () => {
    const c = rollModChoices(new Rng(3));
    expect(new Set(c.map((m) => m.id)).size).toBe(3);
    expect(RUN_MODS.length).toBeGreaterThanOrEqual(6);
  });
  it('炎の旅: 火+30%・氷スキルのCD+1', () => {
    const mods = RUN_MODS.find((m) => m.id === 'fire')!;
    const run = newRun(newMeta(), 5, mods);
    const s = fullHand(startBattle(run, node('battle', 0)));
    const plain = fresh('slime');
    // 同条件(スライムのシールド)での比較。火力は+30%
    expect(previewSkill(s, SKILLS.firebolt, E).hp).toBeGreaterThan(previewSkill(plain, SKILLS.firebolt, E).hp);
    s.enemy.def.id; // 参照のみ
    useSkill(s, E, 'ice_lance');
    expect(s.party[E].deck.fatigued.find((f) => f.card.defId === 'ice_lance')?.turns).toBe(2); // 氷は疲労+1
  });
  it('砕きの旅: ブレイク+50%で敵HP+20%', () => {
    const mods = RUN_MODS.find((m) => m.id === 'crush')!;
    expect(enemyScale(node('battle', 2), mods).hp).toBeCloseTo(enemyScale(node('battle', 2)).hp * 1.2);
    const run = newRun(newMeta(), 5, mods);
    const s = fresh('golem', buildSetup(run));
    expect(previewSkill(s, SKILLS.slash, K).shield).toBe(Math.floor(8 * 1.5));
  });
  it('鉄の旅: ガード量+50%', () => {
    const run = newRun(newMeta(), 5, RUN_MODS.find((m) => m.id === 'iron')!);
    const s = fullHand(fresh('slime', buildSetup(run)));
    useSkill(s, K, 'provoke');
    const plain = fresh('slime');
    useSkill(plain, K, 'provoke');
    expect(s.party[K].guard).toBeGreaterThan(plain.party[K].guard);
  });
});

describe('マップのリスクとリターン', () => {
  it('危険な戦闘は敵が強く、報酬が2倍で装備が確定する', () => {
    const a = enemyScale(node('battle', 4));
    const d = enemyScale(node('battle', 4, true));
    expect(d.hp).toBeGreaterThan(a.hp);
    expect(d.atk).toBeGreaterThan(a.atk);
    const run = newRun(newMeta(), 11);
    const s = fresh('slime');
    s.enemy.hp = 0; s.phase = 'won';
    const r = finishBattle(run, s, node('battle', 4, true));
    expect(r.item).not.toBeNull();
    expect(r.skillPoints).toBe(1);
  });
  it('エリートは確定でRare以上、SP+2、敵が強い', () => {
    const run = newRun(newMeta(), 12);
    const s = fresh('golem');
    s.enemy.hp = 0; s.phase = 'won';
    const r = finishBattle(run, s, node('elite', 4));
    expect(['rare', 'legendary']).toContain(r.item!.rarity);
    expect(r.skillPoints).toBe(2);
    expect(enemyScale(node('elite', 4)).hp).toBeGreaterThan(enemyScale(node('battle', 4)).hp);
  });
  it('呪われた宝箱: 強い装備の代わりに最大HPが10%減る', () => {
    const run = newRun(newMeta(), 13);
    const max = memberMaxHp(run, 0);
    const r = openChest(run, true);
    expect(['rare', 'legendary']).toContain(r.item!.rarity);
    expect(run.curse).toBe(1);
    expect(memberMaxHp(run, 0)).toBe(Math.round(max * 0.9));
    expect(run.party[0].hp).toBeLessThanOrEqual(memberMaxHp(run, 0));
  });
  it('チェイン倍率定数は据え置き', () => {
    expect(CHAIN_MULT).toBe(2);
  });
});

describe('待機のバランス', () => {
  it('CD0スキルでは、毎ターン攻撃する方が待機→強化攻撃より2ターン合計で強い', () => {
    const atk = fresh('skeleton');
    const d1 = previewSkill(atk, SKILLS.slash, K).hp;
    const twoAttacks = d1 * 2;
    const w = fresh('skeleton');
    wait(w, K);
    const d2 = previewSkill(w, SKILLS.slash, K).hp; // 次ターンに強化攻撃(待機のターンは攻撃していない)
    expect(twoAttacks).toBeGreaterThan(d2);
  });
  it('待機は「使えるスキルが無いターン」や CD短縮・ガードに価値がある', () => {
    const s = fresh('skeleton');
    s.party[K].cooldowns.shield_bash = 1;
    wait(s, K);
    expect(s.party[K].cooldowns.shield_bash).toBe(0);
  });
});

import { recommend } from '../src/core/hint';
describe('ヒント(任意表示)', () => {
  it('強攻撃の前はブレイクを促し、ブレイク中はチェインを促す', () => {
    const s = fresh('skeleton');
    s.enemy.patternIndex = 3;
    expect(recommend(s)).toContain('ブレイク');
    brokenEnemy(s);
    expect(recommend(s)).toContain('チェイン');
  });
  it('常に1行の文字列を返し、戦闘終了後は null', () => {
    const s = fresh('slime');
    expect(typeof recommend(s)).toBe('string');
    s.phase = 'won';
    expect(recommend(s)).toBeNull();
  });
});
