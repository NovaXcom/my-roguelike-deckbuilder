import * as THREE from 'three';
import { TexKind } from './Theme';

function mk(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat = true): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  draw(g, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

function noise(g: CanvasRenderingContext2D, s: number, n: number, light = 0.06): void {
  for (let i = 0; i < n; i++) {
    const v = rnd() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${rnd() * light})`;
    g.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 3, 1 + rnd() * 3);
  }
}

const cache = new Map<string, THREE.CanvasTexture>();
function cached(key: string, f: () => THREE.CanvasTexture): THREE.CanvasTexture {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = f()));
  return t;
}

/** Greyscale-ish surface textures; the theme tints them through vertex colours. */
export function surfaceTexture(kind: TexKind): THREE.CanvasTexture {
  return cached('s' + kind, () =>
    mk(256, (g, s) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, s, s);
      if (kind === 'concrete') {
        noise(g, s, 1400, 0.09);
        g.strokeStyle = 'rgba(60,70,90,.45)';
        g.lineWidth = 3;
        g.strokeRect(1.5, 1.5, s - 3, s - 3);
        g.strokeStyle = 'rgba(60,70,90,.12)';
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
      } else if (kind === 'metal') {
        g.fillStyle = 'rgba(0,0,0,.08)';
        for (let y = 0; y < s; y += 4) g.fillRect(0, y, s, 1);
        noise(g, s, 700, 0.07);
        g.strokeStyle = 'rgba(30,20,10,.6)';
        g.lineWidth = 4;
        g.strokeRect(2, 2, s - 4, s - 4);
        g.fillStyle = 'rgba(30,20,10,.55)';
        for (const [x, y] of [[14, 14], [s - 14, 14], [14, s - 14], [s - 14, s - 14]]) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
        g.strokeStyle = 'rgba(30,20,10,.25)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(s / 2, 8); g.lineTo(s / 2, s - 8); g.stroke();
      } else if (kind === 'stone') {
        const rows = 4;
        for (let r = 0; r < rows; r++) {
          const h = s / rows;
          const cols = r % 2 ? 2 : 2;
          for (let c = 0; c < cols + 1; c++) {
            const off = r % 2 ? s / 4 : 0;
            const x = c * (s / cols) - off;
            const sh = 215 + rnd() * 40;
            g.fillStyle = `rgb(${sh},${sh},${sh - 5})`;
            g.fillRect(x + 3, r * h + 3, s / cols - 6, h - 6);
          }
        }
        g.fillStyle = 'rgba(90,140,60,.22)';
        for (let i = 0; i < 18; i++) { g.beginPath(); g.arc(rnd() * s, rnd() * s, 4 + rnd() * 14, 0, 7); g.fill(); }
        noise(g, s, 900, 0.1);
      } else if (kind === 'sand') {
        for (let y = 0; y < s; y += 3) {
          const v = 225 + Math.sin(y * 0.21) * 14 + rnd() * 10;
          g.fillStyle = `rgb(${v},${v - 6},${v - 18})`;
          g.fillRect(0, y, s, 3);
        }
        noise(g, s, 1200, 0.1);
        g.strokeStyle = 'rgba(80,40,20,.25)'; g.lineWidth = 2; g.strokeRect(1, 1, s - 2, s - 2);
      } else {
        g.fillStyle = '#c8d4ff';
        g.fillRect(0, 0, s, s);
        g.strokeStyle = 'rgba(255,255,255,.95)';
        g.lineWidth = 3;
        g.strokeRect(2, 2, s - 4, s - 4);
        g.strokeStyle = 'rgba(40,60,120,.35)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
      }
    }),
  );
}

export function wallTexture(): THREE.CanvasTexture {
  return cached('wall', () =>
    mk(128, (g, s) => {
      g.fillStyle = '#2a2420';
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#ff8a1c';
      for (let i = -2; i < 6; i++) {
        g.beginPath();
        g.moveTo(i * 32, s); g.lineTo(i * 32 + 16, s); g.lineTo(i * 32 + 16 + s, 0); g.lineTo(i * 32 + s, 0);
        g.fill();
      }
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.fillRect(0, 0, s, 6); g.fillRect(0, s - 6, s, 6);
    }),
  );
}

export function hazardTexture(): THREE.CanvasTexture {
  return cached('haz', () =>
    mk(64, (g, s) => {
      g.fillStyle = '#ff2a2a';
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#ffe3e3';
      for (let i = -2; i < 4; i++) {
        g.beginPath();
        g.moveTo(i * 32, s); g.lineTo(i * 32 + 16, s); g.lineTo(i * 32 + 16 + s, 0); g.lineTo(i * 32 + s, 0);
        g.fill();
      }
    }),
  );
}

export function padTexture(): THREE.CanvasTexture {
  return cached('pad', () =>
    mk(128, (g, s) => {
      g.fillStyle = '#103a2a';
      g.fillRect(0, 0, s, s);
      g.strokeStyle = '#5bff9a';
      g.lineWidth = 12;
      g.lineJoin = 'round';
      for (let k = 0; k < 2; k++) {
        const y = 30 + k * 52;
        g.beginPath(); g.moveTo(24, y + 28); g.lineTo(s / 2, y); g.lineTo(s - 24, y + 28); g.stroke();
      }
    }),
  );
}

export function gateTexture(): THREE.CanvasTexture {
  return cached('gate', () =>
    mk(64, (g, s) => {
      g.clearRect(0, 0, s, s);
      g.fillStyle = 'rgba(255,50,50,.18)';
      g.fillRect(0, 0, s, s);
      g.strokeStyle = 'rgba(255,120,120,.9)';
      g.lineWidth = 3;
      g.strokeRect(1, 1, s - 2, s - 2);
    }),
  );
}
