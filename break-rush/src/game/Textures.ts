import * as THREE from 'three';

let seed = 11;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat = true, srgb = true): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, a = 0.1): void {
  for (let i = 0; i < n; i++) {
    const v = rnd() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${rnd() * a})`;
    const s = 1 + rnd() * 2.5;
    g.fillRect(rnd() * w, rnd() * h, s, s);
  }
}

const cache = new Map<string, THREE.CanvasTexture>();
function memo(key: string, f: () => THREE.CanvasTexture): THREE.CanvasTexture {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = f()));
  return t;
}

/** Wet-looking asphalt. */
export function asphalt(): THREE.CanvasTexture {
  return memo('asphalt', () =>
    canvas(512, 512, (g, w, h) => {
      g.fillStyle = '#3a3c42';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) {
        g.fillStyle = `rgba(${rnd() < 0.5 ? 20 : 90},${rnd() < 0.5 ? 20 : 90},${rnd() < 0.5 ? 24 : 96},${0.05 + rnd() * 0.08})`;
        g.beginPath();
        g.arc(rnd() * w, rnd() * h, 6 + rnd() * 40, 0, 7);
        g.fill();
      }
      speckle(g, w, h, 9000, 0.18);
      g.strokeStyle = 'rgba(10,10,12,.6)';
      g.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        let x = rnd() * w, y = rnd() * h;
        g.moveTo(x, y);
        for (let k = 0; k < 7; k++) { x += (rnd() - 0.5) * 70; y += (rnd() - 0.5) * 70; g.lineTo(x, y); }
        g.stroke();
      }
    }),
  );
}

export function sidewalk(): THREE.CanvasTexture {
  return memo('sidewalk', () =>
    canvas(256, 256, (g, w, h) => {
      g.fillStyle = '#9a9a9a';
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 3000, 0.12);
      g.strokeStyle = 'rgba(40,40,45,.7)';
      g.lineWidth = 3;
      g.strokeRect(1, 1, w - 2, h - 2);
      g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2);
      g.lineWidth = 1.5; g.stroke();
    }),
  );
}

export function concrete(tint = '#8c8f94'): THREE.CanvasTexture {
  return memo('concrete' + tint, () =>
    canvas(256, 256, (g, w, h) => {
      g.fillStyle = tint;
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 5000, 0.14);
      for (let i = 0; i < 30; i++) {
        g.fillStyle = `rgba(0,0,0,${0.02 + rnd() * 0.05})`;
        g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 6, 20 + rnd() * 80);
      }
      g.strokeStyle = 'rgba(0,0,0,.25)';
      g.lineWidth = 2;
      g.strokeRect(0, 0, w, h);
    }),
  );
}

export function plazaTiles(): THREE.CanvasTexture {
  return memo('plaza', () =>
    canvas(256, 256, (g, w, h) => {
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        const v = 190 + rnd() * 28;
        g.fillStyle = `rgb(${v},${v - 6},${v - 18})`;
        g.fillRect(x * 128, y * 128, 128, 128);
      }
      speckle(g, w, h, 2500, 0.1);
      g.strokeStyle = 'rgba(70,60,50,.7)';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(128, 0); g.lineTo(128, h); g.moveTo(0, 128); g.lineTo(w, 128); g.stroke();
      g.strokeRect(1, 1, w - 2, h - 2);
    }),
  );
}

export interface FacadeTex {
  map: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
}

/** A building wall: one repeat is 8m wide x 8m tall, with windows (some lit). */
export function facade(kind: 'brick' | 'concrete' | 'glass', lit: number, variant: number): FacadeTex {
  const key = `facade${kind}${variant}`;
  const base = ({ brick: [138, 82, 66], concrete: [150, 152, 156], glass: [60, 70, 90] } as const)[kind];
  seed = 100 + variant * 31;
  const map = memo(key, () =>
    canvas(512, 512, (g, w, h) => {
      g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
      g.fillRect(0, 0, w, h);
      if (kind === 'brick') {
        for (let y = 0; y < h; y += 16) {
          for (let x = (y / 16) % 2 ? -16 : 0; x < w; x += 32) {
            const v = rnd() * 28 - 14;
            g.fillStyle = `rgb(${base[0] + v},${base[1] + v * 0.6},${base[2] + v * 0.5})`;
            g.fillRect(x + 1, y + 1, 30, 14);
          }
        }
      } else speckle(g, w, h, 6000, 0.12);
      // 4 x 4 windows per tile
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const x = c * 128 + 30, y = r * 128 + 24;
        g.fillStyle = 'rgba(20,24,34,1)';
        g.fillRect(x - 4, y - 4, 76, 88);
        g.fillStyle = 'rgb(28,36,52)';
        g.fillRect(x, y, 68, 80);
        g.fillStyle = 'rgba(180,200,230,.18)';
        g.fillRect(x, y, 34, 40);
        g.strokeStyle = 'rgb(90,92,98)';
        g.lineWidth = 3;
        g.strokeRect(x - 4, y - 4, 76, 88);
        g.beginPath(); g.moveTo(x + 34, y); g.lineTo(x + 34, y + 80); g.stroke();
      }
    }),
  );
  const emissive = memo(key + 'e' + lit, () => {
    seed = 500 + variant * 17;
    return canvas(512, 512, (g, w, h) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, w, h);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        if (rnd() > lit) continue;
        const x = c * 128 + 30, y = r * 128 + 24;
        const warm = rnd() < 0.8;
        g.fillStyle = warm ? `rgb(${230 + rnd() * 25},${170 + rnd() * 40},${90 + rnd() * 40})` : 'rgb(150,200,255)';
        g.fillRect(x, y, 68, 80);
        g.fillStyle = 'rgba(0,0,0,.45)';
        g.fillRect(x + 32, y, 4, 80);
        if (rnd() < 0.4) g.fillRect(x, y, 68, 20 + rnd() * 30);
      }
    }, true, true);
  });
  return { map, emissive };
}

export function signTexture(text: string, bg: string, fg: string, w = 512, h = 128): THREE.CanvasTexture {
  return memo(`sign${text}${bg}${fg}`, () =>
    canvas(w, h, (g, W, H) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = fg;
      g.lineWidth = 6;
      g.strokeRect(8, 8, W - 16, H - 16);
      g.fillStyle = fg;
      g.font = `bold ${Math.floor(H * 0.55)}px "Hiragino Kaku Gothic ProN", "Yu Gothic", "Segoe UI", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, W / 2, H / 2 + 4);
    }, false),
  );
}

export function laneMarking(): THREE.CanvasTexture {
  return memo('lane', () =>
    canvas(256, 32, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(232,222,170,.9)';
      g.fillRect(16, 9, 120, 14);
      speckle(g, w, h, 200, 0.4);
    }),
  );
}

export function posterTexture(i: number): THREE.CanvasTexture {
  return memo('poster' + i, () =>
    canvas(128, 192, (g, w, h) => {
      const hues = [20, 200, 330, 120];
      g.fillStyle = `hsl(${hues[i % 4]},60%,${40 + (i % 3) * 8}%)`;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.fillRect(10, 14, w - 20, 26);
      g.fillStyle = 'rgba(0,0,0,.45)';
      for (let k = 0; k < 5; k++) g.fillRect(12, 56 + k * 20, w - 24 - rnd() * 40, 8);
      speckle(g, w, h, 600, 0.3);
    }, false),
  );
}
