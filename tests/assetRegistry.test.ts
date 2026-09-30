import { describe, it, expect } from 'vitest';
import { buildAssetUrlMap } from '../src/core/assetRegistry';
import manifest from '../scripts/assets-manifest.json';

describe('buildAssetUrlMap', () => {
  const assets = [
    { id: 'bg_title', path: 'src/assets/bg/title.png' },
    { id: 'char_knight', path: 'src/assets/characters/knight.png' },
  ];

  it('returns only assets whose files exist', () => {
    const map = buildAssetUrlMap(assets, { '/src/assets/bg/title.png': 'data:image/png;base64,AAA' });
    expect(map).toEqual({ bg_title: 'data:image/png;base64,AAA' });
  });

  it('returns empty map when nothing is bundled (canvas fallback)', () => {
    expect(buildAssetUrlMap(assets, {})).toEqual({});
  });

  it('normalizes Windows separators and leading ./', () => {
    const map = buildAssetUrlMap(
      [{ id: 'x', path: './src\\assets\\bg\\title.png' }],
      { '/src/assets/bg/title.png': 'u' },
    );
    expect(map.x).toBe('u');
  });
});

describe('assets-manifest.json', () => {
  it('has unique ids, valid categories and paths under src/assets/<dir>/', () => {
    const cats = new Set(['bg', 'character', 'enemy', 'cutin']);
    const ids = new Set<string>();
    for (const a of manifest.assets) {
      expect(ids.has(a.id)).toBe(false);
      ids.add(a.id);
      expect(cats.has(a.category)).toBe(true);
      expect(a.path).toMatch(/^src\/assets\/(bg|characters|enemies|cutins)\/[\w-]+\.png$/);
      expect(a.width).toBeGreaterThan(0);
      expect(a.height).toBeGreaterThan(0);
      expect(a.prompt.length).toBeGreaterThan(0);
      expect(typeof a.transparent).toBe('boolean');
    }
  });
});
