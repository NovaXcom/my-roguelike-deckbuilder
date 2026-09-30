/**
 * itch.io 投稿ZIP(release/party-roguelike-itch-web.zip)を、itch.io の配信形態に近い条件で検証する。
 *  - ZIPを展開し、サブパス(/html/12345/)配下で HTTP 配信（itch.io は CDN のサブパスで配信される）
 *  - 別オリジンのラッパーページの <iframe> に埋め込んで起動（itch.io のゲームページ相当）
 *  - PC(マウス)とスマホ(タッチ・横向き)の両方で タイトル→拠点→出撃→マップ→戦闘 まで操作
 *  - 404・コンソールエラーが無いこと、iframe内で音声が解錠できること、localStorage が使えること
 * 使い方: npm run package:itch && npm run verify:itch   (要 playwright / Chromium, unzip コマンド)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

function loadPlaywright() {
  try { return require('playwright'); } catch { /* fallthrough */ }
  return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const serve = (root, port, prefix, log) => new Promise((res) => {
  const srv = http.createServer((req, rsp) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const rel = url.startsWith(prefix) ? url.slice(prefix.length) || 'index.html' : null;
    const file = rel && path.join(root, rel.endsWith('/') ? rel + 'index.html' : rel);
    log.push(`${req.method} ${url} -> ${file && fs.existsSync(file) ? 200 : 404}`);
    if (!file || !file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { rsp.writeHead(404); rsp.end('not found'); return; }
    rsp.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(rsp);
  }).listen(port, () => res(srv));
});

(async () => {
  const zip = path.resolve(process.argv[2] || 'release/party-roguelike-itch-web.zip');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'itch-'));
  execSync(`unzip -q "${zip}" -d "${dir}"`);
  const fail = [];
  if (!fs.existsSync(path.join(dir, 'index.html'))) fail.push('ZIPのルートに index.html がありません');
  const count = execSync(`find "${dir}" -type f | wc -l`).toString().trim();
  const bytes = Number(execSync(`du -sb "${dir}" | cut -f1`).toString().trim());

  const gameLog = [];
  const PREFIX = '/html/12345/';
  const game = await serve(dir, 18081, PREFIX, gameLog);
  const wrapperDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrap-'));
  fs.writeFileSync(path.join(wrapperDir, 'index.html'),
    `<!doctype html><html><head><link rel="icon" href="data:,"></head><body style="margin:0;background:#222"><iframe id="g" src="http://localhost:18081${PREFIX}index.html?debug" allow="autoplay; fullscreen" allowfullscreen style="border:0;width:100vw;height:100vh"></iframe></body></html>`);
  const wrapper = await serve(wrapperDir, 18082, '/', []);

  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({
    executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
    args: ['--no-sandbox', '--use-gl=swiftshader'],
  });
  const report = {};
  for (const mode of ['desktop', 'mobile']) {
    const mobile = mode === 'mobile';
    const ctx = await browser.newContext(mobile
      ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36' }
      : { viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto('http://localhost:18082/');
    const frame = await (await page.waitForSelector('#g')).contentFrame();
    await frame.waitForFunction(() => window.__partyrogue, null, { timeout: 15000 });
    await page.waitForTimeout(1200);
    const cdp = mobile ? await ctx.newCDPSession(page) : null;
    const rect = () => frame.evaluate(() => { const c = document.querySelector('canvas').getBoundingClientRect(); return { x: c.left, y: c.top, s: c.width / 1280 }; });
    const tap = async (gx, gy) => {
      const r = await rect(); const x = r.x + gx * r.s, y = r.y + gy * r.s;
      if (mobile) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await page.waitForTimeout(60);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else await page.mouse.click(x, y);
      await page.waitForTimeout(700);
    };
    const scene = () => frame.evaluate(() => window.__partyrogue.phaser.scene.getScenes(true).map((s) => s.scene.key).join(','));
    const audioBefore = await frame.evaluate(() => window.__partyrogue.audio.status());
    const flow = [];
    await tap(640, 500); flow.push(await scene());
    const audioAfter = await frame.evaluate(() => window.__partyrogue.audio.status());
    await tap(750, 668); flow.push(await scene());
    await tap(640, 648); flow.push(await scene());
    const n = await frame.evaluate(() => window.__partyrogue.game.run.map.nodes.find((x) => x.row === 0));
    await tap(330 + (n.col / 2) * 620, 640); await page.waitForTimeout(800); flow.push(await scene());
    const acted = await frame.evaluate(() => window.__partyrogue.phaser.scene.getScene('Battle').state.party.map((m) => m.acted));
    const storage = await frame.evaluate(() => { try { localStorage.setItem('t', '1'); const v = localStorage.getItem('t'); localStorage.removeItem('t'); return v === '1'; } catch { return false; } });
    const fs_ = await frame.evaluate(() => window.__partyrogue.phaser.scale.fullscreen.available);
    await page.screenshot({ path: path.join(os.tmpdir(), `itch-${mode}.png`) });
    if (flow.join('>') !== 'Town>Party>Map>Battle') fail.push(`${mode}: 画面遷移が想定と違う ${flow.join('>')}`);
    if (audioBefore !== 'locked' || audioAfter !== 'running') fail.push(`${mode}: 音声解錠NG before=${audioBefore} after=${audioAfter}`);
    if (acted.some(Boolean)) fail.push(`${mode}: 画面遷移直後の指離しでスキルが誤発動した`);
    if (!storage) fail.push(`${mode}: iframe内で localStorage が使えない`);
    if (errors.length) fail.push(...errors.map((e) => `${mode}: ${e}`));
    report[mode] = { flow, audio: `${audioBefore} -> ${audioAfter}`, localStorage: storage, fullscreenAvailable: fs_, errors: errors.length };
    await ctx.close();
  }
  const notFound = gameLog.filter((l) => l.endsWith('404'));
  if (notFound.length) fail.push('404あり: ' + notFound.join(', '));
  console.log(JSON.stringify({ zip, files: Number(count), unpackedKB: Math.round(bytes / 1024), served: [...new Set(gameLog.map((l) => l.split(' -> ')[0]))], report }, null, 2));
  await browser.close();
  game.close(); wrapper.close();
  fs.rmSync(dir, { recursive: true, force: true });
  if (fail.length) { console.error('FAIL:\n - ' + fail.join('\n - ')); process.exit(1); }
  console.log('OK: itch.io package verification passed');
})();
