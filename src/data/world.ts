import { hm } from '../engine/dsl';
import type { LocId, NpcDef, NpcId } from '../engine/types';

export const DAY_START = hm(8, 0);
export const DAY_END = hm(23, 59);

export interface LocDef { id: LocId; name: string; blurb: string; x: number; y: number }

export const LOCATIONS: LocDef[] = [
  { id: 'home',        name: '自宅アパート', blurb: '築30年のアパート。僕の部屋と、物置になっている隣の部屋。', x: 14, y: 30 },
  { id: 'shopping',    name: '商店街',       blurb: 'シャッターの目立つ小さな商店街。コンビニと花屋がある。', x: 40, y: 38 },
  { id: 'clinic',      name: '診療所',       blurb: '白い壁の小さな診療所。医師の佐伯が一人で切り盛りしている。', x: 40, y: 12 },
  { id: 'station',     name: '駅',           blurb: '無人に近い小さな駅。駅員の黒田が改札に立っている。', x: 72, y: 22 },
  { id: 'park',        name: '公園',         blurb: 'ブランコと砂場だけの公園。いつも同じ少年がいる。', x: 25, y: 60 },
  { id: 'school',      name: '学校',         blurb: '夏休みの静かな校舎。資料室には古い新聞が眠っている。', x: 53, y: 60 },
  { id: 'beach',       name: '海岸',         blurb: '穏やかな海。夕方になると、いつも誰かが立っている。', x: 86, y: 56 },
  { id: 'shrine',      name: '神社',         blurb: '長い石段の上の古い神社。町が一望できる。', x: 10, y: 86 },
  { id: 'underground', name: '地下施設',     blurb: '町の下に広がる、誰も知らないはずの施設。', x: 52, y: 88 },
];

export const loc = (id: LocId) => LOCATIONS.find((l) => l.id === id)!;

/** 地下への入口（駅の倉庫 or 神社の隠し扉）を除く2地点間の移動時間(分) */
export function baseTravel(a: LocId, b: LocId): number {
  if (a === b) return 0;
  const A = loc(a), B = loc(b);
  const d = Math.hypot(A.x - B.x, (A.y - B.y) * 0.9);
  return Math.min(30, Math.max(10, Math.round(d / 3 / 5) * 5));
}

const TOLD_MINA_STATION = 'told:mina|station_3pm';

export const NPCS: NpcDef[] = [
  { id: 'mina', name: 'ミナ', role: '幼馴染', schedule: [
    { from: hm(8), to: hm(8, 40), loc: 'home' },
    { from: hm(14, 30), to: hm(15, 15), loc: 'station',
      cond: { any: [{ since: [TOLD_MINA_STATION, 10] }, { past: ['p:' + TOLD_MINA_STATION] }] } },
    { from: hm(8, 40), to: hm(17, 10), loc: 'shopping' },
    { from: hm(17, 10), to: hm(17, 30), loc: null },
    { from: hm(17, 30), to: hm(19), loc: 'beach' },
    { from: hm(19), to: hm(23), loc: null },
    { from: hm(23), to: hm(24), loc: 'beach' },
  ] },
  { id: 'kuroda', name: '黒田', role: '駅員', schedule: [
    { from: hm(8), to: hm(15), loc: 'station' },
    { from: hm(15), to: hm(15, 30), loc: null },
    { from: hm(15, 30), to: hm(17), loc: 'station' },
  ] },
  { id: 'saeki', name: '佐伯', role: '医師', schedule: [
    { from: hm(9), to: hm(19, 45), loc: 'clinic' },
  ] },
  { id: 'yu', name: 'ユウ', role: '少年', schedule: [
    { from: hm(8), to: hm(19, 30), loc: 'park' },
    { from: hm(22, 30), to: hm(24), loc: 'shrine', cond: { flag: ['p:yu_knows_girl'] } },
  ] },
  { id: 'shiori', name: '少女', role: '謎の少女', schedule: [
    { from: hm(23, 40), to: hm(24), loc: 'underground', cond: { at: 'underground' } },
    { from: hm(23, 40), to: hm(24), loc: 'shrine' },
  ] },
  { id: 'tadokoro', name: '田所', role: 'コンビニ店員', schedule: [
    { from: hm(8), to: hm(24), loc: 'shopping' },
  ] },
  { id: 'shinohara', name: '篠原先生', role: '教師', schedule: [
    { from: hm(9), to: hm(17), loc: 'school' },
    { from: hm(18, 30), to: hm(21, 30), loc: 'shopping' },
  ] },
  { id: 'asagiri', name: '朝霧', role: '神主', schedule: [
    { from: hm(6), to: hm(22, 30), loc: 'shrine' },
  ] },
  { id: 'gen', name: '源さん', role: '漁師', schedule: [
    { from: hm(8), to: hm(16), loc: 'beach' },
    { from: hm(22), to: hm(23, 50), loc: 'beach' },
  ] },
  { id: 'hanako', name: 'ひなこ', role: '花屋', schedule: [
    { from: hm(9), to: hm(19), loc: 'shopping' },
  ] },
  { id: 'kubo', name: '久保さん', role: '大家', schedule: [
    { from: hm(8), to: hm(12), loc: 'home' },
    { from: hm(15), to: hm(19), loc: 'home' },
  ] },
  { id: 'shiina', name: '椎名町長', role: '町長', schedule: [
    { from: hm(8, 30), to: hm(12), loc: 'shopping' },
    { from: hm(12), to: hm(14, 30), loc: 'school' },
    { from: hm(14, 40), to: hm(15, 10), loc: 'station' },
    { from: hm(15, 10), to: hm(19), loc: 'clinic' },
    { from: hm(21, 50), to: hm(23, 30), loc: 'shrine' },
  ] },
];

export const npc = (id: NpcId) => NPCS.find((n) => n.id === id)!;
