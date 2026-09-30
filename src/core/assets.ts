import manifest from '../../scripts/assets-manifest.json';
import { buildAssetUrlMap, type ManifestAsset } from './assetRegistry';

// Only files that exist are bundled; an empty folder yields {} (no 404s, no errors).
const globbed = import.meta.glob('/src/assets/**/*.{png,webp,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export const MANIFEST_ASSETS = manifest.assets as ManifestAsset[];
export const AVAILABLE_ASSET_URLS = buildAssetUrlMap(MANIFEST_ASSETS, globbed);
