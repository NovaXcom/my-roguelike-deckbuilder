// Canvas 2D 描画（アセット不要の手続き型ドット絵）。320x180 を CSS で拡大表示する。
import { AHEAD_RATIO } from '../engine/stealth';
import type { LocId } from '../engine/types';

export const W = 320;
export const H = 180;
const GROUND = 118;

export interface SceneInfo {
  loc: LocId;
  time: number;
  blackout: boolean;
  light: boolean;
  crack: boolean;
  actors: ActorView[];
  hero: ActorView | null;
  spots: { x: number; kind: string }[];
  exits: { L: number; R: number };
  stealth: StealthView | null;
  speaking: string | null;
  tick: number;
  loop: number;
  flash?: number;       // 0..1 白フラッシュ
  glitch?: number;      // 0..1
}

export interface StealthView {
  x: number; dir: number; vision: number; alert: number; warn: boolean; glancing: boolean; hidden: boolean;
  spots: { x: number; w: number }[]; goal: { x: number; r: number; p: number } | null;
}
export interface ActorView { id: string; x: number; y: number; dir: number; moving: boolean }

type RGB = [number, number, number];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

const SKY: [number, RGB, RGB][] = [
  [480, [120, 190, 240], [205, 232, 250]],
  [720, [70, 150, 230], [170, 215, 245]],
  [960, [90, 160, 225], [190, 220, 240]],
  [1050, [240, 150, 100], [255, 208, 140]],
  [1110, [150, 90, 130], [240, 130, 110]],
  [1170, [50, 45, 95], [120, 80, 120]],
  [1260, [15, 20, 50], [35, 40, 80]],
  [1439, [8, 10, 28], [20, 22, 50]],
];

export function skyAt(t: number): [RGB, RGB] {
  for (let i = 1; i < SKY.length; i++) {
    if (t <= SKY[i][0]) {
      const k = (t - SKY[i - 1][0]) / (SKY[i][0] - SKY[i - 1][0]);
      return [mix(SKY[i - 1][1], SKY[i][1], k), mix(SKY[i - 1][2], SKY[i][2], k)];
    }
  }
  const l = SKY[SKY.length - 1];
  return [l[1], l[2]];
}
const nightness = (t: number) => Math.max(0, Math.min(1, (t - 1080) / 150));

type Ctx = CanvasRenderingContext2D;
const rect = (c: Ctx, col: string, x: number, y: number, w: number, h: number) => { c.fillStyle = col; c.fillRect(x | 0, y | 0, w | 0, h | 0); };

// ───── キャラクター ─────
interface Look { hair: string; skin?: string; top: string; bottom: string; style: 'short' | 'pony' | 'long' | 'bald' | 'bun' | 'cap' | 'hat'; scale?: number; glasses?: boolean; aura?: boolean; apron?: string; long?: boolean }
const LOOKS: Record<string, Look> = {
  sou:      { hair: '#23232e', top: '#2a8a9a', bottom: '#4a4f63', style: 'short' },
  mina:     { hair: '#6b3d2a', top: '#f4f1ea', bottom: '#3a6ea5', style: 'pony' },
  kuroda:   { hair: '#1d2740', top: '#1f2a44', bottom: '#1a2236', style: 'cap' },
  saeki:    { hair: '#9a9aa2', top: '#f7f7f7', bottom: '#59606e', style: 'short', glasses: true, long: true },
  yu:       { hair: '#2b2b33', top: '#e8c34a', bottom: '#5b7fb5', style: 'short', scale: 0.72 },
  shiori:   { hair: '#15151f', top: '#f3f3ff', bottom: '#f3f3ff', style: 'long', aura: true, long: true },
  tadokoro: { hair: '#c8a02a', top: '#e8e8e8', bottom: '#3d3d4a', style: 'short', apron: '#2e9e5b' },
  shinohara:{ hair: '#2a2a30', top: '#7ca0cf', bottom: '#4a4f63', style: 'short', glasses: true },
  asagiri:  { hair: '#d8d8d8', top: '#dfe9f2', bottom: '#8fa6c0', style: 'hat', long: true },
  gen:      { hair: '#d8d8d8', skin: '#c68e5e', top: '#2c3e63', bottom: '#2c3e63', style: 'bald' },
  hanako:   { hair: '#7a4a35', top: '#f3f3f3', bottom: '#8a6a55', style: 'bun', apron: '#e88fa8' },
  kubo:     { hair: '#cfcfd6', top: '#8a6cb0', bottom: '#5a4a6a', style: 'bun', long: true },
  shiina:   { hair: '#2c2418', top: '#5a3d36', bottom: '#4a3030', style: 'long', long: false },
};
export const speakerLook = (name: string): string | null => {
  const m: Record<string, string> = { 'ソウ': 'sou', 'ミナ': 'mina', '黒田': 'kuroda', '佐伯': 'saeki', 'ユウ': 'yu', '少女': 'shiori', '栞': 'shiori',
    '田所': 'tadokoro', '篠原先生': 'shinohara', '朝霧': 'asagiri', '源さん': 'gen', 'ひなこ': 'hanako', '久保さん': 'kubo', '椎名': 'shiina' };
  return m[name] ?? null;
};

function drawChar(c: Ctx, id: string, x: number, y: number, tick: number, active: boolean, flip = false, moving = false) {
  const L = LOOKS[id]; if (!L) return;
  const sc = L.scale ?? 1;
  const step = moving ? (tick >> 3) & 1 : 0;
  const bob = moving ? step : active ? Math.round(Math.sin(tick / 4)) : 0;
  const skin = L.skin ?? '#f0cfae';
  c.save();
  c.translate(x | 0, (y + bob) | 0);
  c.scale(flip ? -sc : sc, sc);
  c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(-7, -1, 14, 3);
  if (L.aura) { const g = c.createRadialGradient(0, -16, 2, 0, -16, 24); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(-26, -42, 52, 52); }
  // 脚
  const la = moving ? (step ? -2 : 0) : 0, lb = moving ? (step ? 0 : -2) : 0;
  rect(c, L.bottom, -4, -10 + la, 3, 10 - la); rect(c, L.bottom, 1, -10 + lb, 3, 10 - lb);
  rect(c, '#2a2020', -4, -2 + la, 3, 2); rect(c, '#2a2020', 1, -2 + lb, 3, 2);
  // 体
  const bodyH = L.long ? 14 : 10;
  rect(c, L.top, -5, -10 - bodyH, 10, bodyH);
  if (L.long) rect(c, L.top, -5, -12, 10, 3);
  if (L.apron) rect(c, L.apron, -4, -16, 8, 8);
  rect(c, L.top, -7, -9 - bodyH + 1, 2, 9); rect(c, L.top, 5, -9 - bodyH + 1, 2, 9);
  rect(c, skin, -7, -9 - bodyH + 9, 2, 2); rect(c, skin, 5, -9 - bodyH + 9, 2, 2);
  // 頭
  const hy = -10 - bodyH - 9;
  rect(c, skin, -4, hy, 8, 9);
  rect(c, '#2a2020', -2, hy + 4, 1, 2); rect(c, '#2a2020', 1, hy + 4, 1, 2);
  if (L.glasses) { c.strokeStyle = '#333'; c.lineWidth = 0.7; c.strokeRect(-3, hy + 3, 3, 3); c.strokeRect(0, hy + 3, 3, 3); }
  // 髪
  switch (L.style) {
    case 'short': rect(c, L.hair, -5, hy - 1, 10, 4); rect(c, L.hair, -5, hy, 1, 5); rect(c, L.hair, 4, hy, 1, 5); break;
    case 'pony': rect(c, L.hair, -5, hy - 1, 10, 4); rect(c, L.hair, 4, hy, 3, 10); rect(c, '#d84a5a', 4, hy + 1, 3, 2); break;
    case 'long': rect(c, L.hair, -5, hy - 1, 10, 4); rect(c, L.hair, -5, hy, 2, 14); rect(c, L.hair, 3, hy, 2, 14); break;
    case 'bun': rect(c, L.hair, -5, hy - 1, 10, 4); rect(c, L.hair, -2, hy - 4, 5, 4); break;
    case 'cap': rect(c, L.hair, -5, hy - 2, 10, 4); rect(c, L.hair, -6, hy + 1, 12, 2); break;
    case 'hat': rect(c, '#151520', -4, hy - 5, 8, 6); rect(c, L.hair, -5, hy + 1, 1, 6); rect(c, L.hair, 4, hy + 1, 1, 6); break;
    case 'bald': rect(c, '#e8e8ea', -5, hy, 10, 2); break;
  }
  c.restore();
}

// ───── 背景 ─────
type Lights = [number, number, number, number][];

function windowsRow(c: Ctx, lights: Lights, x: number, y: number, n: number, w: number, h: number, gap: number, col = '#9ec7e8') {
  for (let i = 0; i < n; i++) { rect(c, col, x + i * (w + gap), y, w, h); lights.push([x + i * (w + gap), y, w, h]); }
}

function drawBg(c: Ctx, st: SceneInfo, lights: Lights) {
  const t = st.time, tick = st.tick;
  switch (st.loc) {
    case 'home': {
      rect(c, '#d9c7a8', 0, 0, W, 112); rect(c, '#b79f7a', 0, 96, W, 16);
      rect(c, '#8a6544', 0, 112, W, 68); for (let i = 0; i < 9; i++) rect(c, '#7a563a', 0, 118 + i * 7, W, 1);
      const [top, bot] = skyAt(t);
      const g = c.createLinearGradient(0, 18, 0, 78); g.addColorStop(0, css(top)); g.addColorStop(1, css(bot)); c.fillStyle = g; c.fillRect(196, 18, 80, 60);
      rect(c, '#f4ead6', 193, 15, 86, 3); rect(c, '#f4ead6', 193, 78, 86, 3); rect(c, '#f4ead6', 193, 15, 3, 66); rect(c, '#f4ead6', 275, 15, 3, 66); rect(c, '#f4ead6', 234, 18, 2, 60);
      rect(c, '#c97b7b', 180, 12, 12, 72); rect(c, '#c97b7b', 280, 12, 12, 72);
      // TV
      rect(c, '#5a4636', 28, 84, 70, 20); rect(c, '#222', 32, 40, 62, 44);
      const flick = (tick >> 3) % 2; rect(c, t < 500 ? (flick ? '#7fb2e6' : '#6aa0d8') : '#1a1a22', 35, 43, 56, 38);
      if (t < 500) { rect(c, '#d33', 38, 70, 50, 8); rect(c, '#fff', 40, 73, 30 + (tick % 20), 2); }
      // ベッド
      rect(c, '#6d83b0', 112, 92, 62, 18); rect(c, '#f2f2f2', 112, 86, 16, 8); rect(c, '#4c5a80', 112, 108, 62, 4);
      // 隣室の扉
      rect(c, '#7a5a3a', 288, 40, 28, 74); rect(c, '#5a3f26', 290, 42, 24, 70); rect(c, '#d9b34a', 292, 80, 3, 3);
      rect(c, '#e8e0cc', 296, 52, 12, 8); rect(c, '#c9bfa5', 297, 56, 10, 1);
      return;
    }
    case 'shopping': {
      rect(c, '#9a9aa6', 0, GROUND - 6, W, 70);
      const cols = ['#c9a27a', '#8fb0c9', '#d9c08a', '#a8b890', '#c99a9a'];
      for (let i = 0; i < 5; i++) { const x = i * 66 - 8; rect(c, cols[i], x, 28, 64, 86); rect(c, '#555a66', x, 22, 64, 8); }
      // コンビニ
      rect(c, '#f2f2f2', 58, 40, 70, 74); rect(c, '#2e9e5b', 58, 40, 70, 10); rect(c, '#e8872e', 58, 50, 70, 4); rect(c, '#bfe0f0', 66, 66, 54, 40); lights.push([66, 66, 54, 40]);
      c.fillStyle = '#fff'; c.font = 'bold 8px sans-serif'; c.fillText('コンビニ', 72, 48);
      // 花屋
      rect(c, '#e88fa8', 190, 56, 62, 10); rect(c, '#f7f0e8', 190, 66, 62, 48); rect(c, '#bfe0f0', 198, 74, 46, 30); lights.push([198, 74, 46, 30]);
      c.fillStyle = '#7a2a40'; c.font = 'bold 8px sans-serif'; c.fillText('花', 215, 64);
      for (let i = 0; i < 5; i++) { rect(c, ['#fff', '#f9d', '#fd6', '#fff', '#f9d'][i], 192 + i * 11, 108, 5, 5); rect(c, '#3a8a4a', 194 + i * 11, 113, 1, 4); }
      // 電柱
      rect(c, '#4a3f35', 160, 10, 3, 108); rect(c, '#4a3f35', 148, 18, 28, 2);
      for (let i = 0; i < 10; i++) rect(c, '#8a8a96', i * 34, GROUND + 22, 20, 2);
      return;
    }
    case 'clinic': {
      rect(c, '#9fb09a', 0, GROUND, W, 62);
      rect(c, '#f1f3f1', 70, 26, 180, 90); rect(c, '#d8dcd8', 70, 22, 180, 6);
      rect(c, '#d33a3a', 154, 34, 12, 4); rect(c, '#d33a3a', 158, 30, 4, 12);
      windowsRow(c, lights, 84, 56, 3, 24, 22, 8); windowsRow(c, lights, 178, 56, 3, 24, 22, 8);
      rect(c, '#7a8a9a', 148, 76, 24, 40); rect(c, '#bfe0f0', 151, 79, 18, 34);
      for (let i = 0; i < 6; i++) rect(c, '#4a8a4a', 20 + i * 52, 104, 20, 14);
      return;
    }
    case 'station': {
      rect(c, '#b8b2a6', 0, GROUND - 4, W, 66); rect(c, '#a39d90', 0, GROUND + 18, W, 2);
      rect(c, '#e8dfc8', 24, 36, 120, 78); rect(c, '#9a4a3a', 18, 28, 132, 10);
      rect(c, '#3a3f4a', 70, 70, 28, 44); rect(c, '#bfe0f0', 74, 74, 20, 36); lights.push([74, 74, 20, 36]);
      // 時計
      c.fillStyle = '#fff'; c.beginPath(); c.arc(84, 52, 10, 0, 7); c.fill(); c.strokeStyle = '#333'; c.lineWidth = 1; c.stroke();
      const hh = (t / 60) % 12, mm = t % 60;
      c.beginPath(); c.moveTo(84, 52); c.lineTo(84 + Math.sin(hh / 12 * 6.283) * 5, 52 - Math.cos(hh / 12 * 6.283) * 5); c.moveTo(84, 52); c.lineTo(84 + Math.sin(mm / 60 * 6.283) * 8, 52 - Math.cos(mm / 60 * 6.283) * 8); c.stroke();
      // 閉鎖シャッター
      if (t >= 900) { rect(c, '#7a7f88', 150, 60, 40, 54); for (let i = 0; i < 9; i++) rect(c, '#6a6f78', 150, 62 + i * 6, 40, 1); }
      // 線路（途中で途切れる）
      rect(c, '#6a5a4a', 140, GROUND + 50, 150, 3); rect(c, '#6a5a4a', 140, GROUND + 58, 150, 3);
      for (let i = 0; i < 12; i++) rect(c, '#4a3a2a', 146 + i * 12, GROUND + 48, 4, 14);
      rect(c, '#8a7f70', 236, 84, 58, 34); rect(c, '#6a6055', 232, 80, 66, 6); rect(c, '#2a2520', 256, 92, 16, 26);
      rect(c, '#555', 288, GROUND + 44, 6, 20); rect(c, '#d33', 288, GROUND + 44, 6, 4);
      rect(c, '#4a8a4a', 296, GROUND + 48, 24, 16);
      return;
    }
    case 'park': {
      rect(c, '#7fb86a', 0, GROUND - 8, W, 70); rect(c, '#d9c28a', 190, GROUND + 14, 90, 30);
      for (const x of [20, 110, 250, 300]) { rect(c, '#6a4a30', x, 54, 8, 62); rect(c, '#3f8a4a', x - 18, 22, 44, 44); rect(c, '#4a9a55', x - 12, 14, 32, 22); }
      // ブランコ
      rect(c, '#8a8a96', 140, 50, 4, 70); rect(c, '#8a8a96', 190, 50, 4, 70); rect(c, '#8a8a96', 140, 50, 54, 3);
      const sw = Math.sin(tick / 30) * 5; rect(c, '#d97a3a', 156 + sw, 96, 22, 3); rect(c, '#555', 160 + sw / 2, 53, 1, 43); rect(c, '#555', 175 + sw / 2, 53, 1, 43);
      // ベンチ
      rect(c, '#8a5a3a', 40, 108, 44, 5); rect(c, '#8a5a3a', 40, 100, 44, 3); rect(c, '#4a3a2a', 44, 113, 3, 8); rect(c, '#4a3a2a', 77, 113, 3, 8);
      rect(c, '#f3e9d0', 56, 104, 14, 4);
      return;
    }
    case 'school': {
      rect(c, '#c9b27a', 0, GROUND - 2, W, 64);
      rect(c, '#d9d2c0', 30, 30, 240, 86); rect(c, '#9aa3ad', 24, 24, 252, 8);
      for (let r = 0; r < 2; r++) windowsRow(c, lights, 44, 42 + r * 34, 9, 18, 20, 7);
      rect(c, '#8a7f66', 134, 86, 32, 30); rect(c, '#bfe0f0', 138, 90, 24, 26);
      rect(c, '#6a6a76', 290, 20, 2, 96); rect(c, '#d33', 292, 22, 14, 8);
      rect(c, '#a0412e', 20, GROUND + 28, 220, 14);
      return;
    }
    case 'beach': {
      const [, bot] = skyAt(t);
      rect(c, css(mix(bot, [60, 120, 190], 0.55)), 0, 78, W, 40);
      for (let i = 0; i < 14; i++) { const y = 80 + i * 3; rect(c, 'rgba(255,255,255,.18)', ((i * 47 + tick / 2) % (W + 40)) - 20, y, 22, 1); }
      rect(c, css(mix(bot, [40, 100, 170], 0.5)), 0, 118, W, 18);
      for (let i = 0; i < 12; i++) rect(c, 'rgba(255,255,255,.35)', ((i * 31 + tick / 1.6) % (W + 30)) - 15, 120 + (i % 3) * 5 + Math.sin((tick + i * 9) / 12) * 1.5, 18, 1);
      rect(c, '#e8d9a8', 0, 136, W, 44); rect(c, 'rgba(255,255,255,.5)', 0, 134, W, 2);
      // 桟橋・石碑
      rect(c, '#6a5038', 220, 108, 100, 5); for (let i = 0; i < 6; i++) rect(c, '#4a3828', 226 + i * 18, 113, 3, 12);
      rect(c, '#8a8a90', 28, 118, 12, 22); rect(c, '#6a6a70', 28, 118, 12, 3);
      rect(c, '#d9a35a', 150, 128, 34, 3); rect(c, '#8a5a3a', 150, 131, 34, 2);
      return;
    }
    case 'shrine': {
      rect(c, '#2f5a3a', 0, 60, W, 60);
      for (const x of [6, 40, 270, 300]) { rect(c, '#3a2a20', x + 8, 28, 8, 90); rect(c, '#1f4a2a', x - 10, 6, 44, 44); }
      rect(c, '#6a6a72', 90, 86, 140, 94);
      for (let i = 0; i < 9; i++) rect(c, i % 2 ? '#8a8a92' : '#7a7a82', 98 - i * 3 + i * 1, 90 + i * 10, 124 + (i * 5), 6);
      rect(c, '#c8412e', 124, 36, 6, 56); rect(c, '#c8412e', 190, 36, 6, 56); rect(c, '#c8412e', 116, 34, 88, 7); rect(c, '#2a2a30', 112, 29, 96, 6); rect(c, '#c8412e', 122, 48, 76, 4);
      for (const x of [86, 228]) { rect(c, '#8a8a92', x, 72, 6, 22); rect(c, '#f2c46a', x - 1, 66, 8, 7); lights.push([x - 1, 66, 8, 7]); }
      return;
    }
    case 'underground': {
      rect(c, '#14161f', 0, 0, W, H); rect(c, '#1d2030', 0, 112, W, 68);
      for (let i = 0; i < 9; i++) rect(c, '#262a3c', i * 40, 112, 1, 68);
      rect(c, '#2a2f44', 0, 20, W, 10); rect(c, '#3a4060', 0, 40, W, 4);
      for (let i = 0; i < 7; i++) {
        const x = 20 + i * 44; rect(c, '#2a3a50', x, 54, 22, 60); rect(c, '#3f78a0', x + 3, 58, 16, 52);
        lights.push([x + 3, 58, 16, 52]);
        rect(c, 'rgba(140,220,255,.5)', x + 6 + Math.sin((tick + i * 17) / 14) * 2, 64, 3, 38);
      }
      if ((tick >> 5) % 9 === 0) rect(c, 'rgba(120,255,200,.08)', 0, (tick * 3) % H, W, 2);
      return;
    }
  }
}

function drawStars(c: Ctx, t: number, tick: number, locHasSky: boolean) {
  if (!locHasSky || t < 1100) return;
  const a = Math.min(1, (t - 1100) / 120);
  for (let i = 0; i < 46; i++) {
    const x = (i * 97) % W, y = (i * 53) % 60 + 2;
    c.fillStyle = `rgba(255,255,240,${a * (0.5 + 0.5 * Math.sin((tick + i * 13) / 18))})`;
    c.fillRect(x, y, 1, 1);
  }
  // 月
  c.fillStyle = `rgba(250,250,225,${a})`; c.beginPath(); c.arc(270, 28, 9, 0, 7); c.fill();
  c.fillStyle = css(skyAt(t)[0], a * 0.95); c.beginPath(); c.arc(274, 25, 8, 0, 7); c.fill();
}

const OUTDOOR: LocId[] = ['shopping', 'clinic', 'station', 'park', 'school', 'beach', 'shrine'];

export function drawScene(c: Ctx, st: SceneInfo) {
  c.imageSmoothingEnabled = false;
  const outdoor = OUTDOOR.includes(st.loc);
  const [top, bot] = skyAt(st.time);
  if (outdoor) {
    const g = c.createLinearGradient(0, 0, 0, GROUND); g.addColorStop(0, css(top)); g.addColorStop(1, css(bot));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // 雲
    for (let i = 0; i < 4; i++) { const x = ((i * 90 + st.tick / 8) % (W + 80)) - 40; rect(c, `rgba(255,255,255,${st.time < 1100 ? 0.55 : 0.12})`, x, 14 + i * 9, 38, 6); rect(c, `rgba(255,255,255,${st.time < 1100 ? 0.45 : 0.1})`, x + 8, 10 + i * 9, 20, 5); }
    // 太陽
    if (st.time < 1100) { const sx = 40 + ((st.time - 480) / 620) * 240; c.fillStyle = 'rgba(255,240,170,.9)'; c.beginPath(); c.arc(sx, 40 - Math.sin(((st.time - 480) / 620) * 3.14) * 20, 8, 0, 7); c.fill(); }
    drawStars(c, st.time, st.tick, true);
  }
  const lights: Lights = [];
  drawBg(c, st, lights);

  // 夜の暗さ
  const night = nightness(st.time) * (outdoor ? 1 : 0.5);
  const dark = Math.min(0.85, night * 0.55 + (st.blackout ? 0.3 : 0));
  // 物陰・聞き耳の位置（追跡・隠れる中）
  if (st.stealth) {
    for (const sp of st.stealth.spots) {
      c.fillStyle = 'rgba(8,12,34,.5)'; c.fillRect(sp.x - sp.w / 2, 138, sp.w, 22);
      c.fillStyle = 'rgba(8,12,34,.35)'; c.fillRect(sp.x - sp.w / 2 + 2, 134, sp.w - 4, 5);
      const on = st.stealth.hidden && Math.abs((st.hero?.x ?? -99) - sp.x) <= sp.w / 2;
      c.fillStyle = on ? 'rgba(120,255,170,.95)' : 'rgba(255,255,255,.6)'; c.font = '7px sans-serif'; c.fillText('物陰', sp.x - 7, 150);
      c.strokeStyle = on ? 'rgba(120,255,170,.95)' : 'rgba(255,255,255,.35)'; c.setLineDash([2, 2]); c.strokeRect(sp.x - sp.w / 2 + .5, 134.5, sp.w - 1, 25); c.setLineDash([]);
    }
    const g = st.stealth.goal;
    if (g) {
      c.fillStyle = 'rgba(255,225,120,.18)'; c.fillRect(g.x - g.r, 158, g.r * 2, 6);
      c.fillStyle = 'rgba(255,225,120,.95)'; c.fillRect(g.x - g.r, 164, g.r * 2 * g.p, 2);
      c.fillStyle = 'rgba(255,225,120,.7)'; c.fillRect(g.x - 1, 150, 2, 8);
    }
  }
  // キャラクター（奥にいる順に描く）
  const people: ActorView[] = [...st.actors];
  if (st.hero) people.push(st.hero);
  people.sort((p, q) => p.y - q.y);
  for (const a of people) {
    c.globalAlpha = a.id === 'sou' && st.stealth?.hidden ? 0.45 : 1;
    drawChar(c, a.id, a.x, a.y, st.tick, speakerLook(st.speaking ?? '') === a.id, a.dir < 0, a.moving);
    c.globalAlpha = 1;
  }
  // 視界の扇形・警戒マーク
  if (st.stealth) {
    const z = st.stealth, t = st.actors.find((a) => a.id !== 'sou' && Math.abs(a.x - z.x) < 1) ?? { y: 148 };
    const hy = t.y - 18, col = `255,${Math.round(225 - z.alert * 190)},${Math.round(90 - z.alert * 60)}`;
    const cone = (dir: number, len: number) => {
      const gr = c.createLinearGradient(z.x, 0, z.x + dir * len, 0); gr.addColorStop(0, `rgba(${col},.38)`); gr.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = gr; c.beginPath(); c.moveTo(z.x, hy); c.lineTo(z.x + dir * len, hy - 16); c.lineTo(z.x + dir * len, hy + 34); c.closePath(); c.fill();
    };
    if (z.glancing) { cone(1, z.vision); cone(-1, z.vision); } else cone(z.dir, z.vision * AHEAD_RATIO);
    if (z.warn || z.glancing) { c.fillStyle = z.glancing ? '#ff7a7a' : '#ffe27a'; c.font = 'bold 12px sans-serif'; c.fillText('？', z.x - 6, hy - 14 + Math.sin(st.tick / 3) * 2); }
    if (z.alert > 0.05) { c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(z.x - 9, hy - 10, 18, 3); c.fillStyle = z.alert > 0.6 ? '#ff5a5a' : '#ffd36a'; c.fillRect(z.x - 9, hy - 10, 18 * z.alert, 3); }
  }

  if (dark > 0) { c.fillStyle = `rgba(8,10,40,${dark})`; c.fillRect(0, 0, W, H); }
  // 灯り（夜かつ停電していない時）
  if (night > 0.3 && !st.blackout) for (const [x, y, w, h] of lights) { c.fillStyle = `rgba(255,226,140,${0.55 * night + 0.2})`; c.fillRect(x, y, w, h); }
  // 調査ポイントの印・出口の矢印
  for (const sp of st.spots) {
    const bob = Math.sin(st.tick / 9 + sp.x) * 2;
    const col = sp.kind === 'entrance' ? '120,200,255' : '255,225,120';
    const g = c.createRadialGradient(sp.x, 128 + bob, 1, sp.x, 128 + bob, 11); g.addColorStop(0, `rgba(${col},.8)`); g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g; c.fillRect(sp.x - 12, 116 + bob, 24, 24);
    c.fillStyle = `rgb(${col})`; c.fillRect(sp.x - 1, 123 + bob, 2, 6); c.fillRect(sp.x - 1, 131 + bob, 2, 2);
  }
  for (const side of ['L', 'R'] as const) {
    if (!st.exits[side]) continue;
    const pulse = 0.35 + 0.35 * Math.sin(st.tick / 12);
    const x0 = side === 'L' ? 0 : W - 14, dir = side === 'L' ? -1 : 1;
    c.fillStyle = `rgba(255,255,255,${0.10 + pulse * 0.12})`; c.fillRect(x0, 124, 14, 52);
    c.fillStyle = `rgba(255,255,255,${0.5 + pulse})`;
    for (let i = 0; i < 2; i++) { const cx = side === 'L' ? 9 - i * 3 + (pulse * 3 | 0) * dir : W - 9 + i * 3 + (pulse * 3 | 0) * dir; c.fillRect(cx, 146 - i, 2, 2); c.fillRect(cx - dir, 148 - i, 2, 2); c.fillRect(cx - dir, 144 - i, 2, 2); c.fillRect(cx - 2 * dir, 150 - i, 2, 2); c.fillRect(cx - 2 * dir, 142 - i, 2, 2); }
  }
  // 光の柱・亀裂
  if (st.light && outdoor) {
    const pulse = 0.55 + Math.sin(st.tick / 10) * 0.12;
    const g = c.createLinearGradient(0, 0, 0, 100);
    g.addColorStop(0, `rgba(210,250,255,${pulse})`); g.addColorStop(1, 'rgba(210,250,255,0.05)');
    c.fillStyle = g; c.fillRect(236, 0, 34, 118);
    c.fillStyle = `rgba(230,255,255,${pulse * 0.4})`; c.fillRect(218, 0, 70, 118);
  }
  if (st.crack && outdoor) {
    c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 1.2; c.beginPath();
    const pts: [number, number][] = [[150, 0], [160, 14], [148, 28], [170, 44], [158, 58], [186, 70], [176, 84]];
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.moveTo(160, 14); c.lineTo(200, 22); c.lineTo(214, 40); c.moveTo(170, 44); c.lineTo(132, 60); c.lineTo(110, 56); c.stroke();
    c.strokeStyle = 'rgba(160,220,255,.6)'; c.lineWidth = 3; c.globalAlpha = 0.35; c.stroke(); c.globalAlpha = 1;
  }
  // 周回が進むほど走査線がわずかに乱れる（世界の綻び）
  if (st.glitch && st.glitch > 0) {
    const rows = st.glitch >= 0.6 ? 6 : Math.random() < st.glitch * 0.25 ? 1 : 0;
    for (let i = 0; i < rows; i++) {
      const y = (Math.random() * H) | 0, h = 2 + ((Math.random() * 6) | 0);
      try { c.drawImage(c.canvas, 0, y, W, h, ((Math.random() - 0.5) * 16) | 0, y, W, h); } catch { /* noop */ }
    }
  }
  if (st.flash) { c.fillStyle = `rgba(255,255,255,${st.flash})`; c.fillRect(0, 0, W, H); }
  // ビネット
  const v = c.createRadialGradient(W / 2, H / 2, 70, W / 2, H / 2, 200); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.35)');
  c.fillStyle = v; c.fillRect(0, 0, W, H);
}
