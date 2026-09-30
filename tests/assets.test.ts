import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENEMIES, SKILLS } from '../src/core/data';
import { EQUIP_TEMPLATES, makeItem } from '../src/core/equipment';
import {
  ENEMY_DISPLAY_H, HERO_SPRITE, bgKeyFor, elementIconKey, enemySpriteKey, equipIconKey, nodeIconKey, skillIconKey,
} from '../src/ui/assetMap';

const manifest = JSON.parse(readFileSync('src/assets/img/manifest.json', 'utf8')) as Record<string, { w: number; h: number }>;
const files = readdirSync('src/assets/img').filter((f) => f.endsWith('.webp')).map((f) => f.replace('.webp', ''));
const has = (k: string | null) => !!k && k in manifest;

describe('画像アセットと参照キーの整合', () => {
  it('素材の元(一覧画像)と、出力WebP/マニフェストが揃っている', () => {
    expect(existsSync('art/sheet/concept-sheet.webp')).toBe(true);
    expect([...files].sort()).toEqual(Object.keys(manifest).sort());
    for (const k of files) {
      expect(manifest[k].w, k).toBeGreaterThan(8);
      expect(manifest[k].h, k).toBeGreaterThan(8);
    }
  });
  it('単体HTML(20MB上限)に収まる容量（画像合計 3MB 以内）', () => {
    const total = files.reduce((a, k) => a + statSync(`src/assets/img/${k}.webp`).size, 0);
    expect(total).toBeLessThan(3 * 1024 * 1024);
  });
  it('全スキルにアイコンがある', () => {
    for (const id of Object.keys(SKILLS)) expect(has(skillIconKey(id)), id).toBe(true);
  });
  it('全装備テンプレートにアイコンがある（部位×レア度 / 固有）', () => {
    EQUIP_TEMPLATES.forEach((t, i) => expect(has(equipIconKey(makeItem(t, i, null))), t.id).toBe(true));
  });
  it('全属性・ノード種別のアイコンがある', () => {
    for (const el of ['none', 'fire', 'ice', 'thunder'] as const) expect(has(elementIconKey(el)), el).toBe(true);
    for (const t of ['battle', 'chest', 'rest', 'shop', 'boss']) expect(has(nodeIconKey(t)), t).toBe(true);
    expect(has(nodeIconKey('', 'visited')) && has(nodeIconKey('', 'current'))).toBe(true);
  });
  it('全ての敵にスプライトと表示サイズがある', () => {
    for (const id of Object.keys(ENEMIES)) {
      expect(has(enemySpriteKey(id)), id).toBe(true);
      expect(ENEMY_DISPLAY_H[id], id).toBeGreaterThan(50);
    }
  });
  it('両キャラの全ポーズ(待機/攻撃/被弾/戦闘不能)がある', () => {
    for (const role of ['knight', 'elementalist']) {
      for (const pose of ['idle', 'attack', 'hit', 'down'] as const) expect(has(HERO_SPRITE[role]![pose]), `${role}/${pose}`).toBe(true);
    }
  });
  it('場面ごとの背景キーがすべて存在する', () => {
    const scenes = ['Title', 'Town', 'Party', 'Map', 'Shop', 'Loot', 'Gear', 'Chest', 'Rest', 'RunEnd'];
    for (const s of scenes) expect(has(bgKeyFor(s)), s).toBe(true);
    for (const o of [{}, { row: 4 }, { enemyId: 'golem' }, { boss: true }]) expect(has(bgKeyFor('Battle', o)), JSON.stringify(o)).toBe(true);
    expect(bgKeyFor('Battle', { boss: true })).toBe('bg_battle_boss');
    expect(bgKeyFor('Battle', { row: 1 })).toBe('bg_battle_dungeon');
    expect(bgKeyFor('Battle', { row: 5 })).toBe('bg_battle_crypt');
  });
  it('ゲームで使う小物・演出画像がある', () => {
    for (const k of ['prop_chest_closed', 'prop_chest_open', 'prop_campfire_1', 'prop_campfire_2', 'cutin_elementalist_bust',
      'icon_status_intent_attack', 'icon_status_intent_attack_all', 'icon_status_gold', 'icon_status_potion']) expect(has(k), k).toBe(true);
  });
});
