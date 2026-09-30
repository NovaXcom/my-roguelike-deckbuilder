/**
 * itch.io 用アップロードZIPを作る。
 *   npm run package:itch   →  release/party-roguelike-itch-web.zip  (HTML5ゲームとして投稿。index.html がZIPのルート)
 *                              release/party-roguelike-standalone.html (ダブルクリック起動用の単一HTML。任意配布用)
 * itch.io の要件: ZIP直下に index.html / 全アセットは相対パス / 展開後 1000ファイル・1GB 以内
 */
import { zipSync } from 'fflate';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const dist = 'dist';
const out = 'release';
if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/index.html がありません。先に `npm run build` を実行してください。');
  process.exit(1);
}

const files = {};
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files[relative(dist, p).split(sep).join('/')] = new Uint8Array(readFileSync(p));
  }
};
walk(dist);

// itch.io は index.html がZIPのルートにあること・相対パス参照であることが必須
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const abs = [...html.matchAll(/(?:src|href)=["'](\/[^"']*|https?:[^"']*)["']/g)].map((m) => m[1]);
if (abs.length) {
  console.error('絶対パス/外部URLの参照があります（itch.ioでは読み込めません）:', abs.join(', '));
  process.exit(1);
}

mkdirSync(out, { recursive: true });
const zip = zipSync(files, { level: 9 });
const zipPath = join(out, 'party-roguelike-itch-web.zip');
writeFileSync(zipPath, zip);
console.log(`✔ ${zipPath}  (${(zip.length / 1024).toFixed(0)} KB, ${Object.keys(files).length} files)`);
for (const f of Object.keys(files)) console.log(`   ${f}  ${(files[f].length / 1024).toFixed(0)} KB`);

if (existsSync('dist-local/index.html')) {
  const p = join(out, 'party-roguelike-standalone.html');
  copyFileSync('dist-local/index.html', p);
  console.log(`✔ ${p}  (${(statSync(p).size / 1048576).toFixed(2)} MB)`);
}
