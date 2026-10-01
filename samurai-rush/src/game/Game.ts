import { audio } from '../audio/AudioSystem';
import { HitStop } from '../combat/HitStop';
import { SlowMo } from '../combat/SlowMo';
import { SamuraiView } from '../render/SamuraiView';
import { botCommand } from '../samurai/bot';
import { ENEMIES, P, SLASH } from '../samurai/data';
import { SCROLLS } from '../samurai/perks';
import { ENDLESS, STAGES, StageDef } from '../samurai/stages';
import { Cmd, emptyCmd, World, WorldEvent } from '../samurai/World';
import { Hud } from './Hud';
import { CmdLatch, Input, Intent } from './Input';
import { applyResult, finalScore, formatTime, loadSave, SaveData, storeSave } from './Progress';

type Mode = 'title' | 'play' | 'menu' | 'result' | 'ko';

interface MenuItem {
  label: string;
  sub?: string;
  act: () => void;
  disabled?: boolean;
  html?: string;
}

interface Run {
  stageIdx: number;
  scrolls: string[];
  endless: boolean;
  practice: boolean;
  total: number;
}

const STEP = 1 / 60;
const KANJI_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

export class Game {
  private view: SamuraiView;
  private hud: Hud;
  private input: Input;
  private latch = new CmdLatch();
  private hitStop = new HitStop();
  private slowMo = new SlowMo();
  private ui: HTMLDivElement;
  private world: World;
  private mode: Mode = 'title';
  private save: SaveData = loadSave();
  private run: Run = { stageIdx: 0, scrolls: [], endless: false, practice: false, total: 0 };
  private menu: { items: MenuItem[]; sel: number; cols: boolean } | null = null;
  private menuAge = 0;
  private prevMy = 0;
  private last = 0;
  private acc = 0;
  private time = 0;
  private overAt = -1;
  private bot = new URLSearchParams(location.search).has('bot');
  private hintT = 0;
  private showed100 = false;

  constructor(root: HTMLElement) {
    const view = document.createElement('div');
    view.id = 'view';
    root.appendChild(view);
    this.view = new SamuraiView(view);
    this.hud = new Hud(root);
    this.ui = document.createElement('div');
    this.ui.id = 'ui';
    root.appendChild(this.ui);
    this.input = new Input(this.view.renderer.domElement);
    audio.volume(this.save.volume);
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('blur', () => {
      if (this.mode === 'play') this.openPause();
    });
    this.world = new World(STAGES[0], 1);
    this.world.p.x = 3;
    (window as unknown as { __g: Game }).__g = this;
    const q = new URLSearchParams(location.search);
    const st = Number(q.get('stage'));
    if (st >= 1 && st <= 4) {
      this.run = { stageIdx: st - 1, scrolls: (q.get('scrolls') ?? '').split(',').filter(Boolean), endless: false, practice: true, total: 0 };
      this.startStage();
      const px = Number(q.get('x'));
      if (px) this.world.p.x = px;
    } else if (q.has('endless')) {
      this.run = { stageIdx: 0, scrolls: [], endless: true, practice: false, total: 0 };
      this.startStage();
    } else this.showTitle();
    this.view.setQuality(q.get('q') === 'low' ? 'low' : 'high');
    requestAnimationFrame((t) => {
      this.last = t;
      requestAnimationFrame(this.frame);
    });
  }

  // ------------------------------------------------------------------ flow

  private currentStage(): StageDef {
    return this.run.endless ? ENDLESS : STAGES[this.run.stageIdx];
  }

  private startStage(): void {
    const stage = this.currentStage();
    this.world = new World(stage, (Date.now() & 0xffff) + 1, this.run.scrolls);
    this.view.clearFx();
    this.view.setTheme(stage.theme, stage.length || 40);
    this.view.snapCamera(this.world.p.x + 2);
    this.hud.reset(this.run.endless ? '百人斬り　HYAKUNIN-GIRI' : `第${KANJI_NUM[stage.id]}幕　${stage.jp}`);
    this.hud.setMode(true);
    this.hud.setHint(true);
    this.hintT = this.run.stageIdx === 0 && !this.run.endless ? 40 : 14;
    this.closeUi();
    this.view.camBias = 0;
    this.mode = 'play';
    this.overAt = -1;
    this.acc = 0;
    this.showed100 = false;
    this.hud.showBanner(this.run.endless ? '百人斬り' : stage.jp, this.run.endless ? '斬って斬って斬りまくれ' : stage.blurb);
    audio.play('taiko');
  }

  private showTitle(): void {
    this.mode = 'title';
    this.hud.setMode(false);
    this.view.clearFx();
    this.view.setTheme('bamboo', 240);
    this.world = new World(STAGES[0], 1);
    this.world.p.x = 3;
    this.view.camBias = -5.2;
    this.view.snapCamera(0);
    const bestLine = this.save.endlessBest > 0 ? `百人斬り最高 ${this.save.endlessBest.toLocaleString()}点 / ${this.save.endlessKills}人` : '';
    this.openMenu(
      `<h1 class="logo">SAMURAI<br>RUSH<small>爽 快 剣 戟 活 劇</small></h1>${bestLine ? `<div class="sub">${bestLine}</div>` : '<div class="sub"> </div>'}`,
      [
        { label: '出陣', sub: 'CAMPAIGN  全4幕', act: () => { this.run = { stageIdx: 0, scrolls: [], endless: false, practice: false, total: 0 }; this.startStage(); } },
        { label: '百人斬り', sub: 'ENDLESS  どこまで斬れる？', act: () => { this.run = { stageIdx: 0, scrolls: [], endless: true, practice: false, total: 0 }; this.startStage(); } },
        { label: '稽古', sub: 'STAGE SELECT', act: () => this.showSelect() },
        { label: '遊び方', sub: 'HOW TO PLAY', act: () => this.showHelp() },
        { label: `音量　${Math.round(this.save.volume * 100)}%`, sub: 'VOLUME', act: () => this.cycleVolume() },
      ],
      { transparent: true, left: true },
    );
  }

  private cycleVolume(): void {
    const steps = [0, 0.3, 0.6, 0.85, 1];
    const i = steps.findIndex((v) => Math.abs(v - this.save.volume) < 0.05);
    this.save.volume = steps[(i + 1) % steps.length];
    audio.volume(this.save.volume);
    audio.play('coin');
    storeSave(this.save);
    this.showTitle();
    if (this.menu) this.menu.sel = 4;
    this.refreshSel();
  }

  private showHelp(): void {
    this.openMenu(
      `<h2>遊び方</h2><div class="help">
      <h4>基本</h4>
      <kbd>A</kbd><kbd>D</kbd> 移動　<kbd>SPACE</kbd> ジャンプ(空中でもう1回)　<kbd>J</kbd> / 左クリック 斬る<br>
      連打で <b>三連撃</b>。斬撃は敵に向かって自動で踏み込みます。<kbd>W</kbd>+<kbd>J</kbd> 斬り上げ → 空中連撃、空中で <kbd>S</kbd>+<kbd>J</kbd> 落下斬り。
      <h4>爽快アクション</h4>
      <kbd>SHIFT</kbd> <b>燕返し</b>：一瞬で駆け抜け、通り道の敵を<b>同時に真っ二つ</b>（斬気1消費。ゲージが空でも短い回避ステップ）。<br>
      <kbd>I</kbd> <b>居合・奥義</b>：溜めて前方の敵を一刀で全滅（斬気2消費）。<br>
      斬気は時間で回復。敵を斬るほどコンボが伸び、点数が増えます。
      <h4>受け流し</h4>
      敵が光る → <b style="color:#6fb0ff">青い「!」</b>は <kbd>K</kbd> / 右クリックで<b>パリィ</b>。当たる直前に押すと完全弾き（敵が怯み、一撃で成敗）。<br>
      <b style="color:#ff5a5a">赤い「!!」</b>は弾けません。<b>燕返しで避ける</b>か、跳んでかわす。ギリギリで避けると<b>見切り</b>で時間がゆっくりに。<br>
      矢は弾くと跳ね返り、斬り落とすこともできます。
      <h4>進行</h4>
      戦いの場は敵を倒すと開きます。各幕のあとに<b>巻物</b>（強化）を1つ選べます。<br>
      ゲームパッド対応：スティック / A跳 / X斬 / B弾 / RB・RT燕返し / Y居合 / START ポーズ
      </div>`,
      [{ label: '戻る', act: () => this.showTitle() }],
    );
  }

  private showSelect(): void {
    const items: MenuItem[] = STAGES.map((s, i) => {
      const rec = this.save.records[String(s.id)];
      const locked = s.id > this.save.unlocked;
      return {
        label: `第${KANJI_NUM[s.id]}幕　${s.jp}`,
        sub: locked ? '未解放' : rec ? `最高 ${rec.bestScore.toLocaleString()}点  ランク ${rec.bestRank}` : s.blurb,
        disabled: locked,
        act: () => { this.run = { stageIdx: i, scrolls: [], endless: false, practice: true, total: 0 }; this.startStage(); },
      };
    });
    items.push({ label: '戻る', act: () => this.showTitle() });
    this.openMenu('<h2>稽古</h2><div class="sub">好きな幕から始める（巻物なし）</div>', items);
  }

  private openPause(): void {
    this.mode = 'menu';
    this.openMenu('<h2>一時停止</h2>', [
      { label: '再開', act: () => { this.closeUi(); this.mode = 'play'; this.last = performance.now(); } },
      { label: 'やり直す', sub: 'この幕を最初から', act: () => this.startStage() },
      { label: 'タイトルへ', act: () => this.showTitle() },
    ], { transparent: false });
  }

  private onKo(): void {
    this.mode = 'ko';
    this.hud.setMode(true);
    if (this.run.endless) return this.finishEndless();
    this.openMenu('<h2>無念…</h2><div class="sub">斬られてしまった</div>', [
      { label: 'もう一度', sub: 'この戦いからやり直す', act: () => { this.world.retryEncounter(); this.closeUi(); this.mode = 'play'; this.acc = 0; this.view.clearFx(); this.view.snapCamera(this.world.p.x); } },
      { label: 'この幕を最初から', act: () => this.startStage() },
      { label: 'タイトルへ', act: () => this.showTitle() },
    ]);
  }

  private finishEndless(): void {
    const w = this.world;
    const score = finalScore(w.score, 0);
    const newBest = score > this.save.endlessBest;
    this.save.endlessBest = Math.max(this.save.endlessBest, score);
    this.save.endlessKills = Math.max(this.save.endlessKills, w.kills);
    storeSave(this.save);
    this.mode = 'result';
    this.openMenu(
      `<h2>百人斬り</h2><div class="rank ${w.kills >= 100 ? 'S' : w.kills >= 50 ? 'A' : 'B'}">${w.kills}<span style="font-size:.28em">人</span></div>
      <table class="res"><tr><td>得点</td><td>${score.toLocaleString()}${newBest ? '　NEW!' : ''}</td></tr><tr><td>最大コンボ</td><td>${w.maxCombo}</td></tr><tr><td>生存</td><td>${formatTime(w.time)}</td></tr></table>`,
      [
        { label: 'もう一度', act: () => { this.run = { stageIdx: 0, scrolls: [], endless: true, practice: false, total: 0 }; this.startStage(); } },
        { label: 'タイトルへ', act: () => this.showTitle() },
      ],
    );
  }

  private onClear(): void {
    const w = this.world;
    const stage = this.currentStage();
    const fs = finalScore(w.score, w.damageTaken);
    const res = applyResult(this.save, stage.id, fs, w.time, w.parScore);
    storeSave(this.save);
    this.run.total += fs;
    this.mode = 'result';
    const last = !this.run.practice && this.run.stageIdx >= STAGES.length - 1;
    const items: MenuItem[] = [];
    if (!this.run.practice && !last) items.push({ label: '次の幕へ', sub: '巻物を1つ選ぶ', act: () => this.showScrolls() });
    items.push({ label: 'もう一度', act: () => this.startStage() });
    items.push({ label: 'タイトルへ', act: () => this.showTitle() });
    this.openMenu(
      `<h2>${last ? '天下泰平' : '一刀両断'}</h2><div class="sub">${stage.jp}</div><div class="rank ${res.rank}">${res.rank}</div>
      <table class="res"><tr><td>得点</td><td>${fs.toLocaleString()}${res.newBest ? '　NEW!' : ''}</td></tr>
      <tr><td>斬った数</td><td>${w.kills}</td></tr><tr><td>最大コンボ</td><td>${w.maxCombo}</td></tr>
      <tr><td>被ダメージ</td><td>${Math.round(w.damageTaken)}</td></tr><tr><td>時間</td><td>${formatTime(w.time)}</td></tr>
      ${last ? `<tr><td>総得点</td><td>${this.run.total.toLocaleString()}</td></tr>` : ''}</table>`,
      items,
    );
  }

  private showScrolls(): void {
    const ids = this.world.offerScrolls();
    const items: MenuItem[] = ids.map((id, i) => {
      const s = SCROLLS.find((x) => x.id === id)!;
      return {
        label: s.name,
        html: `<span class="k">${i + 1}</span><h3>${s.name}</h3><p>${s.desc}</p>`,
        act: () => {
          this.run.scrolls = [...this.world.scrolls, id];
          this.run.stageIdx++;
          this.startStage();
        },
      };
    });
    this.openMenu('<h2>巻物</h2><div class="sub">強化を1つ選べ</div>', items, { cards: true });
  }

  // ------------------------------------------------------------------ menus

  private openMenu(head: string, items: MenuItem[], o: { cards?: boolean; transparent?: boolean; left?: boolean } = {}): void {
    this.hud.setHint(false);
    const cols = !!o.cards;
    this.ui.className = 'on' + (o.transparent ? ' clear' : '') + (o.left ? ' left' : '');
    const first = items.findIndex((i) => !i.disabled);
    this.menu = { items, sel: Math.max(0, first), cols };
    this.menuAge = 0;
    const body = items
      .map((it, i) =>
        cols
          ? `<div class="card" data-i="${i}">${it.html ?? it.label}</div>`
          : `<button class="btn${it.disabled ? ' dis' : ''}" data-i="${i}"><span>${it.label}${it.sub ? `<small>${it.sub}</small>` : ''}</span></button>`,
      )
      .join('');
    this.ui.innerHTML = `<div class="panel">${head}<div class="${cols ? 'cards' : 'menu'}">${body}</div></div>`;
    this.ui.querySelectorAll<HTMLElement>('[data-i]').forEach((el) => {
      const i = Number(el.dataset.i);
      el.addEventListener('mouseenter', () => { if (this.menu && !items[i].disabled) { this.menu.sel = i; this.refreshSel(); } });
      el.addEventListener('click', () => this.pick(i));
    });
    this.refreshSel();
  }

  private refreshSel(): void {
    if (!this.menu) return;
    this.ui.querySelectorAll<HTMLElement>('[data-i]').forEach((el) => el.classList.toggle('sel', Number(el.dataset.i) === this.menu!.sel));
  }

  private closeUi(): void {
    this.menu = null;
    this.ui.className = '';
    this.ui.innerHTML = '';
  }

  private pick(i: number): void {
    const m = this.menu;
    if (!m || m.items[i].disabled || this.menuAge < 0.25) return;
    audio.play('coin');
    m.items[i].act();
  }

  private navMenu(it: Intent, dt: number): void {
    const m = this.menu;
    if (!m) return;
    this.menuAge += dt;
    const my = it.moveY;
    const up = my > 0.5 && this.prevMy <= 0.5;
    const down = my < -0.5 && this.prevMy >= -0.5;
    this.prevMy = my;
    const step = (d: number) => {
      let s = m.sel;
      for (let k = 0; k < m.items.length; k++) {
        s = (s + d + m.items.length) % m.items.length;
        if (!m.items[s].disabled) break;
      }
      if (s !== m.sel) { m.sel = s; audio.play('swing', 1.6); this.refreshSel(); }
    };
    if (m.cols) {
      if (it.left) step(-1);
      if (it.right) step(1);
      if (it.digit && it.digit <= m.items.length) this.pick(it.digit - 1);
    } else {
      if (up) step(-1);
      if (down) step(1);
    }
    if (it.confirm || (it.slash && !m.cols)) this.pick(m.sel);
    if (this.bot && this.menuAge > 0.8) this.pick(0);
  }

  // ------------------------------------------------------------------ main loop

  private frame = (nowMs: number): void => {
    requestAnimationFrame(this.frame);
    const real = Math.min(0.05, Math.max(0, (nowMs - this.last) / 1000));
    this.last = nowMs;
    this.time += real;
    const it = this.input.poll();
    if (it.confirm || it.slash || it.jump || it.dash || it.parry || it.moveX || it.moveY) audio.unlock();
    this.navMenu(it, real);

    let animDt = real;
    if (this.mode === 'play') {
      if (it.pause && !this.bot) this.openPause();
      if (it.digit === 0 && this.hintT > 0) {
        this.hintT -= real;
        if (this.hintT <= 0) this.hud.setHint(false);
      }
      this.latch.feed(it);
      const now = performance.now();
      const frozen = this.hitStop.active(now);
      const scale = this.slowMo.scale(now);
      animDt = frozen ? 0 : real * scale;
      if (!frozen) {
        this.acc += real * scale;
        let n = 0;
        while (this.acc >= STEP && n < 6) {
          let cmd: Cmd = this.latch.take();
          if (this.bot) cmd = { ...emptyCmd(), ...botCommand(this.world, 'smart') };
          this.world.update(STEP, cmd);
          this.handleEvents(this.world.drain());
          this.acc -= STEP;
          n++;
        }
        if (n === 6) this.acc = 0;
      }
      const w = this.world;
      const p = w.p;
      const zt = p.state === 'iai' && p.t < P.iaiCharge ? Math.min(1, p.t / P.iaiCharge) : 0;
      this.view.zoom += (zt - this.view.zoom) * Math.min(1, real * 12);
      this.view.setSlowTint(scale < 0.9 || w.slowT > 0 ? 1 : 0);
      if (this.overAt < 0 && (w.ko || w.cleared)) this.overAt = this.time + (w.cleared ? 2.4 : 1.5);
      if (this.overAt > 0 && this.time >= this.overAt) {
        this.overAt = -1;
        if (w.cleared) this.onClear();
        else this.onKo();
      }
      if (this.run.endless && !this.showed100 && w.kills >= 100) {
        this.showed100 = true;
        this.hud.stamp('百人斬り達成', '#ffe27a');
        audio.play('levelup');
      }
    } else if (this.mode === 'ko' || this.mode === 'result') {
      // keep the scene alive behind the result panel
    }
    this.view.update(this.world, animDt, real, this.time, { dashing: this.world.p.state === 'dash' && this.mode === 'play' });
    this.hud.update(this.world, this.view, this.time);
    this.view.render(real);
  };

  // ------------------------------------------------------------------ events → juice

  private handleEvents(evs: WorldEvent[]): void {
    const now = performance.now();
    const v = this.view;
    const w = this.world;
    const fl = (x: number, y: number, t: string, c: string) => this.hud.float(v, x, y, t, c);
    for (const ev of evs) {
      const x = ev.x ?? 0;
      const y = ev.y ?? 0;
      switch (ev.type) {
        case 'slash': {
          const def = SLASH[ev.kind ?? 's1'];
          const heavy = !!def?.heavy;
          v.slashTrail(x, y, ev.angle ?? 0, ev.face ?? 1, (def?.reach ?? 3) + w.mods.reach, heavy ? 0xffd9a0 : 0xbfe4ff, heavy);
          audio.play('swing', 0.9 + (ev.n ?? 1) * 0.12);
          if (w.p.onGround) v.dust(x, 3);
          break;
        }
        case 'hit': {
          const heavy = ev.n === 1;
          v.particles.burst(x, y, 0.5, heavy ? 22 : 12, heavy ? 10 : 7, 0xffd9a0, 0.04, 0.35);
          v.fx.flash(x, y, 0.6, heavy ? 0.35 : 0.22, 0xffe0b0, 0.08);
          this.hitStop.trigger(now, heavy ? 75 : 40);
          v.addShake(heavy ? 0.3 : 0.14);
          audio.play(heavy ? 'hitHeavy' : 'hit', 0.95 + Math.random() * 0.15);
          if (ev.dmg) fl(x, y + 0.6, String(Math.round(ev.dmg)), heavy ? 'big' : 'dmg');
          break;
        }
        case 'cut': {
          const def = ENEMIES[(ev.kind as keyof typeof ENEMIES) ?? 'ashigaru'];
          if (ev.id !== undefined) {
            v.setActorHeight(ev.id, def.h * 0.55);
            v.splitActor(ev.id, ev.angle ?? 0, ev.face ?? 1, ev.w ?? 3);
          }
          v.cutLine(x, y, ev.angle ?? 0, ev.face ?? 1, def.h * 2.6);
          v.particles.burst(x, y, 0.5, 34, 11, 0xff5a40, 0.09, 0.6);
          v.particles.burst(x, y, 0.5, 18, 7, 0xffffff, 0.06, 0.35);
          v.fx.flash(x, y, 0.8, 0.5, 0xffd8b0, 0.1);
          v.fx.ring(x, y, 0.5, 1.2, 0xffb090, 0.25, v.camera.position.clone().set(0, 0, 1));
          this.hitStop.trigger(now, def.armored ? 130 : 62);
          v.addShake(def.armored ? 0.6 : 0.34);
          v.addAberr(0.004);
          v.flash(0xffffff, def.armored ? 0.2 : 0.07);
          audio.play('slice', 0.9 + Math.min(20, ev.n ?? 0) * 0.025);
          if ((ev.n ?? 0) > 0 && (ev.n ?? 0) % 10 === 0) {
            this.hud.stamp(`${ev.n}連斬`, '#ffe27a');
            audio.play('milestone');
          }
          break;
        }
        case 'multikill': {
          const n = ev.n ?? 3;
          this.hud.stamp(`${n <= 10 ? KANJI_NUM[n] : n}人斬り`, '#fff');
          this.slowMo.trigger(now, 320, 0.3);
          audio.play('multikill', 1 + Math.min(n, 8) * 0.03);
          v.kickFov(0.8);
          break;
        }
        case 'dash': {
          v.kickFov(0.9);
          v.addAberr(0.006);
          const p = w.p;
          v.fx.beam(p.dashFrom, p.y + 1.0, 0.6, p.dashTo, p.y + 1.0, 0.6, ev.n ? 0xbfeaff : 0x9fb8d0, ev.n ? 0.55 : 0.3, 0.26);
          v.particles.spray(x, y + 1, 0.3, -(ev.face ?? 1), 0.1, 0, 22, 18, 0xbfe4ff, 0.1);
          v.dust(x, 6);
          audio.play(ev.n ? 'rush' : 'dodge', ev.n ? 1.1 : 1.4);
          break;
        }
        case 'mark':
          v.fx.flash(x, y, 0.8, 0.55, 0xff3060, 0.35);
          v.fx.ring(x, y, 0.8, 1.3, 0xff3060, 0.3);
          audio.play('coin', 1.8 + Math.random() * 0.4);
          break;
        case 'dashCut': {
          const n = ev.n ?? 0;
          this.hitStop.trigger(now, 90 + Math.min(5, n) * 25);
          v.addShake(0.5 + Math.min(4, n) * 0.1);
          v.kickFov(1.2);
          v.flash(0xffffff, 0.22);
          if (n >= 2) {
            this.hud.stamp(n >= 4 ? `一閃 ×${n}` : '燕返し');
            this.slowMo.trigger(now, 260, 0.3);
          }
          audio.play('rushHit', 1.0);
          break;
        }
        case 'parry': {
          v.fx.ring(x, y, 0.8, 3.2, 0xbfeaff, 0.35, v.camera.position.clone().setX(0).setY(0).setZ(1));
          v.fx.flash(x, y, 0.8, 1.6, 0xffffff, 0.2);
          v.particles.burst(x, y, 0.8, 50, 14, 0xfff0b0, 0.07, 0.5);
          this.hitStop.trigger(now, 140);
          this.slowMo.trigger(now, 240, 0.3);
          v.addShake(0.5);
          v.addAberr(0.01);
          v.flash(0xaaddff, 0.28);
          audio.play('clang', 1.2);
          audio.play('counter', 1.1);
          fl(x, y + 0.9, '弾き！', 'parry');
          break;
        }
        case 'block':
          v.particles.burst(x, y, 0.6, 14, 8, 0xffd9a0, 0.12, 0.3);
          this.hitStop.trigger(now, 40);
          v.addShake(0.2);
          audio.play('clang', 0.8);
          fl(x, y + 0.7, 'GUARD', 'dmg');
          break;
        case 'guard':
          v.particles.burst(x, y, 0.6, 10, 7, 0xcfe4ff, 0.12, 0.3);
          v.addShake(0.1);
          audio.play('clang', 1.0 + Math.random() * 0.3);
          fl(x, y + 0.5, 'GUARD', 'warn');
          break;
        case 'guardBreak':
          this.hitStop.trigger(now, 100);
          v.addShake(0.4);
          audio.play('break');
          fl(x, y + 0.6, '崩し！', 'big');
          break;
        case 'stun':
          audio.play('warn', 1.6);
          fl(x, y + 0.2, '隙！', 'good');
          break;
        case 'postureBreak':
          this.hitStop.trigger(now, 90);
          audio.play('break');
          fl(x, y + 0.2, '体幹崩し', 'good');
          break;
        case 'execute':
          this.hitStop.trigger(now, 120);
          fl(x, y + 0.9, '成敗！', 'good');
          break;
        case 'justDash':
          this.slowMo.trigger(now, 560, 0.5);
          v.flash(0x6fb0ff, 0.2);
          v.kickFov(1);
          audio.play('milestone', 1.4);
          fl(x, y + 2.2, '見切り！', 'parry');
          break;
        case 'iaiStart':
          audio.play('sheath');
          break;
        case 'iaiFire': {
          const p = w.p;
          v.fx.beam(p.x, p.y + 1.1, 0.7, p.x + (ev.face ?? 1) * P.iaiReach, p.y + 1.1, 0.7, 0xffffff, 0.9, 0.4);
          v.fx.beam(p.x, p.y + 1.1, 0.6, p.x + (ev.face ?? 1) * P.iaiReach, p.y + 1.1, 0.6, 0xffc080, 2.2, 0.3);
          v.flash(0xffffff, 0.7);
          v.addShake(1.0);
          v.kickFov(1.5);
          v.addAberr(0.014);
          this.hitStop.trigger(now, 170);
          this.slowMo.trigger(now, 420, 0.3);
          this.hud.stamp('居合', '#fff');
          audio.play('boom', 0.8);
          audio.play('slice', 0.7);
          break;
        }
        case 'hurt':
          this.hud.hurtFlash();
          v.addShake(0.55);
          v.flash(0xff2020, 0.25);
          v.addAberr(0.01);
          this.hitStop.trigger(now, 90);
          audio.play('hurt');
          fl(x, y + 0.8, String(Math.round(ev.dmg ?? 0)), 'warn');
          break;
        case 'playerDown':
          this.slowMo.trigger(now, 1300, 0.22);
          this.hud.stamp('無念', '#b0b0b0');
          v.addShake(0.8);
          audio.play('hurt', 0.6);
          break;
        case 'lock':
          this.hud.showBanner('敵襲', '全て斬り伏せよ');
          audio.play('taiko', 0.9);
          break;
        case 'wave':
          if ((ev.n ?? 1) > 1 || w.endless) this.hud.showBanner(w.endless ? `第${ev.n}波` : `${ev.n} / ${ev.total}`, '');
          audio.play('horde');
          break;
        case 'unlock':
          this.hud.showBanner('進め', '');
          audio.play('milestone');
          break;
        case 'boss':
          this.hud.showBanner('将軍 見参', 'SHOGUN');
          audio.play('taiko', 0.7);
          break;
        case 'stageClear':
          this.hud.stamp('天下泰平', '#ffe27a');
          this.slowMo.trigger(now, 1000, 0.3);
          audio.play('levelup');
          break;
        case 'telegraph':
          if (ev.kind === 'red') {
            audio.play('warn', 1.0);
            v.fx.ring(x, y + 1, 0.6, 1.6, 0xff2a2a, 0.3);
            fl(x, y + 2.6, '！', 'warn');
          } else if (ev.kind === 'blue') {
            v.fx.ring(x, y + 1, 0.6, 1.3, 0x2f80ff, 0.25);
          }
          break;
        case 'arrowShot': case 'starShot':
          audio.play('bow', 1 + Math.random() * 0.2);
          break;
        case 'stompWave':
          v.fx.ring(x, 0.12, 0, ev.n ?? 4, 0xffa040, 0.5);
          v.dust(x, 14);
          v.addShake(0.6);
          audio.play('boom', 0.9);
          break;
        case 'land':
          v.dust(x, 5);
          if ((ev.n ?? 0) > 18) v.addShake(0.15);
          break;
        case 'enemyLand':
          v.dust(x, 6);
          audio.play('hit', 0.7);
          break;
        case 'jump':
          v.dust(x, 4);
          break;
        case 'djump':
          v.noteDoubleJump();
          v.fx.ring(x, y + 0.1, 0, 1.4, 0xbfeaff, 0.3);
          audio.play('dodge', 1.5);
          break;
        case 'plunge':
          v.fx.ring(x, 0.12, 0, 4, 0xffe0a0, 0.4);
          v.dust(x, 14);
          v.addShake(0.6);
          this.hitStop.trigger(now, 70);
          audio.play('boom', 1.1);
          break;
        case 'launch':
          audio.play('hitHeavy', 1.3);
          v.particles.burst(x, y, 0.5, 14, 8, 0xffe0a0, 0.14, 0.4);
          break;
        case 'poof':
          v.particles.burst(x, 1, 0, 18, 6, 0x6a6a72, 0.28, 0.7, -2);
          audio.play('dodge', 0.9);
          break;
        case 'projCut':
          v.particles.burst(x, y, 0.4, 10, 6, 0xffffff, 0.1, 0.3);
          v.fx.flash(x, y, 0.5, 0.4, 0xffffff, 0.1);
          audio.play('slice', 1.6);
          break;
        case 'reflect':
          v.fx.ring(x, y, 0.5, 1.5, 0xffe27a, 0.3);
          audio.play('clang', 1.6);
          break;
        case 'waveShot':
          audio.play('swing', 1.5);
          break;
        case 'bolt':
          v.fx.beam(x, 14, 0, x, y, 0, 0xcfe8ff, 0.5, 0.28);
          v.fx.flash(x, y + 1, 0.6, 2, 0xcfe8ff, 0.2);
          v.flash(0xcfe8ff, 0.2);
          audio.play('boom', 1.3);
          break;
        case 'heal':
          fl(x, w.p.y + 2, '+回復', 'good');
          audio.play('heal');
          break;
        case 'reinforce':
          this.hud.showBanner('援軍', '');
          audio.play('horde');
          break;
        default:
          break;
      }
    }
  }
}
