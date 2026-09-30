import Phaser from 'phaser';

/** src/assets/img/*.webp のURL（キー = ファイル名）。単体HTMLではdata URIに埋め込まれる。 */
const URLS = Object.fromEntries(
  Object.entries(import.meta.glob<string>('../assets/img/*.webp', { eager: true, query: '?url', import: 'default' })).map(
    ([path, url]) => [/([^/\\]+)\.webp$/.exec(path)![1], url],
  ),
) as Record<string, string>;

export const IMAGE_KEYS = Object.keys(URLS);

/** 全画像をロードキューに積む。個別の読み込み失敗は無視（図形描画にフォールバック）。 */
export function queueImages(scene: Phaser.Scene): void {
  // data URI / 相対URLのどちらでも確実に読めるよう、XHRではなく HTMLImageElement で読み込む
  scene.load.imageLoadType = 'HTMLImageElement';
  for (const key of IMAGE_KEYS) scene.load.image(key, URLS[key]);
}

export const hasImg = (scene: Phaser.Scene, key: string | null | undefined): key is string => !!key && scene.textures.exists(key);

/** 画像を追加（存在しなければ null）。 */
export function addImg(scene: Phaser.Scene, x: number, y: number, key: string | null | undefined): Phaser.GameObjects.Image | null {
  return hasImg(scene, key) ? scene.add.image(x, y, key) : null;
}
