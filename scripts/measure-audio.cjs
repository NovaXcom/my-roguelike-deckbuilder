/**
 * src/assets/audio の実ファイルを実測し、目標ラウドネス(src/audio/targets.ts)に合わせた
 * 補正ゲインを src/audio/trims.json に書き出す。音声を追加・差し替えたら実行する。
 *   npm run audio:measure          (要 playwright / Chromium。ブラウザのデコーダで測定)
 *   npm run audio:measure -- --check   … 書き込まず、現在の trims.json で目標に収まっているか検証(CIや確認用)
 * 指標: 効果音/ジングル = 最大100ms窓のRMS(dBFS) / BGM = 全体RMS(dBFS)。補正後ピークは 0.9 以下に制限。
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
function loadPlaywright() {
  try { return require('playwright'); } catch { /* fallthrough */ }
  return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}
(async () => {
  const check = process.argv.includes('--check');
  const dir = path.resolve('src/assets/audio');
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'measure-'));
  execSync(`npx rolldown src/audio/targets.ts --format iife --name T --file ${tmp}/targets.js`, { stdio: 'pipe' });
  const trimsPath = path.resolve('src/audio/trims.json');
  const current = JSON.parse(fs.readFileSync(trimsPath, 'utf8'));

  const files = fs.readdirSync(dir).filter((f) => /\.(wav|mp3)$/i.test(f)).sort();
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({
    executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ content: fs.readFileSync(`${tmp}/targets.js`, 'utf8') });
  const data = files.map((f) => ({ key: f.replace(/\.[^.]+$/, ''), b64: fs.readFileSync(path.join(dir, f)).toString('base64') }));
  const rows = await page.evaluate(async ({ data, current, check }) => {
    const out = [];
    for (const { key, b64 } of data) {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const ctx = new OfflineAudioContext(1, 1, 44100);
      const buf = await ctx.decodeAudioData(bin.buffer);
      const n = buf.length, ch = buf.numberOfChannels;
      const mono = new Float32Array(n);
      let peak = 0;
      for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) { mono[i] += d[i] / ch; const a = Math.abs(d[i]); if (a > peak) peak = a; } }
      const id = T.idOfKey(key);
      const isBgm = id && id.startsWith('bgm_');
      let power = 0;
      if (isBgm) { let sum = 0; for (let i = 0; i < n; i++) sum += mono[i] * mono[i]; power = sum / n; }
      else {
        const win = Math.min(n, Math.floor(buf.sampleRate * 0.1)), hop = Math.max(1, Math.floor(win / 4));
        for (let s = 0; s + win <= n; s += hop) { let sum = 0; for (let i = s; i < s + win; i++) sum += mono[i] * mono[i]; power = Math.max(power, sum / win); }
      }
      const db = 10 * Math.log10(power + 1e-12);
      const target = id ? T.FILE_TARGET_DB[id] : null;
      const trim = target == null ? 1 : T.trimFor(db, target, peak);
      const applied = check ? (current[key] ?? 1) : trim;
      out.push({ key, id, sec: +(n / buf.sampleRate).toFixed(2), peak: +peak.toFixed(2), db: +db.toFixed(1), target, trim: +trim.toFixed(3),
        afterDb: +(db + 20 * Math.log10(applied)).toFixed(1), afterPeak: +(peak * applied).toFixed(2) });
    }
    return out;
  }, { data, current, check });
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });

  console.table(rows.map((r) => ({ key: r.key, sec: r.sec, peak: r.peak, 'dB': r.db, target: r.target, trim: r.trim, '→dB': r.afterDb, '→peak': r.afterPeak })));
  const unknown = rows.filter((r) => !r.id).map((r) => r.key);
  if (unknown.length) console.warn('マニフェスト(ids.ts)に無いファイル:', unknown.join(', '));
  if (check) {
    const bad = rows.filter((r) => r.id && (Math.abs(r.afterDb - r.target) > 1.5 && r.afterPeak < 0.88 || r.afterPeak > 0.92));
    if (bad.length) { console.error('目標から外れています。npm run audio:measure を実行してください:', bad.map((r) => r.key).join(', ')); process.exit(1); }
    console.log('OK: 現在の trims.json で全ファイルが目標範囲内');
    return;
  }
  const trims = {};
  for (const r of rows) trims[r.key] = r.trim;
  fs.writeFileSync(trimsPath, JSON.stringify(trims, null, 2) + '\n');
  console.log(`✔ ${trimsPath} を更新 (${rows.length} files)`);
})();
