/**
 * dist-local/index.html が「完全にスタンドアロン」で動くことを検証する。
 *  - 単体ファイルだけを空のディレクトリへコピーして file:// で開く（他ファイル依存があれば失敗）
 *  - 外部ネットワーク要求が一切無いこと
 *  - タイトル→拠点→出撃→マップ→戦闘まで進み、コンソールエラーが無いこと
 *  - 最初の操作前は AudioContext 未生成(locked)、操作後に running になること
 *  - サイズ 20MB 以内
 * 使い方: node scripts/verify-standalone.cjs [dist-local/index.html]   (要 playwright / Chromium)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

function loadPlaywright() {
  try { return require('playwright'); } catch { /* fallthrough */ }
  return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}

(async () => {
  const src = path.resolve(process.argv[2] || 'dist-local/index.html');
  const size = fs.statSync(src).size;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'standalone-'));
  const html = path.join(dir, 'index.html');
  fs.copyFileSync(src, html);
  const fail = [];
  const html_ = fs.readFileSync(html, 'utf8');
  const external = [...html_.matchAll(/<(?:script|link|img|source|iframe)[^>]+(?:src|href)=["']([^"']+)["']/g)].map((m) => m[1]).filter((u) => !u.startsWith('data:'));
  if (external.length) fail.push(`外部参照タグあり: ${external.join(', ')}`);
  if (size > 20 * 1024 * 1024) fail.push(`サイズ超過: ${size}`);

  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({
    executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
    args: ['--no-sandbox', '--use-gl=swiftshader'],
  });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const requests = [];
  const errors = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + html + '?debug');
  await page.waitForTimeout(1200);
  const scene = () => page.evaluate(() => window.__partyrogue.phaser.scene.getScenes(true).map((s) => s.scene.key).join(','));
  const audioBefore = await page.evaluate(() => window.__partyrogue.audio.status());
  const steps = [['Title', null]];
  await page.mouse.click(640, 500); await page.waitForTimeout(700); steps.push(['Town', await scene()]);
  const audioAfter = await page.evaluate(() => window.__partyrogue.audio.status());
  await page.mouse.click(750, 668); await page.waitForTimeout(700); steps.push(['Party', await scene()]);
  await page.mouse.click(640, 686); await page.waitForTimeout(800); steps.push(['Map', await scene()]);
  const n = await page.evaluate(() => window.__partyrogue.game.run.map.nodes.find((x) => x.row === 0));
  await page.mouse.click(330 + (n.col / 2) * 620, 640); await page.waitForTimeout(1500); steps.push(['Battle', await scene()]);
  for (const [want, got] of steps.slice(1)) if (got !== want) fail.push(`画面遷移が想定と違う: 期待 ${want} / 実際 ${got}`);
  const nonSelf = requests.filter((u) => u !== 'file://' + html + '?debug' && !u.startsWith('data:') && !u.startsWith('blob:'));
  if (nonSelf.length) fail.push(`追加のリクエスト: ${nonSelf.join(', ')}`);
  if (audioBefore !== 'locked') fail.push(`操作前の音声状態が locked ではない: ${audioBefore}`);
  if (audioAfter !== 'running') fail.push(`操作後の音声状態が running ではない: ${audioAfter}`);
  if (errors.length) fail.push(...errors);
  console.log(JSON.stringify({ file: src, bytes: size, mb: +(size / 1048576).toFixed(2), requests: requests.length, audio: { before: audioBefore, after: audioAfter }, flow: steps.map((s) => s[1] ?? 'Title') }, null, 2));
  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });
  if (fail.length) { console.error('FAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
  console.log('OK: standalone verification passed');
})();
