export type Decor = 'city' | 'industrial' | 'forest' | 'canyon' | 'neon';
export type TexKind = 'concrete' | 'metal' | 'stone' | 'sand' | 'tile';

export interface Theme {
  id: number;
  name: string;
  skyTop: number;
  skyHorizon: number;
  skyBottom: number;
  fog: number;
  fogDensity: number;
  ambient: number;
  ambientI: number;
  sun: number;
  sunI: number;
  sunDir: [number, number, number];
  tex: TexKind;
  top: number;
  side: number;
  edge: number;
  edgeAlpha: number;
  accent: number;
  bloom: number;
  exposure: number;
  decor: Decor;
}

export const THEMES: Theme[] = [
  {
    id: 0, name: 'ROOFTOPS',
    skyTop: 0x4f86c6, skyHorizon: 0xf2d3b0, skyBottom: 0xb9c8d8, fog: 0xcdd6e0, fogDensity: 0.006,
    ambient: 0xcfe0ff, ambientI: 1.0, sun: 0xfff1d6, sunI: 1.9, sunDir: [-0.5, 1, 0.4],
    tex: 'concrete', top: 0xf0efe8, side: 0xb4b9c4, edge: 0x2a3140, edgeAlpha: 0.55, accent: 0xff7a1a, bloom: 0.12, exposure: 1.0, decor: 'city',
  },
  {
    id: 1, name: 'IRONWORKS',
    skyTop: 0x5a5f6b, skyHorizon: 0xd9a066, skyBottom: 0x8a7a6a, fog: 0xa88f78, fogDensity: 0.011,
    ambient: 0xffd9b0, ambientI: 0.95, sun: 0xffc27a, sunI: 1.7, sunDir: [0.6, 0.8, -0.3],
    tex: 'metal', top: 0xcfc6b8, side: 0x8a6a55, edge: 0x1c1410, edgeAlpha: 0.6, accent: 0xffb000, bloom: 0.15, exposure: 1.0, decor: 'industrial',
  },
  {
    id: 2, name: 'OVERGROWN',
    skyTop: 0x2f7f8f, skyHorizon: 0xcfe8b0, skyBottom: 0x6f9a70, fog: 0x8fb890, fogDensity: 0.012,
    ambient: 0xd8ffd0, ambientI: 0.95, sun: 0xfff6c0, sunI: 1.8, sunDir: [-0.3, 1, -0.5],
    tex: 'stone', top: 0xd6dcc0, side: 0x8e9a80, edge: 0x16240f, edgeAlpha: 0.55, accent: 0xffe14a, bloom: 0.12, exposure: 1.0, decor: 'forest',
  },
  {
    id: 3, name: 'CANYON RUN',
    skyTop: 0x6a3a7a, skyHorizon: 0xff9a50, skyBottom: 0xb05a3a, fog: 0xd8825a, fogDensity: 0.009,
    ambient: 0xffc8a0, ambientI: 0.9, sun: 0xffa860, sunI: 2.0, sunDir: [0.9, 0.45, 0.2],
    tex: 'sand', top: 0xf2d0a8, side: 0xc0724a, edge: 0x3a1608, edgeAlpha: 0.55, accent: 0x7fe0ff, bloom: 0.18, exposure: 1.0, decor: 'canyon',
  },
  {
    id: 4, name: 'NEON ZERO',
    skyTop: 0x04051a, skyHorizon: 0x2a0f4a, skyBottom: 0x060818, fog: 0x070b24, fogDensity: 0.011,
    ambient: 0x8aa4ff, ambientI: 0.85, sun: 0xbfd2ff, sunI: 1.3, sunDir: [-0.4, 1, 0.6],
    tex: 'tile', top: 0x6f93d8, side: 0x2a3560, edge: 0x22e6ff, edgeAlpha: 1, accent: 0xff3df0, bloom: 0.85, exposure: 1.15, decor: 'neon',
  },
];

export function themeFor(id: number): Theme {
  return THEMES[((id % THEMES.length) + THEMES.length) % THEMES.length];
}
