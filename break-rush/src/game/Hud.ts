import { Game, STAGE_NAMES } from './Game';
import { formatTime, Rank, STAGES } from './Progress';
import { Combat } from './Combat';

export interface ResultView {
  name: string;
  time: number;
  deaths: number;
  kills: number;
  totalEnemies: number;
  par: number;
  rank: Rank;
  newBest: boolean;
  best: number;
  next: boolean;
}

const RANK_COLOR: Record<Rank, string> = { S: '#ffe14a', A: '#45ff9a', B: '#22e6ff', C: '#a0a8c8' };

/** DOM overlay: menus, HUD, toasts. Pure presentation; reads game state, calls Game methods. */
export class Hud {
  private el: HTMLDivElement;
  private title!: HTMLDivElement;
  private play!: HTMLDivElement;
  private pauseEl!: HTMLDivElement;
  private results!: HTMLDivElement;
  private timeEl!: HTMLElement;
  private parEl!: HTMLElement;
  private infoEl!: HTMLElement;
  private dashEl!: HTMLElement;
  private deflectEl!: HTMLElement;
  private focusEl!: HTMLElement;
  private starEl!: HTMLElement;
  private heartsEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private flashEl!: HTMLElement;
  private speedEl!: HTMLElement;
  private targetEl!: HTMLElement;
  private promptEl!: HTMLElement;
  private toastLeft = 0;
  private flashLeft = 0;
  private cache = new Map<string, string>();

  constructor(root: HTMLElement, private game: Game) {
    this.el = document.createElement('div');
    this.el.id = 'hud';
    this.el.innerHTML = `
      <div id="speedlines"></div>
      <div id="flash"></div>
      <div id="play" class="layer hidden">
        <div class="tl"><div id="time">0:00.00</div><div id="par"></div></div>
        <div class="tr"><div id="info"></div></div>
        <div class="cross"></div>
        <div id="target"></div>
        <div id="toast"></div>
        <div class="bottom">
          <div class="chip" id="dash"><b>DASH</b><i></i></div>
          <div class="chip" id="deflect"><b>DEFLECT</b><i></i></div>
          <div class="chip" id="star"><b>STAR</b><i></i></div>
          <div class="chip" id="focus"><b>FOCUS</b><i></i></div>
          <div class="chip hearts" id="hearts"></div>
        </div>
        <div id="prompt"></div>
      </div>
      <div id="title" class="layer panel hidden"></div>
      <div id="pause" class="layer panel hidden"></div>
      <div id="results" class="layer panel hidden"></div>`;
    root.appendChild(this.el);
    const q = <T extends HTMLElement>(s: string) => this.el.querySelector(s) as T;
    this.title = q('#title');
    this.play = q('#play');
    this.pauseEl = q('#pause');
    this.results = q('#results');
    this.timeEl = q('#time');
    this.parEl = q('#par');
    this.infoEl = q('#info');
    this.dashEl = q('#dash');
    this.deflectEl = q('#deflect');
    this.focusEl = q('#focus');
    this.starEl = q('#star');
    this.heartsEl = q('#hearts');
    this.toastEl = q('#toast');
    this.flashEl = q('#flash');
    this.speedEl = q('#speedlines');
    this.targetEl = q('#target');
    this.promptEl = q('#prompt');
  }

  private set(el: HTMLElement, key: string, v: string, html = false): void {
    if (this.cache.get(key) === v) return;
    this.cache.set(key, v);
    if (html) el.innerHTML = v;
    else el.textContent = v;
  }

  private hideAll(): void {
    for (const e of [this.title, this.play, this.pauseEl, this.results]) e.classList.add('hidden');
  }

  // ---- screens --------------------------------------------------------------------------

  showTitle(): void {
    this.hideAll();
    const g = this.game;
    const s = g.save;
    const rows = [];
    for (let i = 1; i <= STAGES; i++) {
      const rec = s.records[`s${i}`];
      const locked = i > s.unlocked;
      rows.push(`<button class="stage ${locked ? 'locked' : ''}" data-stage="${i}" ${locked ? 'disabled' : ''}>
        <span class="n">${i}</span><span class="nm">${STAGE_NAMES[i - 1]}</span>
        <span class="rec">${locked ? 'LOCKED' : rec ? `<em style="color:${RANK_COLOR[rec.bestRank]}">${rec.bestRank}</em> ${formatTime(rec.bestTime)}` : '—'}</span></button>`);
    }
    this.title.innerHTML = `
      <div class="logo">BREAK<span>RUSH</span></div>
      <div class="sub">PARKOUR · BLADE · ONE HIT</div>
      <div class="stages">${rows.join('')}</div>
      <div class="row"><button id="daily" class="big">DAILY RUN</button></div>
      <div class="opts">
        <label><input type="checkbox" id="assist" ${s.assist ? 'checked' : ''}> ASSIST (3 hits)</label>
        <label>LOOK <input type="range" id="sens" min="0.4" max="2.5" step="0.05" value="${s.sens}"></label>
        <label>VOL <input type="range" id="vol" min="0" max="1" step="0.05" value="${s.volume}"></label>
      </div>
      <div class="keys">
        <b>WASD</b> move · <b>SPACE</b> jump (hold higher) · <b>SHIFT</b> air dash · <b>CTRL/C</b> slide<br>
        <b>L-CLICK</b> slash &amp; lunge · <b>R-CLICK</b> deflect bullets · <b>E</b> throw star · <b>Q</b> focus slow-mo · <b>R</b> retry checkpoint<br>
        Run into an <i class="o">orange-striped wall</i> mid-air to wall-run, jump to leap off. Green pads launch you. Shield guards: get behind them. Gamepad supported.
      </div>`;
    this.title.classList.remove('hidden');
    this.bindTitle();
  }

  private bindTitle(): void {
    const g = this.game;
    this.title.querySelectorAll<HTMLButtonElement>('.stage').forEach((b) => {
      b.onclick = () => g.startStage(Number(b.dataset.stage));
    });
    (this.title.querySelector('#daily') as HTMLButtonElement).onclick = () => g.startDaily();
    (this.title.querySelector('#assist') as HTMLInputElement).onchange = (e) => g.setAssist((e.target as HTMLInputElement).checked);
    (this.title.querySelector('#sens') as HTMLInputElement).oninput = (e) => g.setSens(Number((e.target as HTMLInputElement).value));
    (this.title.querySelector('#vol') as HTMLInputElement).oninput = (e) => g.setVolume(Number((e.target as HTMLInputElement).value));
  }

  showPlay(name: string): void {
    this.hideAll();
    this.play.classList.remove('hidden');
    this.cache.clear();
    void name;
  }

  showPause(): void {
    this.hideAll();
    this.play.classList.remove('hidden');
    this.pauseEl.innerHTML = `
      <div class="logo small">PAUSED</div>
      <div class="col">
        <button id="p-resume" class="big">RESUME</button>
        <button id="p-retry">RESTART STAGE</button>
        <button id="p-menu">QUIT TO MENU</button>
      </div>
      <div class="opts">
        <label>LOOK <input type="range" id="sens2" min="0.4" max="2.5" step="0.05" value="${this.game.save.sens}"></label>
        <label>VOL <input type="range" id="vol2" min="0" max="1" step="0.05" value="${this.game.save.volume}"></label>
      </div>`;
    this.pauseEl.classList.remove('hidden');
    const g = this.game;
    (this.pauseEl.querySelector('#p-resume') as HTMLElement).onclick = () => g.resume();
    (this.pauseEl.querySelector('#p-retry') as HTMLElement).onclick = () => g.retry();
    (this.pauseEl.querySelector('#p-menu') as HTMLElement).onclick = () => g.toMenu();
    (this.pauseEl.querySelector('#sens2') as HTMLInputElement).oninput = (e) => g.setSens(Number((e.target as HTMLInputElement).value));
    (this.pauseEl.querySelector('#vol2') as HTMLInputElement).oninput = (e) => g.setVolume(Number((e.target as HTMLInputElement).value));
  }

  showResults(r: ResultView): void {
    this.hideAll();
    this.results.innerHTML = `
      <div class="sub">${r.name} — CLEAR</div>
      <div class="rank" style="color:${RANK_COLOR[r.rank]}">${r.rank}</div>
      <div class="stats">
        <div><span>TIME</span><b>${formatTime(r.time)}</b>${r.newBest ? '<em class="nb">NEW BEST</em>' : `<small>best ${formatTime(r.best)}</small>`}</div>
        <div><span>PAR</span><b>${formatTime(r.par)}</b></div>
        <div><span>DEATHS</span><b>${r.deaths}</b></div>
        <div><span>KILLS</span><b>${r.kills}/${r.totalEnemies}</b></div>
      </div>
      <div class="row">
        ${r.next ? '<button id="r-next" class="big">NEXT STAGE</button>' : ''}
        <button id="r-retry">RETRY</button>
        <button id="r-menu">MENU</button>
      </div>`;
    this.results.classList.remove('hidden');
    const g = this.game;
    (this.results.querySelector('#r-next') as HTMLElement | null)?.addEventListener('click', () => g.nextStage());
    (this.results.querySelector('#r-retry') as HTMLElement).onclick = () => g.retry();
    (this.results.querySelector('#r-menu') as HTMLElement).onclick = () => g.toMenu();
  }

  toast(text: string, seconds = 1): void {
    if (!text) return;
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('pop');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('pop');
    this.toastLeft = seconds;
  }

  flash(kind: 'hit' | 'death' | 'respawn'): void {
    this.flashEl.className = kind;
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('go');
    this.flashLeft = 0.6;
  }

  // ---- per frame ----------------------------------------------------------------------------

  update(g: Game, dt: number): void {
    if (this.toastLeft > 0) {
      this.toastLeft -= dt;
      if (this.toastLeft <= 0) this.toastEl.classList.remove('pop');
    }
    if (g.mode === 'title') return;
    this.set(this.timeEl, 't', formatTime(g.time));
    this.set(this.parEl, 'par', `PAR ${formatTime(g.level.parTime)}`);
    const total = g.combat.enemies.length;
    this.set(this.infoEl, 'info', `${g.run.name}<br>ENEMIES ${total - g.combat.aliveCount}/${total} · DEATHS ${g.deaths}`, true);
    const c = g.ctrl;
    this.dashEl.classList.toggle('ready', c.onGround || c.dashCharges > 0);
    const dcd = g.combatDeflectCd();
    this.deflectEl.classList.toggle('ready', dcd <= 0);
    (this.deflectEl.querySelector('i') as HTMLElement).style.width = `${Math.round((1 - Math.min(1, dcd / 0.5)) * 100)}%`;
    (this.focusEl.querySelector('i') as HTMLElement).style.width = `${Math.round(g.focus * 100)}%`;
    this.focusEl.classList.toggle('active', g.focusing);
    this.starEl.classList.toggle('ready', g.stars > 0);
    this.set(this.starEl.querySelector('b') as HTMLElement, 'stars', `STAR ${'●'.repeat(g.stars)}${'○'.repeat(3 - g.stars)}`);
    if (g.maxHearts > 1) {
      let h = '';
      for (let i = 0; i < g.maxHearts; i++) h += i < g.hearts ? '♥' : '♡';
      this.set(this.heartsEl, 'hearts', h);
      this.heartsEl.style.display = '';
    } else this.heartsEl.style.display = 'none';
    // speed lines
    const sp = Math.max(0, Math.min(1, (c.speed - 11) / 14));
    this.speedEl.style.opacity = String(sp * 0.8);
    // lock-on marker on the enemy a lunge would hit
    const t = this.pickMarker(g);
    if (t) {
      const s = g.view.projectToScreen(t.x, t.y + 1.1, t.z);
      this.targetEl.style.display = s.visible ? 'block' : 'none';
      this.targetEl.style.transform = `translate(${s.x}px, ${s.y}px)`;
    } else this.targetEl.style.display = 'none';
    // prompt: pad hint
    const hint = g.mode === 'play' && !g.input.locked && !g.input.padActive ? 'Click the game to capture the mouse (Esc to release)' : '';
    this.set(this.promptEl, 'prompt', hint);
    if (this.flashLeft > 0) this.flashLeft -= dt;
  }

  private pickMarker(g: Game): { x: number; y: number; z: number } | null {
    if (g.mode !== 'play' || g.dead) return null;
    const co: Combat = g.combat;
    const c = g.ctrl;
    const t = co.pickTarget({ x: c.x, y: c.y, z: c.z, vx: 0, vz: 0, height: c.height }, Math.cos(g.yaw), Math.sin(g.yaw));
    return t ? { x: t.x, y: t.y, z: t.z } : null;
  }
}
