import { describe, expect, it } from 'vitest';
import { BGM_TARGET_DB, SFX_KINDS, SFX_TARGET_DB } from '../src/audio';

describe('音量設計（ラウドネス階層）', () => {
  it('全ての効果音に目標ラウドネスがあり、現実的な範囲(-40〜-5dBFS)にある', () => {
    expect(new Set(SFX_KINDS).size).toBe(SFX_KINDS.length);
    for (const k of SFX_KINDS) {
      expect(SFX_TARGET_DB[k], k).toBeDefined();
      expect(SFX_TARGET_DB[k]).toBeGreaterThanOrEqual(-40);
      expect(SFX_TARGET_DB[k]).toBeLessThanOrEqual(-5);
    }
    expect(Object.keys(SFX_TARGET_DB).sort()).toEqual([...SFX_KINDS].sort());
  });
  it('UI音 < 通常SE < 戦闘SE < ブレイク < チェイン の順に大きい', () => {
    const d = SFX_TARGET_DB;
    expect(d.hover).toBeLessThan(d.click);
    expect(d.click).toBeLessThan(d.skill);
    expect(d.skill).toBeLessThan(d.hit);
    expect(d.hit).toBeLessThan(d.break);
    expect(d.break).toBeLessThan(d.chain);
    expect(d.enemyHit).toBeGreaterThan(d.block);
  });
  it('BGMは戦闘SEを覆い隠さない（戦闘SEより10dB以上小さい）', () => {
    for (const k of ['skill', 'magic', 'enemyHit', 'hit', 'block', 'break', 'chain'] as const) {
      expect(SFX_TARGET_DB[k] - BGM_TARGET_DB, k).toBeGreaterThanOrEqual(10);
    }
  });
});

// ---------------------------------------------------------------- 音声ファイル取り込み
import { readdirSync, readFileSync } from 'node:fs';
import { FALLBACK } from '../src/audio';
import { bgmForScene, castCue, deathCue, enemyAttackCue, hurtCue, impactCues } from '../src/audio/cues';
import { SOUNDS, fileKeys } from '../src/audio/ids';
import { FILE_TARGET_DB, idOfKey, trimFor } from '../src/audio/targets';
import { SKILLS } from '../src/core/data';

const files = readdirSync('src/assets/audio').filter((f) => /\.(wav|mp3)$/i.test(f)).map((f) => f.replace(/\.[^.]+$/, ''));
const trims = JSON.parse(readFileSync('src/audio/trims.json', 'utf8')) as Record<string, number>;

describe('音声ファイルとマニフェスト', () => {
  it('マニフェストの全ファイルキーが src/assets/audio にあり、余分なファイルも無い', () => {
    const keys = SOUNDS.flatMap((d) => fileKeys(d));
    expect(new Set(keys).size).toBe(keys.length);
    expect([...files].sort()).toEqual([...keys].sort());
  });
  it('全IDに合成音フォールバックと目標ラウドネスがある', () => {
    for (const d of SOUNDS) {
      expect(d.id in FALLBACK, `FALLBACK ${d.id}`).toBe(true);
      expect(FILE_TARGET_DB[d.id], `target ${d.id}`).toBeDefined();
    }
    for (const [id, kind] of Object.entries(FALLBACK)) if (kind) expect(SFX_KINDS, id).toContain(kind);
  });
  it('補正値(trims.json)が全ファイルにあり、妥当な範囲(0.05〜4)', () => {
    for (const k of files) {
      expect(trims[k], k).toBeDefined();
      expect(trims[k]).toBeGreaterThan(0.05);
      expect(trims[k]).toBeLessThanOrEqual(4);
    }
  });
  it('目標ラウドネスの階層: UI < 通常SE < 戦闘SE < ブレイク < チェイン、BGMは戦闘SEより10dB以上小さい', () => {
    const t = FILE_TARGET_DB;
    expect(t.ui_click).toBeLessThan(t.atk_slash);
    expect(t.atk_slash).toBeLessThan(t.hit_party_l);
    expect(t.hit_party_l).toBeLessThan(t.fx_break);
    expect(t.fx_break).toBeLessThan(t.fx_chain);
    for (const id of ['atk_slash', 'atk_bash', 'mag_hit_fire', 'hit_enemy', 'fx_break', 'fx_chain'] as const) {
      expect(t.atk_slash - t.bgm_battle).toBeGreaterThanOrEqual(10);
      expect(t[id] - t.bgm_map).toBeGreaterThanOrEqual(10);
    }
  });
  it('ファイルキー→ID変換と補正ゲイン計算', () => {
    expect(idOfKey('atk_slash_2')).toBe('atk_slash');
    expect(idOfKey('bgm_town')).toBe('bgm_town');
    expect(idOfKey('nope')).toBeNull();
    expect(trimFor(-10, -16, 0.5)).toBeCloseTo(0.501, 2); // 6dB下げる
    expect(trimFor(-30, -16, 0.9)).toBeCloseTo(1, 5); // 上げたいがピーク上限で頭打ち
    expect(trimFor(-30, -16, 0)).toBeLessThanOrEqual(4);
  });
});

describe('ゲーム状況→音IDの対応', () => {
  it('スキルの発動音: 物理はスキル別、魔法は属性別、補助はイベント側で鳴らすので無し', () => {
    expect(castCue(SKILLS.slash)?.id).toBe('atk_slash');
    expect(castCue(SKILLS.shield_bash)?.id).toBe('atk_bash');
    expect(castCue(SKILLS.dragon_slash)?.id).toBe('atk_heavy');
    expect(castCue(SKILLS.firebolt)?.id).toBe('mag_cast_fire');
    expect(castCue(SKILLS.ice_lance)?.id).toBe('mag_cast_ice');
    expect(castCue(SKILLS.thunder)?.id).toBe('mag_cast_thunder');
    expect(castCue(SKILLS.heal)).toBeNull();
    expect(castCue(SKILLS.provoke)).toBeNull();
  });
  it('命中音: 属性ヒット＋弱点/耐性の強調', () => {
    const ids = (e: Parameters<typeof impactCues>[0]) => impactCues(e).map((c) => c.id);
    expect(ids({ element: 'fire', weak: true, resist: false })).toEqual(['mag_hit_fire', 'hit_weak']);
    expect(ids({ element: 'ice', weak: false, resist: true })).toEqual(['mag_hit_ice', 'hit_resist']);
    expect(ids({ element: 'thunder', weak: false, resist: false })).toEqual(['mag_hit_thunder']);
    expect(ids({ element: 'none', weak: false, resist: false })).toEqual(['hit_enemy']);
  });
  it('被弾音: 完全ガード/小/大', () => {
    expect(hurtCue(0).id).toBe('hit_blocked');
    expect(hurtCue(6).id).toBe('hit_party_s');
    expect(hurtCue(12).id).toBe('hit_party_l');
  });
  it('敵の攻撃音: 敵ごと。竜は全体攻撃でブレス。専用音の無いコウモリは斬撃を流用', () => {
    const it = (target: 'front' | 'back' | 'all') => ({ name: 'x', value: 1, target });
    expect(enemyAttackCue('slime', it('front'))?.id).toBe('en_slime');
    expect(enemyAttackCue('golem', it('all'))?.id).toBe('en_golem');
    expect(enemyAttackCue('dragon', it('front'))?.id).toBe('en_dragon_claw');
    expect(enemyAttackCue('dragon', it('all'))?.id).toBe('en_dragon_breath');
    expect(enemyAttackCue('bat', it('back'))).toEqual({ id: 'atk_slash', rate: 1.5 });
    expect(enemyAttackCue('unknown', it('front'))).toBeNull();
    expect(deathCue('dragon').id).toBe('die_boss');
    expect(deathCue('slime').id).toBe('die_large');
  });
  it('場面ごとのBGM', () => {
    expect(bgmForScene('Title')).toBe('bgm_town');
    expect(bgmForScene('Town')).toBe('bgm_town');
    expect(bgmForScene('Map')).toBe('bgm_map');
    expect(bgmForScene('Shop')).toBe('bgm_map');
    expect(bgmForScene('Battle')).toBe('bgm_battle');
    expect(bgmForScene('Battle', { boss: true })).toBe('bgm_boss');
    expect(bgmForScene('RunEnd')).toBeNull();
  });
});
