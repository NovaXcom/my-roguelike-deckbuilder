// UIコントローラ。ロジック(engine/)は呼び出すだけで、ゲーム規則はここに書かない。
import { ENDINGS } from '../data/endings';
import { FACT_LIST, RECORD_IDS, factMap } from '../data/facts';
import { LOCATIONS, NPCS, loc as locDef } from '../data/world';
import { availableEvents, availableThreads, connect, currentLead, hintNow, nextAuto, presentNpcs, tellOptions, travelOptions } from '../engine/logic';
import { BOUNDS, EXITS, TIME_SPEEDS, clampX, clampY, spots, talkEvents, type Spot } from '../engine/explore';
import { run } from '../engine/runner';
import { playEvent, processTime, startDay, stealthFail, tellTo, travelTo, waitMinutes, type Gen } from '../engine/session';
import { STEALTH_SPEED, createStealth, stepStealth, type StealthState, type StealthStatus } from '../engine/stealth';
import { stealthDef } from '../data/stealth';
import { advance, dayOver, deserialize, newState, nextLoop, recCount, serialize } from '../engine/state';
import type { GameEvent, GameState, LocId, NpcId, Step } from '../engine/types';
import { Sound } from './audio';
import { H, W, drawScene, skyAt, speakerLook, type SceneInfo } from './render';

const SAVE_KEY = 'last-day-save-v1';
const END_KEY = 'last-day-endings-v1';
const OPT_KEY = 'last-day-options-v1';

const store = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* 保存できない環境でも遊べる */ } },
};

const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const SPEAKER_COLOR: Record<string, string> = {
  'ソウ': '#7fd6e6', 'ミナ': '#f4a6a0', '黒田': '#9fb0d8', '佐伯': '#cfe3d4', 'ユウ': '#f2d36b', '少女': '#e8e8ff', '栞': '#e8e8ff',
  '田所': '#8fd69a', '篠原先生': '#a7c3e8', '朝霧': '#d8dce8', '源さん': '#d9b48a', 'ひなこ': '#f4a9c4', '久保さん': '#c4a8e0', '椎名': '#d8a8a0',
};
const SLOTS = [150, 205, 255, 112, 285, 175, 230];
interface Actor { id: NpcId; x: number; y: number; tx: number; dir: number; moving: boolean; leaving: boolean; slot: number; wait: number }
type Target = { kind: 'npc'; npc: NpcId; label: string } | { kind: 'spot'; spot: Spot; label: string };

export class Game {
  s: GameState = newState();
  sound = new Sound();
  private root: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private tick = 0;
  private flash = 0;
  private glitch = 0;
  private speaking: string | null = null;
  private inGame = false;
  private busy = false;
  private pendingDayEnd = false;
  private $ = (id: string) => this.root.querySelector<HTMLElement>('#' + id)!;
  private advanceResolve: (() => void) | null = null;
  private typing: { full: string; el: HTMLElement; timer: number } | null = null;
  private seenEndings: string[] = [];
  // 歩き回り（UI状態。ゲームの規則は engine/ にある）
  private hero = { id: 'sou', x: 160, y: 150, dir: 1, moving: false };
  private goal: { x: number; y: number; then?: () => void } | null = null;
  private keys = new Set<string>();
  private actors = new Map<NpcId, Actor>();
  private lastTs = performance.now();
  private clockAcc = 0;
  private stepSnd = 0;
  private cacheKey = '';
  private spotsNow: Spot[] = [];
  private talkNow = new Map<NpcId, GameEvent[]>();
  private presentNow: NpcId[] = [];
  private targetNow: Target | null = null;
  private nextSpawn: 'L' | 'R' | null = null;
  private instantActors = true;
  private exiting = false;
  private speedIdx = 2;
  private modalClose: (() => void) | null = null;
  // 追跡・隠れる
  private stealth: StealthState | null = null;
  private stealthResolve: ((s: StealthStatus | 'quit') => void) | null = null;
  private easyStealth = false;
  private lastTargetX = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    try { this.seenEndings = JSON.parse(store.get(END_KEY) ?? '[]'); } catch { this.seenEndings = []; }
    try { const o = JSON.parse(store.get(OPT_KEY) ?? '{}'); this.easyStealth = !!o.easy; if (typeof o.speed === 'number') this.speedIdx = o.speed; } catch { /* 既定値 */ }
    this.build();
    this.bindKeys();
    this.frame();
    this.showTitle();
  }

  // ───────────── DOM ─────────────
  private build() {
    this.root.innerHTML = `
    <div id="wrap">
      <div id="stage">
        <canvas id="scene" width="${W}" height="${H}"></canvas>
        <div id="fade"></div>
        <div id="hud" hidden>
          <div id="clockbox"><div id="clock"></div><div id="bar"><i id="barfill"></i></div></div>
          <div id="loopno"></div>
          <div id="place"></div>
          <div id="hudbtns">
            <button id="bMem" class="hb" title="記憶（証拠ボード）">📓 記憶</button>
            <button id="bMenu" class="hb" title="メニュー">☰</button>
          </div>
        </div>
        <div id="toast"></div>
        <div id="prompt" hidden></div>
        <div id="sbar" hidden></div>
        <div id="dlg" hidden>
          <div id="spk"></div>
          <div id="txt"></div>
          <div id="choices"></div>
          <div id="more">▼</div>
        </div>
      </div>
      <div id="panel" hidden></div>
      <div id="modal" hidden></div>
    </div>`;
    this.canvas = this.$('scene') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.$('dlg').addEventListener('click', () => this.onAdvance());
    this.$('prompt').addEventListener('click', () => void this.interact());
    this.canvas.addEventListener('pointerdown', (e) => this.onCanvasClick(e));
    this.$('bMem').addEventListener('click', () => { this.ui('select'); this.openMemory(); });
    this.$('bMenu').addEventListener('click', () => { this.ui('select'); this.openMenu(); });
  }

  private bindKeys() {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (this.stealth && k === 'escape' && this.$('modal').hidden) { this.stealthResolve?.('quit'); this.stealthResolve = null; return; }
      if (this.exploring() || (this.stealth && !this.busy && this.$('modal').hidden)) {
        if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', 'enter'].includes(k)) e.preventDefault();
        if (!this.stealth && (k === 'e' || k === ' ' || k === 'enter')) { void this.interact(); return; }
        this.keys.add(k);
      }
      if (k === ' ' || k === 'enter') { if (!this.$('dlg').hidden && !this.$('choices').childElementCount) { e.preventDefault(); this.onAdvance(); } }
      if (/^[1-9]$/.test(k)) { const b = this.$('choices').children[Number(k) - 1] as HTMLElement | undefined; b?.click(); }
      if (k === 'escape' && !this.$('modal').hidden && this.$('modal').dataset.closable === '1') this.closeModal();
      if (k === 'm' && this.exploring()) this.openMemory();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private ui(id: string) { this.sound.sfx(id); }

  // ───────────── 描画ループ ─────────────
  private exploring() { return this.inGame && !this.busy && !this.exiting && !this.stealth && this.$('modal').hidden && this.$('dlg').hidden; }

  private info(): SceneInfo {
    const s = this.s;
    const title = !this.inGame;
    return {
      loc: title ? 'beach' : s.loc,
      time: title ? 1100 + Math.sin(this.tick / 400) * 60 : s.time,
      blackout: !title && s.flags.blackout !== undefined,
      light: title ? false : s.flags.light !== undefined,
      crack: !title && s.flags.crack !== undefined,
      actors: title ? [] : [...this.actors.values()].map((a) => ({ id: a.id, x: a.x, y: a.y, dir: a.dir, moving: a.moving })),
      hero: title ? null : { ...this.hero },
      spots: title || this.stealth ? [] : this.spotsNow.map((p) => ({ x: p.x, kind: p.kind })),
      exits: title ? { L: 0, R: 0 } : { L: EXITS[s.loc].L.length, R: EXITS[s.loc].R.length },
      stealth: title || !this.stealth ? null : this.stealthView(),
      speaking: this.speaking, tick: this.tick, loop: s.loop,
      flash: this.flash, glitch: Math.max(this.glitch, this.inGame ? Math.min(0.5, (s.loop - 1) / 40) : 0),
    };
  }

  private frame = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTs) / 1000);
    this.lastTs = now;
    this.tick++;
    this.flash = Math.max(0, this.flash - 0.03);
    this.glitch = Math.max(0, this.glitch - 0.02);
    if (this.inGame) {
      this.syncWorld();
      const ex = this.exploring();
      if (ex) { this.stepHero(dt); this.stepClock(dt); }
      else if (this.stealth && !this.busy && this.$('modal').hidden) this.stepStealthFrame(dt);
      this.stepActors(dt);
      if (ex) this.updateTarget(); else this.setPrompt(null);
    }
    drawScene(this.ctx, this.info());
    requestAnimationFrame(this.frame);
  };

  // ───────────── 歩き回り ─────────────
  /** 状態が変わった時だけ、調査ポイント・話せる相手・居合わせる人を再計算 */
  private syncWorld() {
    const s = this.s;
    const key = `${s.loc}|${s.time}|${Object.keys(s.seenNow).length}|${s.newFacts.length}|${Object.keys(s.flags).length}|${Object.keys(s.facts).length}`;
    if (key === this.cacheKey) return;
    this.cacheKey = key;
    const avail = availableEvents(s);
    this.spotsNow = spots(s, avail);
    this.talkNow = talkEvents(s, avail);
    this.presentNow = presentNpcs(s);
  }

  private resetWorld(side: 'L' | 'R' | null = null) {
    this.hero.x = side === 'L' ? 22 : side === 'R' ? 298 : 120;
    this.hero.y = 150; this.hero.dir = side === 'R' ? -1 : 1; this.hero.moving = false;
    this.goal = null; this.actors.clear(); this.cacheKey = ''; this.instantActors = true; this.targetNow = null;
  }

  private stepHero(dt: number) {
    const h = this.hero, k = this.keys;
    let dx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    let dy = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
    if (dx || dy) this.goal = null;
    else if (this.goal) {
      const gx = this.goal.x - h.x, gy = this.goal.y - h.y, d = Math.hypot(gx, gy);
      if (d < 2) { const th = this.goal.then; this.goal = null; th?.(); }
      else { dx = gx / d; dy = gy / d; }
    }
    h.moving = !!(dx || dy);
    if (h.moving) {
      const len = Math.hypot(dx, dy) || 1;
      const sp = this.stealth ? STEALTH_SPEED : 80;
      h.x = clampX(h.x + (dx / len) * sp * dt); h.y = clampY(h.y + (dy / len) * sp * 0.62 * dt);
      if (dx) h.dir = dx > 0 ? 1 : -1;
      this.stepSnd += dt; if (this.stepSnd > 0.32) { this.stepSnd = 0; this.sound.sfx('step'); }
      const e = EXITS[this.s.loc];
      if (this.stealth) return;
      if (h.x <= BOUNDS.x0 + 0.6 && dx <= 0 && e.L.length) void this.takeExit('L');
      else if (h.x >= BOUNDS.x1 - 0.6 && dx >= 0 && e.R.length) void this.takeExit('R');
    }
  }

  private stepClock(dt: number) {
    const sec = TIME_SPEEDS[this.speedIdx].sec;
    if (!sec) return;
    this.clockAcc += dt;
    if (this.clockAcc < sec) return;
    this.clockAcc -= sec;
    advance(this.s, 1);
    if (nextAuto(this.s) || dayOver(this.s)) { void this.act(() => processTime(this.s)); return; }
    this.renderHud();
    if (this.s.time % 15 === 0) { this.sound.setScene(this.s.loc, this.s.time, { blackout: this.s.flags.blackout !== undefined, light: this.s.flags.light !== undefined }); this.save(); }
  }

  private stepActors(dt: number) {
    const present = new Set(this.presentNow);
    for (const id of present) {
      if (this.actors.has(id)) { this.actors.get(id)!.leaving = false; continue; }
      const used = new Set([...this.actors.values()].map((a) => a.slot));
      const slot = SLOTS.findIndex((_, i) => !used.has(i));
      const sx = SLOTS[slot < 0 ? 0 : slot], y = 140 + (this.actors.size % 3) * 9;
      const fromLeft = Math.random() < 0.5;
      this.actors.set(id, { id, x: this.instantActors ? sx : fromLeft ? -8 : 328, y, tx: sx, dir: 1, moving: false, leaving: false, slot: Math.max(0, slot), wait: 2 + Math.random() * 3 });
    }
    this.instantActors = false;
    for (const [id, a] of this.actors) {
      if (this.stealth && id === this.stealth.def.target) continue;
      if (!present.has(id) && !a.leaving) { a.leaving = true; a.tx = a.x < 160 ? -12 : 332; }
      if (!a.leaving) { a.wait -= dt; if (a.wait <= 0) { a.wait = 3 + Math.random() * 4; a.tx = SLOTS[a.slot] + (Math.random() - 0.5) * 36; } }
      const d = a.tx - a.x;
      a.moving = Math.abs(d) > 1.2;
      if (a.moving) { a.x += Math.sign(d) * Math.min(Math.abs(d), (a.leaving ? 46 : 26) * dt); a.dir = Math.sign(d); }
      if (a.leaving && (a.x < -10 || a.x > 330)) this.actors.delete(id);
    }
  }

  private updateTarget() {
    let best: { d: number; t: Target } | null = null;
    for (const a of this.actors.values()) {
      const evs = this.talkNow.get(a.id);
      if (a.leaving || !evs) continue;
      const dx = Math.abs(a.x - this.hero.x), dy = Math.abs(a.y - this.hero.y);
      if (dx < 28 && dy < 22) {
        const name = NPCS.find((n) => n.id === a.id)!.name;
        const d = dx + dy;
        if (!best || d < best.d) best = { d, t: { kind: 'npc', npc: a.id, label: `${name}に話しかける${evs.length > 1 ? `（${evs.length}件）` : ''}` } };
      }
    }
    for (const sp of this.spotsNow) {
      const dx = Math.abs(sp.x - this.hero.x);
      if (dx < 22) { const d = dx + 10; if (!best || d < best.d) best = { d, t: { kind: 'spot', spot: sp, label: `${sp.kind === 'stealth' ? '🕵 ' : ''}${sp.label}（${sp.cost}分）` } }; }
    }
    this.targetNow = best?.t ?? null;
    if (!best) {
      const e = EXITS[this.s.loc];
      const near = this.hero.x < BOUNDS.x0 + 26 && e.L.length ? e.L : this.hero.x > BOUNDS.x1 - 26 && e.R.length ? e.R : null;
      this.setPrompt(near ? '→ ' + near.map((l) => locDef(l).name).join(' / ') + ' へ' : null, false);
    } else this.setPrompt(best.t.label, true);
  }

  private setPrompt(text: string | null, key = true) {
    const el = this.$('prompt');
    if (!text) { el.hidden = true; return; }
    const html = (key ? '<kbd>E</kbd> ' : '') + esc(text);
    if (el.innerHTML !== html) el.innerHTML = html;
    el.hidden = false;
    el.classList.toggle('exit', !key);
  }

  private onCanvasClick(e: PointerEvent) {
    const sneaking = !!this.stealth && !this.busy && this.$('modal').hidden;
    if (!this.exploring() && !sneaking) return;
    const r = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
    const go = (gx: number, gy: number, then?: () => void) => { this.goal = { x: clampX(gx), y: clampY(gy), then }; };
    if (sneaking) { go(x, y); return; }
    for (const a of this.actors.values()) {
      if (!a.leaving && this.talkNow.has(a.id) && Math.abs(x - a.x) < 14 && y > a.y - 34 && y < a.y + 4) {
        go(a.x - 16 * (this.hero.x < a.x ? 1 : -1), a.y, () => { this.updateTarget(); void this.interact(); });
        return;
      }
    }
    for (const sp of this.spotsNow) {
      if (Math.abs(x - sp.x) < 16 && y > 104 && y < 168) { go(sp.x, this.hero.y, () => { this.updateTarget(); void this.interact(); }); return; }
    }
    go(x, y);
  }

  private async interact() {
    const t = this.targetNow;
    if (!t || !this.exploring()) return;
    this.ui('select');
    if (t.kind === 'spot') {
      const sp = t.spot;
      if (sp.kind === 'stealth') {
        const def = stealthDef(sp.event!.id)!;
        if (this.easyStealth) await this.act(() => playEvent(this.s, sp.event!)); else await this.playStealth(def, sp.event!);
        return;
      }
      if (sp.kind === 'entrance') { this.nextSpawn = null; await this.act(() => travelTo(this.s, sp.to!)); } else await this.act(() => playEvent(this.s, sp.event!));
      return;
    }
    const evs = this.talkNow.get(t.npc)!;
    let ev = evs[0];
    if (evs.length > 1) {
      const i = await this.pickList(`${NPCS.find((n) => n.id === t.npc)!.name}と…`, evs.map((e) => ({ label: e.label, sub: `${e.cost}分` })));
      if (i < 0) return;
      ev = evs[i];
    }
    await this.act(() => playEvent(this.s, ev));
  }

  private async takeExit(side: 'L' | 'R') {
    if (this.exiting) return;
    this.exiting = true; this.goal = null; this.keys.clear();
    const dests = EXITS[this.s.loc][side];
    const costs = travelOptions(this.s);
    let to: LocId | null = dests.length === 1 ? dests[0] : null;
    if (!to) {
      const i = await this.pickList('どこへ行く？', dests.map((d) => ({ label: locDef(d).name, sub: `${costs.find((c) => c.id === d)?.cost ?? 10}分` })));
      to = i < 0 ? null : dests[i];
    }
    if (!to) { this.hero.x += side === 'L' ? 24 : -24; this.exiting = false; return; }
    this.nextSpawn = side === 'L' ? 'R' : 'L';
    this.exiting = false;
    await this.act(() => travelTo(this.s, to!));
  }

  // ───────────── 追跡・隠れる ─────────────
  private async playStealth(def: import('../engine/stealth').StealthDef, ev: GameEvent) {
    this.busy = true;
    await this.consume(run(this.s, def.intro));
    const fails = this.s.seen['stealth:' + def.id] ?? 0;
    const st = createStealth(def, fails);
    this.hero.x = def.start; this.hero.y = 150; this.hero.dir = Math.sign(def.path[0].x - def.start) || 1; this.hero.moving = false;
    this.goal = null; this.keys.clear();
    const a = this.actors.get(def.target);
    this.actors.set(def.target, { id: def.target, x: st.x, y: a?.y ?? 146, tx: st.x, dir: st.dir, moving: false, leaving: false, slot: a?.slot ?? 0, wait: 99 });
    this.lastTargetX = st.x;
    this.stealth = st;
    this.busy = false;
    this.sound.sfx('sneak');
    const status = await new Promise<StealthStatus | 'quit'>((res) => { this.stealthResolve = res; });
    this.stealth = null; this.stealthResolve = null;
    this.$('sbar').hidden = true;
    this.keys.clear(); this.goal = null;
    this.actors.delete(def.target); this.cacheKey = '';
    if (status === 'quit') { this.refresh(); return; }
    if (status === 'success') {
      this.toast('🕵 気づかれなかった', 2200);
      await this.act(() => playEvent(this.s, ev));
      return;
    }
    this.s.seen['stealth:' + def.id] = fails + 1;
    this.sound.sfx('caught');
    await this.act(() => stealthFail(this.s, def, status === 'caught' ? 'caught' : 'lost'));
    if (fails + 1 >= 2) this.toast('💡 <b>「？」が出たら、物陰で立ち止まる。</b>失敗するほど、見つかりにくくなる。', 6000);
  }

  private stepStealthFrame(dt: number) {
    const st = this.stealth!;
    this.stepHero(dt);
    const before = st.alert;
    stepStealth(st, dt, { x: this.hero.x, moving: this.hero.moving });
    const a = this.actors.get(st.def.target);
    if (a) { a.moving = Math.abs(st.x - this.lastTargetX) > 0.01; a.x = st.x; a.tx = st.x; a.dir = st.glancing > 0 ? (this.hero.x < st.x ? -1 : 1) : st.dir; }
    this.lastTargetX = st.x;
    if (st.alert > 0.5 && before <= 0.5) this.sound.sfx('alert');
    this.renderStealthBar(st);
    if (st.status !== 'run' && this.stealthResolve) { const r = this.stealthResolve; this.stealthResolve = null; r(st.status); }
  }

  private renderStealthBar(st: StealthState) {
    const el = this.$('sbar'); el.hidden = false;
    const d = st.def, dist = Math.abs(this.hero.x - st.x);
    let line: string, p: number;
    if (d.goal) { p = st.hold / d.goal.hold; line = dist > d.goal.hear ? '👂 もっと近づく' : Math.abs(this.hero.x - d.goal.x) > d.goal.r ? '👂 光る線の上へ' : '👂 聞き耳を立てている…'; }
    else { p = st.hold / d.tail!.hold; line = dist > d.tail!.max ? '🏃 離れすぎている！' : dist < d.tail!.min ? '⚠ 近すぎる！' : '👣 いい距離'; }
    const state = st.hidden ? '<b class="ok">隠れている</b>' : st.glancing > 0 ? '<b class="ng">見られている！</b>' : st.warn ? '<b class="wn">？ 物陰へ！</b>' : '';
    el.innerHTML = `<span>${line}</span><i><u style="width:${Math.min(100, p * 100)}%"></u></i><span class="al"><u style="width:${st.alert * 100}%"></u></span>${state}<small>Esc でやめる</small>`;
  }

  private stealthView() {
    const st = this.stealth!, d = st.def;
    return {
      x: st.x, dir: st.dir, vision: d.vision * st.ease, alert: st.alert, warn: st.warn, glancing: st.glancing > 0, hidden: st.hidden,
      spots: d.spots, goal: d.goal ? { x: d.goal.x, r: d.goal.r, p: Math.min(1, st.hold / d.goal.hold) } : null,
    };
  }

  private pickList(title: string, items: { label: string; sub?: string }[]): Promise<number> {
    return new Promise((resolve) => {
      const card = this.openModal(`<h2>${esc(title)}</h2><div class="focus">${items.map((it, i) => `<button data-i="${i}">${esc(it.label)}${it.sub ? `<small class="dim"> ${esc(it.sub)}</small>` : ''}</button>`).join('')}</div><button class="close">やめる</button>`);
      this.modalClose = () => resolve(-1);
      card.querySelector<HTMLElement>('.close')!.onclick = () => this.closeModal();
      card.querySelectorAll<HTMLButtonElement>('[data-i]').forEach((b) => b.onclick = () => { this.ui('select'); this.modalClose = null; this.closeModal(); resolve(Number(b.dataset.i)); });
    });
  }

  // ───────────── 台詞 ─────────────
  private onAdvance() {
    if (this.typing) { window.clearInterval(this.typing.timer); this.typing.el.textContent = this.typing.full; this.typing = null; this.$('more').style.visibility = 'visible'; return; }
    const r = this.advanceResolve; this.advanceResolve = null; r?.();
  }

  private async say(speaker: string | null, text: string) {
    const dlg = this.$('dlg'), spk = this.$('spk'), txt = this.$('txt');
    dlg.hidden = false; this.$('choices').innerHTML = '';
    dlg.classList.toggle('nar', !speaker);
    spk.textContent = speaker ?? ''; spk.style.display = speaker ? '' : 'none';
    spk.style.color = speaker ? SPEAKER_COLOR[speaker] ?? '#fff' : '';
    this.speaking = speaker && speakerLook(speaker) ? speaker : null;
    txt.textContent = ''; this.$('more').style.visibility = 'hidden';
    let i = 0;
    await new Promise<void>((resolve) => {
      const timer = window.setInterval(() => {
        i++; txt.textContent = text.slice(0, i);
        if (i % 2 === 0 && speaker) this.sound.sfx('blip');
        if (i >= text.length) { window.clearInterval(timer); this.typing = null; this.$('more').style.visibility = 'visible'; }
      }, 24);
      this.typing = { full: text, el: txt, timer };
      this.advanceResolve = resolve;
    });
  }

  private choose(opts: string[]): Promise<number> {
    const box = this.$('choices'); box.innerHTML = '';
    this.$('more').style.visibility = 'hidden';
    return new Promise((resolve) => {
      opts.forEach((o, i) => {
        const b = document.createElement('button'); b.className = 'ch'; b.innerHTML = `<span>${i + 1}</span>${esc(o)}`;
        b.onmouseenter = () => this.ui('hover');
        b.onclick = () => { this.ui('select'); box.innerHTML = ''; resolve(i); };
        box.appendChild(b);
      });
    });
  }

  private hideDialog() { this.$('dlg').hidden = true; this.speaking = null; }

  private toast(html: string, ms = 2600) {
    const t = this.$('toast'); const d = document.createElement('div'); d.className = 'tt'; d.innerHTML = html; t.appendChild(d);
    window.setTimeout(() => d.classList.add('out'), ms); window.setTimeout(() => d.remove(), ms + 500);
  }

  private async fade(color: string, inMs: number, hold: number, outMs: number) {
    const f = this.$('fade');
    f.style.transition = `opacity ${inMs}ms`; f.style.background = color; f.style.opacity = '1';
    await sleep(inMs + hold);
    f.style.transition = `opacity ${outMs}ms`; f.style.opacity = '0';
    await sleep(outMs);
  }

  private async vfx(v: string) {
    const stage = this.$('stage');
    switch (v) {
      case 'white': this.sound.sfx('white'); await this.fade('#fff', 700, 500, 900); break;
      case 'dark': this.fade('#000', 250, 600, 900); await sleep(900); break;
      case 'flash': this.flash = 1; stage.classList.add('shake'); await sleep(450); stage.classList.remove('shake'); break;
      case 'shake': stage.classList.add('shake'); await sleep(450); stage.classList.remove('shake'); break;
      case 'crack': this.flash = 1; stage.classList.add('shake'); await sleep(700); stage.classList.remove('shake'); break;
      case 'glitch': this.sound.sfx('glitch'); this.glitch = 1; stage.classList.add('glitch'); await sleep(700); stage.classList.remove('glitch'); break;
    }
  }

  /** ジェネレータ（シナリオ進行）を消費して UI に反映する */
  private async consume(gen: Gen) {
    let r = gen.next();
    while (!r.done) {
      const st: Step = r.value;
      let reply: number | undefined;
      switch (st.t) {
        case 'say': await this.say(st.s, st.text); break;
        case 'nar': await this.say(null, st.text); break;
        case 'choice': reply = await this.choose(st.opts); break;
        case 'vis': await this.vfx(st.v); break;
        case 'sfx': this.sound.sfx(st.id); break;
        case 'fact': {
          const f = factMap[st.id];
          if (f) { this.sound.sfx('chime'); this.toast(`📓 記憶に追加<b>${esc(f.title || f.text.slice(0, 16))}</b>`); }
          break;
        }
        case 'move': this.sound.sfx('move'); this.hideDialog(); this.resetWorld(this.nextSpawn); this.nextSpawn = null; this.refreshScene(); await this.fade('#000', 160, 40, 260); break;
        case 'auto': this.refreshScene(); break;
        case 'finale': this.hideDialog(); break;
        case 'dayend': this.pendingDayEnd = true; break;
        case 'end': break;
      }
      r = gen.next(reply);
    }
    this.hideDialog();
  }

  private refreshScene() { this.sound.setScene(this.s.loc, this.s.time, { blackout: this.s.flags.blackout !== undefined, light: this.s.flags.light !== undefined }); this.renderHud(); }

  /** 行動1回分：ロック→進行→終了処理 */
  private async act(make: () => Gen) {
    if (this.busy) return;
    this.busy = true;
    this.$('panel').classList.add('lock');
    try {
      await this.consume(make());
      if (this.s.over) { await this.ending(this.s.over); return; }
      if (this.pendingDayEnd) { this.pendingDayEnd = false; await this.finishDay(); return; }
      this.save();
    } finally {
      this.busy = false;
      this.$('panel').classList.remove('lock');
      if (this.inGame) this.refresh();
    }
  }

  // ───────────── HUD / パネル ─────────────
  private renderHud() {
    const s = this.s;
    this.$('hud').hidden = false;
    const hr = Math.floor(s.time / 60);
    const phase = hr < 11 ? '朝' : hr < 16 ? '昼' : hr < 19 ? '夕' : '夜';
    this.$('clock').innerHTML = `8月17日 <b>${fmt(s.time)}</b> <small>${phase}</small>`;
    const p = Math.min(1, (s.time - 480) / (1439 - 480));
    const fill = this.$('barfill'); fill.style.width = p * 100 + '%';
    this.$('hud').classList.toggle('late', s.time >= 23 * 60);
    this.$('loopno').textContent = `LOOP ${s.loop}`;
    this.$('place').textContent = locDef(s.loc).name;
    const [top] = skyAt(s.time);
    this.$('clockbox').style.setProperty('--sky', `rgb(${top.map((n) => n | 0).join(',')})`);
  }

  private refresh() {
    this.renderHud();
    this.cacheKey = '';
    this.sound.setScene(this.s.loc, this.s.time, { blackout: this.s.flags.blackout !== undefined, light: this.s.flags.light !== undefined });
    const s = this.s, panel = this.$('panel');
    panel.hidden = false;
    const lead = s.focus ? currentLead(s, s.focus) : null;
    const canTell = tellOptions(s).length > 0;
    panel.innerHTML = `
      <div class="here"><b>${esc(locDef(s.loc).name)}</b><span>${esc(locDef(s.loc).blurb)}</span></div>
      ${lead ? `<div class="lead">📌 今日の焦点：${esc(lead)}</div>` : ''}
      <div class="ctl"><kbd>WASD</kbd> / <kbd>矢印</kbd> で歩く　<kbd>E</kbd> 話す・調べる　クリックでその場所へ移動　<b>画面の端</b>から別の場所へ　光る印＝調べられる場所</div>
      <div class="acts sys">
        <button class="act tell" id="aTell" ${canTell ? '' : 'disabled'}>🗣 伝える<small>10分</small></button>
        <button class="act wt" data-w="15">⏳ 15分待つ</button>
        <button class="act sp" id="aSpeed">⏱ 時間の流れ：${TIME_SPEEDS[this.speedIdx].name}</button>
        <button class="act mv" id="aMap">🗺 地図</button>
        <button class="act hint" id="aHint">💡 ヒント</button>
      </div>`;
    panel.querySelectorAll<HTMLButtonElement>('[data-w]').forEach((b) => { b.onclick = () => { this.ui('select'); void this.act(() => waitMinutes(this.s, Number(b.dataset.w))); }; });
    panel.querySelector<HTMLElement>('#aTell')!.addEventListener('click', () => { this.ui('select'); this.openTell(); });
    panel.querySelector<HTMLElement>('#aMap')!.addEventListener('click', () => { this.ui('select'); this.openMap(); });
    panel.querySelector<HTMLElement>('#aSpeed')!.addEventListener('click', (e) => { this.ui('select'); this.speedIdx = (this.speedIdx + 1) % TIME_SPEEDS.length; (e.currentTarget as HTMLElement).textContent = `⏱ 時間の流れ：${TIME_SPEEDS[this.speedIdx].name}`; this.saveOpts(); });
    panel.querySelector<HTMLElement>('#aHint')!.addEventListener('click', () => { this.ui('select'); this.toast('💡 ' + esc(hintNow(this.s) ?? 'いまは特に手がかりがない。町を歩いてみよう。'), 5000); });
  }

  // ───────────── モーダル ─────────────
  private openModal(html: string, closable = true, cls = '') {
    const m = this.$('modal'); m.hidden = false; m.dataset.closable = closable ? '1' : '0'; m.className = cls;
    m.innerHTML = `<div class="card">${html}</div>`;
    if (closable) m.onclick = (e) => { if (e.target === m) this.closeModal(); };
    else m.onclick = null;
    return m.querySelector<HTMLElement>('.card')!;
  }
  private closeModal() { const f = this.modalClose; this.modalClose = null; const m = this.$('modal'); m.hidden = true; m.innerHTML = ''; f?.(); }

  private openMap() {
    const s = this.s, opts = travelOptions(s);
    const nodes = LOCATIONS.map((l) => {
      const o = opts.find((x) => x.id === l.id);
      if (!o && l.id !== s.loc) return '';
      return `<button class="node ${l.id === s.loc ? 'cur' : ''}" style="left:${l.x}%;top:${l.y}%" data-to="${l.id}" ${l.id === s.loc ? 'disabled' : ''}>
        <i></i><b>${esc(l.name)}</b><small>${l.id === s.loc ? '現在地' : o!.cost + '分'}</small></button>`;
    }).join('');
    const card = this.openModal(`<h2>アステル町</h2><div class="map"><div class="sea"></div>${nodes}</div><p class="dim">移動には時間がかかる。いまは ${fmt(s.time)}。</p><button class="close">閉じる</button>`);
    card.querySelector<HTMLElement>('.close')!.onclick = () => this.closeModal();
    card.querySelectorAll<HTMLButtonElement>('[data-to]').forEach((b) => b.onclick = () => {
      this.closeModal(); void this.act(() => travelTo(this.s, b.dataset.to as never));
    });
  }

  private openTell() {
    const opts = tellOptions(this.s);
    const npcs = [...new Set(opts.map((o) => o.npc))];
    const card = this.openModal(`<h2>伝える</h2><p class="dim">誰に、何を話す？ ——伝えたことは、その人の中に残る。次の日にも。</p>
      <div class="tellwrap"><div class="tl-npc">${npcs.map((n) => `<button data-n="${n}">${esc(NPCS.find((x) => x.id === n)!.name)}</button>`).join('')}</div><div class="tl-facts"><p class="dim">相手を選んでください</p></div></div>
      <button class="close">やめる</button>`);
    card.querySelector<HTMLElement>('.close')!.onclick = () => this.closeModal();
    const facts = card.querySelector<HTMLElement>('.tl-facts')!;
    card.querySelectorAll<HTMLButtonElement>('[data-n]').forEach((b) => b.onclick = () => {
      this.ui('select');
      card.querySelectorAll('[data-n]').forEach((x) => x.classList.remove('on')); b.classList.add('on');
      const n = b.dataset.n as NpcId;
      facts.innerHTML = opts.filter((o) => o.npc === n).map((o) => `<button data-f="${o.fact}" ${o.done ? 'disabled' : ''}>${esc(o.text)}${o.done ? '（伝えた）' : ''}</button>`).join('');
      facts.querySelectorAll<HTMLButtonElement>('[data-f]').forEach((fb) => fb.onclick = () => { this.closeModal(); void this.act(() => tellTo(this.s, n, fb.dataset.f!)); });
    });
  }

  private openMemory() {
    const s = this.s;
    const tabs: [string, string][] = [['time', '8月17日'], ['person', '人物'], ['place', '場所'], ['doc', '資料'], ['truth', '真実'], ['deduce', '推理'], ['record', '記録']];
    let tab = 'time';
    const picked: string[] = [];
    const card = this.openModal('', true, 'mem');
    const draw = () => {
      const known = FACT_LIST.filter((f) => s.facts[f.id] !== undefined);
      const isNew = (id: string) => s.newFacts.includes(id);
      let body = '';
      if (tab === 'time') {
        const items = known.filter((f) => f.cat === 'time').sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
        body = `<div class="tl">${items.length ? items.map((f) => `
          <div class="tli ${picked.includes(f.id) ? 'sel' : ''} ${isNew(f.id) ? 'new' : ''}" data-id="${f.id}"><time>${fmt(f.t!)}</time><b>${esc(f.who!)}</b><span>↓</span><p>${esc(f.title)}</p></div>`).join('') : '<p class="dim">まだ何も分かっていない。町を歩いて、人と話して、情報を集めよう。</p>'}</div>`;
      } else if (tab === 'person') {
        const people = NPCS.filter((n) => (s.rel[n.id] ?? 0) > 0 || n.id === 'shiori' && s.facts.girl_2340 !== undefined);
        body = `<div class="people">${people.map((n) => `<div class="pp"><b>${esc(n.name)}</b><small>${esc(n.role)}</small><span class="hearts">${'♥'.repeat(Math.min(8, s.rel[n.id] ?? 0))}${'♡'.repeat(Math.max(0, 8 - Math.min(8, s.rel[n.id] ?? 0)))}</span></div>`).join('')}</div>` + cards(known.filter((f) => f.cat === 'person' || f.cat === 'whisper'));
      } else if (tab === 'record') {
        body = `<p class="recs">集めた記憶：<b>${recCount(s)}</b> / ${RECORD_IDS.length}<br><small>町の人々の記憶。——すべて集めた時、できることがあるかもしれない。</small></p>` + cards(known.filter((f) => f.cat === 'record'));
      } else body = cards(known.filter((f) => f.cat === tab));
      function cards(list: typeof known) {
        return list.length ? `<div class="cards">${list.map((f) => `<div class="fc ${picked.includes(f.id) ? 'sel' : ''} ${isNew(f.id) ? 'new' : ''}" data-id="${f.id}"><b>${esc(f.title)}</b><p>${esc(f.text)}</p></div>`).join('')}</div>` : '<p class="dim">まだ何もない。</p>';
      }
      const connectable = picked.length === 2;
      card.innerHTML = `<h2>📓 記憶 <small>LOOP ${s.loop}</small></h2>
        <div class="tabs">${tabs.map(([k, n]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}</div>
        <div class="body">${body}</div>
        <div class="link"><span>${picked.length ? picked.map((i) => esc(factMap[i].title)).join(' ✕ ') : 'カードを2枚選んで「つなげる」と、新しい気づきがあるかもしれない。'}</span>
          <button id="lk" ${connectable ? '' : 'disabled'}>🔗 つなげる</button></div>
        <div id="lkres"></div><button class="close">閉じる</button>`;
      card.querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) => b.onclick = () => { this.ui('select'); tab = b.dataset.t!; draw(); });
      card.querySelectorAll<HTMLElement>('[data-id]').forEach((c) => c.onclick = () => {
        const id = c.dataset.id!; const i = picked.indexOf(id);
        if (i >= 0) picked.splice(i, 1); else { if (picked.length >= 2) picked.shift(); picked.push(id); }
        this.ui('hover'); draw();
      });
      card.querySelector<HTMLElement>('.close')!.onclick = () => this.closeModal();
      card.querySelector<HTMLButtonElement>('#lk')!.onclick = () => {
        const r = connect(s, picked[0], picked[1]);
        const res = card.querySelector<HTMLElement>('#lkres')!;
        if (r.fresh) {
          this.sound.sfx('chime'); this.save(); picked.length = 0; draw();
          const f = factMap[r.result!];
          card.querySelector<HTMLElement>('#lkres')!.innerHTML = `<div class="ok">💡 ${esc(r.msg)}<br><b>${esc(f.title)}</b>：${esc(f.text)}</div>`;
          if (!this.busy) this.refresh();
        } else { this.sound.sfx('glitch'); res.innerHTML = `<div class="ng">${esc(r.msg)}</div>`; }
      };
    };
    draw();
  }

  private openMenu() {
    const card = this.openModal(`<h2>メニュー</h2>
      <div class="menu">
        <button id="mSnd">${this.sound.muted ? '🔇 音：OFF' : '🔊 音：ON'}</button>
        <button id="mEasy">${this.easyStealth ? '🕵 追跡・隠れる：かんたん（自動成功）' : '🕵 追跡・隠れる：通常'}</button>
        <button id="mSkip">🌙 この周回をあきらめる（23:59へ）</button>
        <button id="mTitle">🏠 タイトルへ戻る（自動セーブ済み）</button>
      </div>
      <p class="dim small">操作：クリック / Space / Enter で台詞を進める。1〜9で選択肢。M で記憶ボード。</p>
      <button class="close">閉じる</button>`);
    card.querySelector<HTMLElement>('.close')!.onclick = () => this.closeModal();
    card.querySelector<HTMLElement>('#mSnd')!.onclick = (e) => { const m = this.sound.toggle(); (e.target as HTMLElement).textContent = m ? '🔇 音：OFF' : '🔊 音：ON'; };
    card.querySelector<HTMLElement>('#mEasy')!.onclick = (e) => { this.easyStealth = !this.easyStealth; this.saveOpts(); (e.target as HTMLElement).textContent = this.easyStealth ? '🕵 追跡・隠れる：かんたん（自動成功）' : '🕵 追跡・隠れる：通常'; };
    card.querySelector<HTMLElement>('#mSkip')!.onclick = () => { this.closeModal(); if (!this.busy) void this.act(() => waitMinutes(this.s, 24 * 60)); };
    card.querySelector<HTMLElement>('#mTitle')!.onclick = () => {
      if (this.busy) { this.toast('会話やイベントの途中では戻れません。'); return; }
      this.closeModal(); this.save(); this.showTitle();
    };
  }

  // ───────────── 周回の進行 ─────────────
  private saveOpts() { store.set(OPT_KEY, JSON.stringify({ easy: this.easyStealth, speed: this.speedIdx })); }

  private save() { if (this.inGame) store.set(SAVE_KEY, serialize(this.s)); }

  private async beginDay() {
    this.inGame = true;
    this.busy = true;
    this.resetWorld();
    this.$('panel').hidden = true;
    const s = this.s;
    this.sound.setScene(s.loc, s.time, {});
    this.renderHud();
    await this.loopCard();
    if (s.loop >= 2) await this.pickFocus();
    this.busy = false;
    await this.act(() => startDay(this.s));
    if (s.loop === 1) this.toast('🧭 町を歩いて、人と話してみよう。時間は 8:00 → 23:59。<b>移動も会話も、時間がかかる。</b>', 7000);
  }

  private async loopCard() {
    const f = this.$('fade');
    f.style.transition = 'none'; f.style.background = '#05060d'; f.style.opacity = '1';
    f.innerHTML = `<div class="loopcard"><small>${this.s.loop === 1 ? '' : 'LOOP'}</small><b>${this.s.loop === 1 ? '8月17日　8:00' : String(this.s.loop).padStart(3, '0')}</b><span>${this.s.loop === 1 ? '最後の一日' : '8月17日　8:00'}</span></div>`;
    await sleep(1700);
    f.style.transition = 'opacity 900ms'; f.style.opacity = '0';
    await sleep(900); f.innerHTML = '';
  }

  private pickFocus(): Promise<void> {
    return new Promise((resolve) => {
      const th = availableThreads(this.s);
      const card = this.openModal(`<h2>今日は、何を変える？</h2>
        <p class="dim">一つだけ、大きく行動を変えてみよう。選んだ焦点は、今日の手がかりとしてパネルに表示される。</p>
        <div class="focus">${th.map((t) => `<button data-f="${t.id}">${esc(t.name)}</button>`).join('')}<button data-f="">自由に行動する</button></div>`, false);
      card.querySelectorAll<HTMLButtonElement>('[data-f]').forEach((b) => b.onclick = () => {
        this.ui('select'); this.s.focus = b.dataset.f || null; this.closeModal();
        if (this.s.focus) this.toast('📌 ' + esc(hintNow(this.s) ?? ''), 4500);
        resolve();
      });
    });
  }

  private async finishDay() {
    const sum = nextLoop(this.s);
    this.save();
    const titles = sum.learned.map((id) => factMap[id]).filter(Boolean);
    await new Promise<void>((resolve) => {
      const card = this.openModal(`<h2>世界が、終わった。</h2>
        <p class="dim">8月17日 23:59 → 8月17日 8:00</p>
        <h3>この周回で得たもの</h3>
        <ul class="gain">${titles.length ? titles.map((f) => `<li>${f.cat === 'whisper' ? '🗨 ' : '📓 '}<b>${esc(f.title)}</b><br><small>${esc(f.text)}</small></li>`).join('') : '<li>——</li>'}</ul>
        ${sum.whisper ? '<p class="dim">何も掴めなかった一日にも、誰かが、そっと手がかりを残してくれていた。</p>' : ''}
        <button class="primary" id="nx">8:00へ戻る</button>`, false);
      card.querySelector<HTMLElement>('#nx')!.onclick = () => { this.ui('select'); this.closeModal(); resolve(); };
    });
    this.busy = false;
    await this.beginDay();
  }

  // ───────────── エンディング ─────────────
  private async ending(id: string) {
    const def = ENDINGS[id];
    this.$('panel').hidden = true;
    this.sound.sfx('ending');
    await this.consume(run(this.s, def.epilogue));
    if (!this.seenEndings.includes(id)) { this.seenEndings.push(id); store.set(END_KEY, JSON.stringify(this.seenEndings)); }
    await this.fade('#000', 1200, 600, 0);
    this.$('fade').style.opacity = '1';
    this.$('fade').innerHTML = `<div class="endcard"><h1>${esc(def.title)}</h1><p>${esc(def.sub)}</p>
      <div class="roll">${def.credits.map((l) => `<div>${esc(l) || '&nbsp;'}</div>`).join('')}</div>
      <button id="bk">タイトルへ</button></div>`;
    await new Promise<void>((res) => { this.$('bk').onclick = () => res(); });
    this.$('fade').innerHTML = ''; this.$('fade').style.opacity = '0';
    // 到達後も、次の周回から続きを遊べる
    this.s.over = null; nextLoop(this.s); this.busy = false;
    this.save(); this.showTitle();
  }

  // ───────────── タイトル ─────────────
  private showTitle() {
    this.inGame = false; this.busy = false;
    this.hideDialog(); this.closeModal();
    this.$('hud').hidden = true; this.$('panel').hidden = true;
    const has = !!deserialize(store.get(SAVE_KEY) ?? '');
    const names = [['end_last', 'END 1'], ['end_eternal', 'END 2'], ['end_record', 'END 3'], ['end_tomorrow', 'TRUE END']];
    const m = this.$('modal'); m.hidden = false; m.dataset.closable = '0'; m.className = 'title'; m.onclick = null;
    m.innerHTML = `<div class="titlebox">
      <small>2D探索アドベンチャー × タイムループ × ミステリー</small>
      <h1>最後の一日</h1>
      <p class="sub">8月17日　8:00　——また、朝が来る。</p>
      <div class="tbtns">
        <button class="primary" id="tNew">はじめから</button>
        ${has ? '<button id="tCont">つづきから</button>' : ''}
        <button id="tSnd">${this.sound.muted ? '🔇 音：OFF' : '🔊 音：ON'}</button>
      </div>
      <div class="ends">${names.map(([k, n]) => `<span class="${this.seenEndings.includes(k) ? 'got' : ''}">${this.seenEndings.includes(k) ? ENDINGS[k].title.replace(/^[A-Z ]*\d?　?/, '') || n : '？？？'}<i>${n}</i></span>`).join('')}</div>
      <p class="hint">クリックで音が始まります（ヘッドホン推奨）</p></div>`;
    this.$('tNew').onclick = () => {
      this.sound.init(); this.ui('select');
      if (has && !confirm('セーブデータを消して、最初からはじめますか？')) return;
      this.s = newState(); this.closeModal(); void this.beginDay();
    };
    store.get(SAVE_KEY) && this.root.querySelector<HTMLElement>('#tCont')?.addEventListener('click', () => {
      this.sound.init(); this.ui('select');
      this.s = deserialize(store.get(SAVE_KEY)!)!; this.closeModal();
      if (this.s.time === 480 && !this.s.seenNow.wake) void this.beginDay();
      else { this.inGame = true; this.resetWorld(); this.refresh(); }
    });
    this.$('tSnd').onclick = (e) => { this.sound.init(); const mu = this.sound.toggle(); (e.target as HTMLElement).textContent = mu ? '🔇 音：OFF' : '🔊 音：ON'; };
  }
}

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
