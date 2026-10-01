// UIコントローラ。ロジック(engine/)は呼び出すだけで、ゲーム規則はここに書かない。
import { ENDINGS } from '../data/endings';
import { EVENTS } from '../data';
import { FACT_LIST, RECORD_IDS, factMap } from '../data/facts';
import { LOCATIONS, NPCS, loc as locDef } from '../data/world';
import { availableEvents, availableThreads, connect, currentLead, hintNow, presentNpcs, tellOptions, travelOptions } from '../engine/logic';
import { run } from '../engine/runner';
import { playEvent, startDay, tellTo, travelTo, waitMinutes, type Gen } from '../engine/session';
import { deserialize, newState, nextLoop, recCount, serialize } from '../engine/state';
import type { GameState, NpcId, Step } from '../engine/types';
import { Sound } from './audio';
import { H, W, drawScene, skyAt, speakerLook, type SceneInfo } from './render';

const SAVE_KEY = 'last-day-save-v1';
const END_KEY = 'last-day-endings-v1';

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
const ICON: Record<string, string> = { talk: '💬', look: '🔍' };

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

  constructor(root: HTMLElement) {
    this.root = root;
    try { this.seenEndings = JSON.parse(store.get(END_KEY) ?? '[]'); } catch { this.seenEndings = []; }
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
    this.$('bMem').addEventListener('click', () => { this.ui('select'); this.openMemory(); });
    this.$('bMenu').addEventListener('click', () => { this.ui('select'); this.openMenu(); });
  }

  private bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') { if (!this.$('dlg').hidden && !this.$('choices').childElementCount) { e.preventDefault(); this.onAdvance(); } }
      if (/^[1-9]$/.test(e.key)) { const b = this.$('choices').children[Number(e.key) - 1] as HTMLElement | undefined; b?.click(); }
      if (e.key === 'Escape' && !this.$('modal').hidden && this.$('modal').dataset.closable === '1') this.closeModal();
      if ((e.key === 'm' || e.key === 'M') && this.inGame && !this.busy && this.$('modal').hidden) this.openMemory();
    });
  }

  private ui(id: string) { this.sound.sfx(id); }

  // ───────────── 描画ループ ─────────────
  private info(): SceneInfo {
    const s = this.s;
    const title = !this.inGame;
    return {
      loc: title ? 'beach' : s.loc,
      time: title ? 1100 + Math.sin(this.tick / 400) * 60 : s.time,
      blackout: !title && s.flags.blackout !== undefined,
      light: title ? false : s.flags.light !== undefined,
      crack: !title && s.flags.crack !== undefined,
      npcs: title ? [] : presentNpcs(s),
      speaking: this.speaking, tick: this.tick, loop: s.loop,
      flash: this.flash, glitch: Math.max(this.glitch, this.inGame ? Math.min(0.5, (s.loop - 1) / 40) : 0),
      hero: !title,
    };
  }

  private frame = () => {
    this.tick++;
    this.flash = Math.max(0, this.flash - 0.03);
    this.glitch = Math.max(0, this.glitch - 0.02);
    drawScene(this.ctx, this.info());
    requestAnimationFrame(this.frame);
  };

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
        case 'move': this.sound.sfx('move'); this.hideDialog(); this.refreshScene(); await this.fade('#000', 160, 40, 260); break;
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
    this.sound.setScene(this.s.loc, this.s.time, { blackout: this.s.flags.blackout !== undefined, light: this.s.flags.light !== undefined });
    const s = this.s, panel = this.$('panel');
    panel.hidden = false;
    const evs = availableEvents(s);
    const here = presentNpcs(s).filter((n) => n !== 'shiori' || s.time >= 23 * 60 + 40);
    const chips = here.map((n) => `<span class="chip">${esc(NPCS.find((x) => x.id === n)!.name)}</span>`).join('');
    const mk = (kind: 'talk' | 'look') => evs.filter((e) => e.kind === kind).map((e) => {
      const who = e.npc ? NPCS.find((n) => n.id === e.npc)!.name : '';
      return `<button class="act ${kind}" data-ev="${e.id}">${ICON[kind]} ${who && !e.label.includes(who) ? `<em>${esc(who)}</em> ` : ''}${esc(e.label)}<small>${e.cost}分</small></button>`;
    }).join('');
    const lead = s.focus ? currentLead(s, s.focus) : null;
    const canTell = tellOptions(s).length > 0;
    panel.innerHTML = `
      <div class="here"><b>${esc(locDef(s.loc).name)}</b><span>${esc(locDef(s.loc).blurb)}</span></div>
      ${lead ? `<div class="lead">📌 今日の焦点：${esc(lead)}</div>` : ''}
      <div class="who">${chips ? '居合わせている人：' + chips : '<span class="dim">周りには、誰もいない。</span>'}</div>
      <div class="acts">${mk('talk')}${mk('look')}
        ${canTell ? '<button class="act tell" id="aTell">🗣 伝える<small>10分</small></button>' : ''}
      </div>
      <div class="acts sys">
        <button class="act mv" id="aMap">🗺 移動する</button>
        <button class="act wt" data-w="15">⏳ 15分待つ</button>
        <button class="act wt" data-w="60">⏳ 1時間待つ</button>
        <button class="act hint" id="aHint">💡 ヒント</button>
      </div>`;
    panel.querySelectorAll<HTMLButtonElement>('[data-ev]').forEach((b) => {
      b.onmouseenter = () => this.ui('hover');
      b.onclick = () => { this.ui('select'); const ev = EVENTS.find((e) => e.id === b.dataset.ev)!; void this.act(() => playEvent(this.s, ev)); };
    });
    panel.querySelectorAll<HTMLButtonElement>('[data-w]').forEach((b) => { b.onclick = () => { this.ui('select'); void this.act(() => waitMinutes(this.s, Number(b.dataset.w))); }; });
    panel.querySelector<HTMLElement>('#aTell')?.addEventListener('click', () => { this.ui('select'); this.openTell(); });
    panel.querySelector<HTMLElement>('#aMap')!.addEventListener('click', () => { this.ui('select'); this.openMap(); });
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
  private closeModal() { const m = this.$('modal'); m.hidden = true; m.innerHTML = ''; }

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
        <button id="mSkip">🌙 この周回をあきらめる（23:59へ）</button>
        <button id="mTitle">🏠 タイトルへ戻る（自動セーブ済み）</button>
      </div>
      <p class="dim small">操作：クリック / Space / Enter で台詞を進める。1〜9で選択肢。M で記憶ボード。</p>
      <button class="close">閉じる</button>`);
    card.querySelector<HTMLElement>('.close')!.onclick = () => this.closeModal();
    card.querySelector<HTMLElement>('#mSnd')!.onclick = (e) => { const m = this.sound.toggle(); (e.target as HTMLElement).textContent = m ? '🔇 音：OFF' : '🔊 音：ON'; };
    card.querySelector<HTMLElement>('#mSkip')!.onclick = () => { this.closeModal(); if (!this.busy) void this.act(() => waitMinutes(this.s, 24 * 60)); };
    card.querySelector<HTMLElement>('#mTitle')!.onclick = () => {
      if (this.busy) { this.toast('会話やイベントの途中では戻れません。'); return; }
      this.closeModal(); this.save(); this.showTitle();
    };
  }

  // ───────────── 周回の進行 ─────────────
  private save() { if (this.inGame) store.set(SAVE_KEY, serialize(this.s)); }

  private async beginDay() {
    this.inGame = true;
    this.busy = true;
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
      else { this.inGame = true; this.refresh(); }
    });
    this.$('tSnd').onclick = (e) => { this.sound.init(); const mu = this.sound.toggle(); (e.target as HTMLElement).textContent = mu ? '🔇 音：OFF' : '🔊 音：ON'; };
  }
}

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
