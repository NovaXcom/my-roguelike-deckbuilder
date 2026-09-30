// Pure logic (no Phaser): decides which manifest assets actually exist on disk.
export type AssetCategory =
  | 'bg' | 'character' | 'enemy' | 'cutin' | 'icon' | 'keyart' | 'facility' | 'prop';

export interface ManifestAsset {
  id: string;
  category: AssetCategory;
  path: string; // e.g. "src/assets/characters/knight.png"
  width: number;
  height: number;
  transparent: boolean;
  anchor?: 'bottom' | 'center';
}

/**
 * Match manifest entries against the files bundled by `import.meta.glob`
 * (keys look like "/src/assets/bg/title.png") and return id -> url
 * for the assets that exist. Missing files are simply absent => canvas fallback.
 */
export function buildAssetUrlMap(
  assets: readonly Pick<ManifestAsset, 'id' | 'path'>[],
  globbed: Record<string, string>,
): Record<string, string> {
  const byPath = new Map<string, string>();
  for (const [key, url] of Object.entries(globbed)) {
    byPath.set(normalize(key), url);
  }
  const result: Record<string, string> = {};
  for (const a of assets) {
    const url = byPath.get(normalize(a.path));
    if (url) result[a.id] = url;
  }
  return result;
}

function normalize(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.?\//, '');
}
