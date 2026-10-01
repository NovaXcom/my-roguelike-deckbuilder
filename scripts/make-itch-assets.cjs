/**
 * itch.io の出品ページ用画像を、実際のゲーム画面から生成する（itch/ に出力）。
 *   cover-630x500.png  … カバー画像（推奨 630x500）
 *   screenshot-N.png   … スクリーンショット（1280x720）
 * 使い方: npm run build:local && node scripts/make-itch-assets.cjs   (要 playwright / Chromium)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
function loadPlaywright() {
  try { return require('playwright'); } catch { /* fallthrough */ }
  return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}
(async () => {
  const out = path.resolve('itch');
  fs.mkdirSync(out, { recursive: true });
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({
    executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
    args: ['--no-sandbox', '--use-gl=swiftshader'],
  });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await page.addInitScript(() => localStorage.setItem('partyrogue.meta.v1', JSON.stringify({ stones: 120, smith: 3, alchemy: 1, training: 2, runs: 4, clears: 1 })));
  await page.goto('file://' + path.resolve('dist-local/index.html') + '?debug');
  await page.waitForTimeout(1500);
  const shot = (n, clip) => page.screenshot({ path: path.join(out, n), ...(clip ? { clip } : {}) });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const scene = () => ev(() => window.__partyrogue.phaser.scene.getScenes(true).map((s) => s.scene.key).join(','));
  const idle = async () => { for (let i = 0; i < 60; i++) { if (!(await ev(() => window.__partyrogue.phaser.scene.getScene('Battle').busy))) return; await page.waitForTimeout(300); } };

  await page.waitForTimeout(800);
  await shot('screenshot-1-title.png');
  await page.mouse.click(640, 500); await page.waitForTimeout(900);
  await shot('screenshot-2-town.png');
  await page.mouse.click(750, 668); await page.waitForTimeout(900);
  await shot('screenshot-3-party.png');
  await page.mouse.click(640, 686); await page.waitForTimeout(900);
  await shot('screenshot-4-map.png');
  const n = await ev(() => window.__partyrogue.game.run.map.nodes.find((x) => x.row === 0));
  await page.mouse.click(330 + (n.col / 2) * 620, 640); await page.waitForTimeout(1500);
  await shot('screenshot-5-battle.png');
  // ブレイク → チェインのカットイン
  const use = (member, id) => ev(([m, i]) => { const sc = window.__partyrogue.phaser.scene.getScene('Battle'); sc.onSkill(sc.buttons.find((b) => b.member === m && b.skill.id === i)); }, [member, id]);
  await use(0, 'shield_bash'); await idle();
  await use(1, 'firebolt');
  // 「CHAIN!」が完全に表示された瞬間を検知し、その場でゲームループを止めて撮影する（描画速度に依存しない）
  let frozen = false;
  for (let i = 0; i < 400 && !frozen; i++) {
    frozen = await ev(() => {
      const g = window.__partyrogue.phaser;
      const ready = g.scene.getScene('Battle').children.list.some((o) => o.text === 'CHAIN!' && o.alpha >= 0.99 && Math.abs(o.scale - 1) < 0.05);
      if (ready) g.loop.sleep();
      return ready;
    });
    if (!frozen) await page.waitForTimeout(15);
  }
  if (!frozen) console.warn('warning: CHAIN! の表示を検知できませんでした');
  await shot('screenshot-6-chain.png');
  // カバー: チェイン発動の場面を 630x500 で切り出し
  await shot('cover-630x500.png', { x: 470, y: 90, width: 630, height: 500 });
  await ev(() => window.__partyrogue.phaser.loop.wake());
  await browser.close();
  console.log(fs.readdirSync(out).map((f) => `${f} ${(fs.statSync(path.join(out, f)).size / 1024).toFixed(0)}KB`).join('\n'));
})();
