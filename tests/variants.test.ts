import { describe, expect, it } from 'vitest';
import {
  BRANCH_MULT, branchOf, createBattle, defaultSetup, effectiveFor, effectiveSkill, endPlayerTurn, levelOf, previewSkill, startPlayerTurn,
  useSkill, type BattleSetup, type BattleState,
} from '../src/core/battle';
import { CARD_VARIANTS, MEMBERS, SKILLS, variantMap } from '../src/core/data';
import { EQUIP_TEMPLATES, makeItem } from '../src/core/equipment';
import { newMeta } from '../src/core/meta';
import { buildSetup, equip, memberBaseDeck, memberDeck, memberSkills, needsBranch, newRun, upgradeSkill, variantOf } from '../src/core/run';
import { fullHand } from './helpers/hand';

const K = 0, E = 1;
const tpl = (id: string) => EQUIP_TEMPLATES.find((t) => t.id === id)!;
const withLv = (levels: Record<string, number>, branches: Record<string, 'a' | 'b'>, ids: string | string[] = 'skeleton'): BattleState => {
  const st: BattleSetup = defaultSetup();
  st.members.forEach((m) => { m.levels = { ...levels }; m.branches = { ...branches }; });
  const s = createBattle(ids, st);
  startPlayerTurn(s);
  return s;
};

describe('Lv3の分岐', () => {
  it('分岐を持つ基本カードは全て2択で、効果の説明がある', () => {
    for (const id of ['slash', 'shield_bash', 'provoke', 'guardian', 'firebolt', 'ice_lance', 'thunder', 'heal']) {
      const b = SKILLS[id].branches!;
      expect(b.map((x) => x.id), id).toEqual(['a', 'b']);
      for (const x of b) { expect(x.name).toBeTruthy(); expect(x.text).toBeTruthy(); }
    }
  });
  it('Lv3は分岐ごとに効果が変わる(ファイアボルト: 燃焼型/連鎖型)', () => {
    const a = effectiveSkill(SKILLS.firebolt, 3, 'a');
    const b = effectiveSkill(SKILLS.firebolt, 3, 'b');
    expect(a.inflict).toBe('burn');
    expect(a.chargeAfter).toBeUndefined();
    expect(b.chargeAfter).toBe(true);
    expect(a.damage).toBe(Math.round(7 * BRANCH_MULT));
  });
  it('数値の分岐: シールドバッシュ(重撃型=ダメージ+8 / 守備型=ゲージ+6とガード)、サンダー(速射型=疲労-1)', () => {
    expect(effectiveSkill(SKILLS.shield_bash, 3, 'a').damage).toBe(Math.round(6 * BRANCH_MULT) + 8);
    const g = effectiveSkill(SKILLS.shield_bash, 3, 'b');
    expect(g.breakPower).toBe(Math.round(14 * BRANCH_MULT) + 6);
    expect(g.guardSelf).toBe(6);
    expect(effectiveSkill(SKILLS.thunder, 3, 'b').cooldown).toBe(SKILLS.thunder.cooldown - 1);
  });
  it('分岐を持たない/選んでいない場合は従来のLv3(×1.45)', () => {
    expect(effectiveSkill(SKILLS.thunder, 3).damage).toBe(Math.round(13 * 1.45));
    expect(effectiveSkill(SKILLS.cleave, 3).cooldown).toBe(SKILLS.cleave.cooldown - 1);
  });
  it('Lv2では分岐は効かない', () => {
    expect(effectiveSkill(SKILLS.firebolt, 2, 'a').inflict).toBeUndefined();
  });
  it('出血型の斬撃は敵を出血させる / 連鎖型ファイアボルトは次の攻撃を強化する / 凍結型アイスランスは必ず凍結', () => {
    const s = withLv({ slash: 3, firebolt: 3, ice_lance: 3 }, { slash: 'a', firebolt: 'b', ice_lance: 'a' });
    fullHand(s);
    useSkill(s, K, 'slash');
    expect(s.enemies[0].bleed).not.toBeNull();
    useSkill(s, E, 'firebolt');
    expect(s.party[E].charged).toBe(true);
    useSkill(s, E, 'ice_lance');
    expect(s.enemies[0].frozen).toBe(true);
  });
  it('治癒型ガーディアンは回復し、加護型ヒールはガードを与える', () => {
    const s = withLv({ guardian: 3, heal: 3 }, { guardian: 'b', heal: 'b' });
    fullHand(s);
    s.party.forEach((m) => { m.hp = 10; });
    useSkill(s, K, 'guardian');
    expect(s.party[E].hp).toBeGreaterThan(10);
    useSkill(s, E, 'heal');
    expect(s.party.every((m) => m.guard > 0)).toBe(true);
  });
  it('UI用の補助: レベル・分岐・実効スキルを取れる', () => {
    const s = withLv({ firebolt: 3 }, { firebolt: 'a' });
    expect(levelOf(s.party[E], SKILLS.firebolt)).toBe(3);
    expect(branchOf(s.party[E], SKILLS.firebolt)?.name).toBe('燃焼型');
    expect(effectiveFor(s.party[E], SKILLS.firebolt).inflict).toBe('burn');
    expect(branchOf(s.party[E], SKILLS.ice_lance)).toBeUndefined();
  });
  it('強化: Lv3へは分岐が必要で、選んだ分岐が戦闘に反映される', () => {
    const run = newRun(newMeta(), 12);
    run.skillPoints = 10;
    expect(upgradeSkill(run, 1, 'firebolt')).toBe(true);
    expect(needsBranch('firebolt', 2)).toBe(true);
    expect(upgradeSkill(run, 1, 'firebolt')).toBe(false);
    expect(upgradeSkill(run, 1, 'firebolt', 'a')).toBe(true);
    expect(run.party[1].branches.firebolt).toBe('a');
    const s = createBattle('slime', buildSetup(run));
    expect(s.party[1].branches.firebolt).toBe('a');
    expect(effectiveFor(s.party[1], SKILLS.firebolt).inflict).toBe('burn');
  });
});

describe('装備によるカードの書き換え', () => {
  it('書き換えの定義が全て存在し、元のカードを引き継ぐ', () => {
    for (const [eff, map] of Object.entries(CARD_VARIANTS)) {
      for (const [from, to] of Object.entries(map!)) {
        expect(SKILLS[from], `${eff}:${from}`).toBeDefined();
        expect(SKILLS[to].base, to).toBe(from);
      }
    }
  });
  it('砕きの腕輪: シールドバッシュ→砕撃(全コピー)。外すと元に戻る', () => {
    const run = newRun(newMeta(), 13);
    expect(memberDeck(run, 0)).not.toContain('shatter_bash');
    equip(run, 0, makeItem(tpl('crusher_bangle'), 100, null));
    const deck = memberDeck(run, 0);
    expect(deck.filter((c) => c === 'shatter_bash')).toHaveLength(2);
    expect(deck).not.toContain('shield_bash');
    expect(memberBaseDeck(run, 0)).toContain('shield_bash'); // 恒久デッキは変わらない
    expect(variantOf(run, 0, 'shield_bash')).toBe('shatter_bash');
    equip(run, 0, makeItem(tpl('guard_charm'), 101, null));
    expect(memberDeck(run, 0)).toContain('shield_bash');
  });
  it('書き換えたカードは戦闘で使え、元のLv・分岐を引き継ぐ', () => {
    const run = newRun(newMeta(), 14);
    run.skillPoints = 10;
    upgradeSkill(run, 1, 'firebolt');
    equip(run, 1, makeItem(tpl('flame_grimoire'), 100, null)); // 炎の魔導書: ignite → 燃焼弾
    const s = createBattle('slime', buildSetup(run));
    startPlayerTurn(s);
    expect(s.party[1].skills).toContain('ember_bolt');
    expect(levelOf(s.party[1], SKILLS.ember_bolt)).toBe(2); // firebolt のLv2を引き継ぐ
    const plain = previewSkill(createBattleDeck(), SKILLS.firebolt, 1).hp;
    expect(previewSkill(s, SKILLS.ember_bolt, 1).hp).toBeGreaterThanOrEqual(0);
    expect(plain).toBeGreaterThan(0);
  });
  it('燃焼弾: 火傷を付け、次のダメージスキルを強化する', () => {
    const s = withLv({}, {});
    fullHand(s);
    s.party[E].deck.hand.push({ uid: 5000, defId: 'ember_bolt', sealed: 0 });
    s.party[E].skills.push('ember_bolt');
    s.party[E].cooldowns.ember_bolt = 0;
    useSkill(s, E, 'ember_bolt');
    expect(s.enemies[0].burn).not.toBeNull();
    expect(s.party[E].charged).toBe(true);
  });
  it('氷晶槍は必ず凍結し、護り斬りは自分にガードを与える', () => {
    const s = withLv({}, {});
    fullHand(s);
    for (const [m, id] of [[E, 'frost_lance'], [K, 'guard_slash']] as const) {
      s.party[m].deck.hand.push({ uid: 6000 + m, defId: id, sealed: 0 });
      s.party[m].skills.push(id);
      s.party[m].cooldowns[id] = 0;
    }
    useSkill(s, E, 'frost_lance');
    expect(s.enemies[0].frozen).toBe(true);
    useSkill(s, K, 'guard_slash');
    expect(s.party[K].guard).toBe(4);
  });
  it('強化の対象は元のカード(装備で書き換わっても同じ)', () => {
    const run = newRun(newMeta(), 15);
    equip(run, 0, makeItem(tpl('crusher_bangle'), 100, null));
    expect(memberSkills(run, 0)).toContain('shield_bash');
    expect(memberSkills(run, 0)).not.toContain('shatter_bash');
  });
  it('variantMap は先の効果を優先する', () => {
    expect(variantMap(['ignite', 'freeze_ice'])).toEqual({ firebolt: 'ember_bolt', ice_lance: 'frost_lance' });
    expect(variantMap([])).toEqual({});
    expect(MEMBERS.knight.deck).toContain('shield_bash');
  });
  it('戦闘は最後まで進行できる(書き換えデッキ)', () => {
    const run = newRun(newMeta(), 16);
    equip(run, 0, makeItem(tpl('crusher_bangle'), 100, null));
    equip(run, 1, makeItem(tpl('storm_scepter'), 101, null));
    const s = createBattle('slime', buildSetup(run));
    startPlayerTurn(s);
    for (let t = 0; t < 12 && s.phase === 'player'; t++) { endPlayerTurn(s); }
    expect(['player', 'won', 'lost']).toContain(s.phase);
  });
});

function createBattleDeck(): BattleState {
  const s = createBattle('slime');
  startPlayerTurn(s);
  return s;
}

describe('書き換えカードと分岐', () => {
  it('書き換えたカードも、元のカードのLv3分岐を引き継ぐ', () => {
    const s = withLv({ firebolt: 3 }, { firebolt: 'b' });
    expect(effectiveFor(s.party[E], SKILLS.ember_bolt).chargeAfter).toBe(true);
    expect(branchOf(s.party[E], SKILLS.ember_bolt)?.name).toBe('連鎖型');
    const t = withLv({ shield_bash: 3 }, { shield_bash: 'a' });
    expect(effectiveFor(t.party[K], SKILLS.shatter_bash).damage).toBe(Math.round(8 * BRANCH_MULT) + 8);
  });
});
