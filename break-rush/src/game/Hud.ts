import { PERKS } from '../brawl/perks';
import { STYLE_RANKS, STYLE_WORDS } from '../brawl/data';
import { STAGES } from '../brawl/stages';
import { Game } from './Game';
import { formatTime, Rank, STAGE_COUNT } from './Progress';

export interface ResultView {
  name: string;
  endless: boolean;
  wave: number;
  score: number;
  rank: Rank;
  time: number;
  maxCombo: number;
  damage: number;
  kills: number;
  par: number;
  newBest: boolean;
  best: number;
  next: boolean;
}

const RANK_COLOR: Record<Rank, string> = { S: '#ffd24a', A: '#7fe08a', B: '#7fb8ff', C: '#b0b4bc' };
const ICON_CLASS = { blue: 'ib', red: 'ir', yellow: 'iy' } as const;

interface Floater { el: HTMLElement; x: number; y: number; z: number; life: number }
interface EnemyEl { root: HTMLElement; bar: HTMLElement; ico: HTMLElement; arrow: HTMLElement }

/** DOM overlay: menus, HUD, enemy markers, floating numbers. Reads game state, calls Game methods. */
export class Hud {
  private el: HTMLDivElement;
  private title!: HTMLDivElement;
  private play!: HTMLDivElement;
  private pauseEl!: HTMLDivElement;
  private koEl!: HTMLDivElement;
  private results!: HTMLDivElement;
  private hpFill!: HTMLElement;
  private hpText!: HTMLElement;
  private meterFill!: HTMLElement;
  private meterBox!: HTMLElement;
  private weaponEl!: HTMLElement;
  private scoreEl!: HTMLElement;
  private waveEl!: HTMLElement;
  private comboEl!: HTMLElement;
  private comboBar!: HTMLElement;
  private toastEl!: HTMLElement;
  private hintEl!: HTMLElement;
  private perksEl!: HTMLElement;
  private styleEl!: HTMLElement;
  private speedEl!: HTMLElement;
  private flashEl!: HTMLElement;
  private markers!: HTMLElement;
  private floaters: Floater[] = [];
  private enemyEls = new Map<number, EnemyEl>();
  private toastLeft = 0;
  private hintLeft = 0;
  private cache = new Map<string, string>();

  constructor(root: HTMLElement, private game: Game) {
    this.el = document.createElement('div');
    this.el.id = 'hud';
    this.el.innerHTML = `
      <div id="flash"></div>
      <div id="speedlines"></div>
      <div id="play" class="layer hidden">
        <div id="markers"></div>
        <div class="hpbox"><div class="lbl">HEALTH</div><div class="bar hp"><i id="hpfill"></i><b id="hptext"></b></div>
          <div class="bar rush" id="meterbox"><i id="meterfill"></i><b>RUSH <u>R</u></b></div><div id="weapon"></div></div>
        <div class="scorebox"><div id="score">0</div><div id="wave"></div></div>
        <div class="combo" id="combo"><span class="n"></span><span class="t"></span><div class="cb"><i id="combobar"></i></div></div>
        <div id="toast"></div>
        <div id="hint"></div>
        <div id="perks" class="hidden"></div>
        <div class="style" id="style"><div class="sl">D</div><div class="sw"></div><div class="sb"><i></i></div></div>
        <div class="cross"></div>
      </div>
      <div id="title" class="layer panel hidden"></div>
      <div id="pause" class="layer panel hidden"></div>
      <div id="ko" class="layer panel hidden"></div>
      <div id="results" class="layer panel hidden"></div>`;
    root.appendChild(this.el);
    const q = <T extends HTMLElement>(s: string) => this.el.querySelector(s) as T;
    this.title = q('#title');
    this.play = q('#play');
    this.pauseEl = q('#pause');
    this.koEl = q('#ko');
    this.results = q('#results');
    this.hpFill = q('#hpfill');
    this.hpText = q('#hptext');
    this.meterFill = q('#meterfill');
    this.meterBox = q('#meterbox');
    this.weaponEl = q('#weapon');
    this.scoreEl = q('#score');
    this.waveEl = q('#wave');
    this.comboEl = q('#combo');
    this.comboBar = q('#combobar');
    this.toastEl = q('#toast');
    this.hintEl = q('#hint');
    this.perksEl = q('#perks');
    this.styleEl = q('#style');
    this.speedEl = q('#speedlines');
    this.flashEl = q('#flash');
    this.markers = q('#markers');
  }

  private hideAll(): void {
    for (const e of [this.title, this.play, this.pauseEl, this.koEl, this.results]) e.classList.add('hidden');
  }

  // ---- screens ----------------------------------------------------------------------------

  showTitle(): void {
    this.hideAll();
    const s = this.game.save;
    const rows: string[] = [];
    for (let i = 1; i <= STAGE_COUNT; i++) {
      const rec = s.records[`s${i}`];
      const locked = i > s.unlocked;
      rows.push(`<button class="stage ${locked ? 'locked' : ''}" data-stage="${i}" ${locked ? 'disabled' : ''}>
        <span class="n">${i}</span><span class="nm">${STAGES[i - 1].name}<small>${STAGES[i - 1].blurb}</small></span>
        <span class="rec">${locked ? 'LOCKED' : rec ? `<em style="color:${RANK_COLOR[rec.bestRank]}">${rec.bestRank}</em> ${rec.bestScore.toLocaleString()}` : '—'}</span></button>`);
    }
    this.title.innerHTML = `
      <div class="logo">BREAK<span>RUSH</span></div>
      <div class="sub">STREET FIGHT</div>
      <div class="stages">${rows.join('')}
        <button class="stage" id="endless"><span class="n">∞</span><span class="nm">ENDLESS<small>何波まで耐えられる？</small></span><span class="rec">${s.endlessBest ? s.endlessBest.toLocaleString() : '—'}</span></button>
      </div>
      <div class="opts">
        <label><input type="checkbox" id="assist" ${s.assist ? 'checked' : ''}> ASSIST (敵のダメージ −45%)</label>
        <label>LOOK <input type="range" id="sens" min="0.4" max="2.5" step="0.05" value="${s.sens}"></label>
        <label>VOL <input type="range" id="vol" min="0" max="1" step="0.05" value="${s.volume}"></label>
      </div>
      <div class="keys">
        <b>WASD</b> 移動（走り続けると加速）· <b>MOUSE</b> カメラ · <b>左クリック</b> 攻撃（4連コンボ・自動で敵へ踏み込む） · <b>E</b> 強攻撃<br>
        <b>右クリック / Shift</b> ガード（押しっぱなしで構え続け、離せば即解除）— 敵の<i class="bl">青いリング</i>の直前に押すとカウンター · <b>Shift</b> 回避ローリング — <i class="rd">赤い攻撃</i>はこれだけ。<b>Space</b> ジャンプ（2段ジャンプ、空中で Shift = 空中ダッシュ×2）。走り続けるとどんどん加速、遠くの敵は攻撃で一気に飛びかかる。<b>攻撃の直前ギリギリ</b>に回避すると<b>ジャストドッジ</b>で敵がスロー<br>
        <b>F</b> 掴んで投げる · <b>Q</b> 武器を拾う · <b>G</b> 銃を撃つ／武器を投げる · <b>R</b> RUSH（ゲージ満タン）<br>強攻撃で<b>打ち上げ</b>→自分も飛び上がり<b>空中コンボ</b>（攻撃連打・Shiftで空中ダッシュ・強攻撃で叩きつけ）。技を使い分けると<b>スタイルランク</b>(D〜SSS)が上がって得点倍率UP · 倒れた弱い敵に強攻撃で<b>フィニッシュ</b> · 赤い樽は爆発 · ゲームパッド対応
      </div>`;
    this.title.classList.remove('hidden');
    const g = this.game;
    this.title.querySelectorAll<HTMLButtonElement>('.stage[data-stage]').forEach((b) => { b.onclick = () => g.startStage(Number(b.dataset.stage)); });
    (this.title.querySelector('#endless') as HTMLElement).onclick = () => g.startEndless();
    (this.title.querySelector('#assist') as HTMLInputElement).onchange = (e) => g.setAssist((e.target as HTMLInputElement).checked);
    (this.title.querySelector('#sens') as HTMLInputElement).oninput = (e) => g.setSens(Number((e.target as HTMLInputElement).value));
    (this.title.querySelector('#vol') as HTMLInputElement).oninput = (e) => g.setVolume(Number((e.target as HTMLInputElement).value));
  }

  showPlay(): void {
    this.hideAll();
    this.play.classList.remove('hidden');
    this.cache.clear();
  }

  showPause(): void {
    this.hideAll();
    this.play.classList.remove('hidden');
    const g = this.game;
    this.pauseEl.innerHTML = `
      <div class="logo small">PAUSED</div>
      <div class="col"><button id="p-resume" class="big">RESUME</button><button id="p-retry">RESTART STAGE</button><button id="p-menu">QUIT TO MENU</button></div>
      <div class="opts">
        <label>LOOK <input type="range" id="sens2" min="0.4" max="2.5" step="0.05" value="${g.save.sens}"></label>
        <label>VOL <input type="range" id="vol2" min="0" max="1" step="0.05" value="${g.save.volume}"></label>
      </div>`;
    this.pauseEl.classList.remove('hidden');
    (this.pauseEl.querySelector('#p-resume') as HTMLElement).onclick = () => g.resume();
    (this.pauseEl.querySelector('#p-retry') as HTMLElement).onclick = () => g.retry();
    (this.pauseEl.querySelector('#p-menu') as HTMLElement).onclick = () => g.toMenu();
    (this.pauseEl.querySelector('#sens2') as HTMLInputElement).oninput = (e) => g.setSens(Number((e.target as HTMLInputElement).value));
    (this.pauseEl.querySelector('#vol2') as HTMLInputElement).oninput = (e) => g.setVolume(Number((e.target as HTMLInputElement).value));
  }

  showKO(): void {
    this.hideAll();
    this.play.classList.remove('hidden');
    const g = this.game;
    this.koEl.innerHTML = `<div class="ko">K.O.</div><div class="col"><button id="k-wave" class="big">RETRY WAVE</button><button id="k-stage">RESTART STAGE</button><button id="k-menu">MENU</button></div>`;
    this.koEl.classList.remove('hidden');
    (this.koEl.querySelector('#k-wave') as HTMLElement).onclick = () => g.retryWave();
    (this.koEl.querySelector('#k-stage') as HTMLElement).onclick = () => g.retry();
    (this.koEl.querySelector('#k-menu') as HTMLElement).onclick = () => g.toMenu();
  }

  showResults(r: ResultView): void {
    this.hideAll();
    const g = this.game;
    this.results.innerHTML = `
      <div class="sub">${r.name} — ${r.endless ? `WAVE ${r.wave}` : 'CLEAR'}</div>
      ${r.endless ? '' : `<div class="rank" style="color:${RANK_COLOR[r.rank]}">${r.rank}</div>`}
      <div class="bigscore">${r.score.toLocaleString()}</div>
      ${r.newBest ? '<em class="nb">NEW BEST</em>' : `<small class="bestline">best ${r.best.toLocaleString()}</small>`}
      <div class="stats">
        <div><span>TIME</span><b>${formatTime(r.time)}</b></div>
        <div><span>MAX COMBO</span><b>${r.maxCombo}</b></div>
        <div><span>DAMAGE</span><b>${r.damage}</b></div>
        <div><span>KO</span><b>${r.kills}</b></div>
      </div>
      <div class="row">${r.next ? '<button id="r-next" class="big">NEXT STAGE</button>' : ''}<button id="r-retry">RETRY</button><button id="r-menu">MENU</button></div>`;
    this.results.classList.remove('hidden');
    (this.results.querySelector('#r-next') as HTMLElement | null)?.addEventListener('click', () => g.nextStage());
    (this.results.querySelector('#r-retry') as HTMLElement).onclick = () => g.retry();
    (this.results.querySelector('#r-menu') as HTMLElement).onclick = () => g.toMenu();
  }

  showPerks(ids: string[]): void {
    const g = this.game;
    this.perksEl.innerHTML = '<div class="ph">CHOOSE A PERK</div><div class="pcards">' + ids.map((id, i) => {
      const pk = PERKS.find((q) => q.id === id)!;
      return `<button class="pcard" data-id="${id}"><b>${i + 1}</b><span class="pn">${pk.name}</span><span class="pd">${pk.desc}</span></button>`;
    }).join('') + '</div>';
    this.perksEl.classList.remove('hidden');
    this.perksEl.querySelectorAll<HTMLButtonElement>('.pcard').forEach((b) => { b.onclick = () => g.choosePerk(b.dataset.id); });
  }

  rankChanged(n: number, up: boolean): void {
    const l = this.styleEl.querySelector('.sl') as HTMLElement;
    l.className = `sl r${n}`;
    void l.offsetWidth;
    l.classList.add(up ? 'up' : 'down');
  }

  setSpeed(k: number): void {
    this.speedEl.style.opacity = String(k * 0.85);
  }

  hidePerks(): void {
    this.perksEl.classList.add('hidden');
  }

  toast(text: string, seconds = 1, kind: 'white' | 'blue' | 'red' | 'yellow' = 'white'): void {
    if (!text) return;
    this.toastEl.textContent = text;
    this.toastEl.className = '';
    void this.toastEl.offsetWidth;
    this.toastEl.className = `pop ${kind}`;
    this.toastLeft = seconds;
  }

  hint(text: string, seconds: number): void {
    this.hintEl.textContent = text;
    this.hintEl.classList.add('show');
    this.hintLeft = seconds;
  }

  flash(kind: 'hit' | 'death'): void {
    this.flashEl.className = '';
    void this.flashEl.offsetWidth;
    this.flashEl.className = `go ${kind}`;
  }

  damageNumber(x: number, y: number, z: number, text: string, color: string): void {
    const el = document.createElement('div');
    el.className = 'dmg';
    el.textContent = text;
    el.style.color = color;
    this.markers.appendChild(el);
    this.floaters.push({ el, x, y, z, life: 0.8 });
  }

  // ---- per frame ------------------------------------------------------------------------------

  private set(el: HTMLElement, key: string, v: string): void {
    if (this.cache.get(key) === v) return;
    this.cache.set(key, v);
    el.textContent = v;
  }

  update(g: Game, dt: number): void {
    if (this.toastLeft > 0) {
      this.toastLeft -= dt;
      if (this.toastLeft <= 0) this.toastEl.className = '';
    }
    if (this.hintLeft > 0) {
      this.hintLeft -= dt;
      if (this.hintLeft <= 0) this.hintEl.classList.remove('show');
    }
    if (g.mode === 'title') return;
    const w = g.world;
    const p = w.player;
    this.hpFill.style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
    this.hpFill.classList.toggle('low', p.hp < p.maxHp * 0.3);
    this.set(this.hpText, 'hp', String(Math.ceil(p.hp)));
    this.meterFill.style.width = `${Math.min(100, p.meter)}%`;
    this.meterBox.classList.toggle('full', p.meter >= 100);
    this.set(this.weaponEl, 'weapon', p.weapon ? (p.weapon === 'gun' ? `PISTOL ${'●'.repeat(Math.max(0, p.uses))}  [G] SHOOT` : `${p.weapon === 'bat' ? 'BAT' : 'PIPE'} ×${p.uses}  [G] THROW`) : '');
    if (w.status !== 'perk') this.perksEl.classList.add('hidden');
    const sr = w.styleRank;
    this.styleEl.classList.toggle('on', w.style > 4);
    this.set(this.styleEl.querySelector('.sl') as HTMLElement, 'sl', STYLE_RANKS[sr]);
    (this.styleEl.querySelector('.sl') as HTMLElement).dataset.r = String(sr);
    this.set(this.styleEl.querySelector('.sw') as HTMLElement, 'sw', STYLE_WORDS[sr]);
    (this.styleEl.querySelector('.sb i') as HTMLElement).style.width = `${Math.round(w.styleProgress * 100)}%`;
    this.set(this.scoreEl, 'score', w.score.toLocaleString());
    const left = w.aliveCount;
    this.set(this.waveEl, 'wave', `${g.run.endless ? `WAVE ${w.wave + 1}` : `WAVE ${Math.max(1, w.wave + 1)}/${w.totalWaves}`} · ${left} LEFT`);
    if (w.combo >= 2) {
      this.comboEl.classList.add('on');
      (this.comboEl.querySelector('.n') as HTMLElement).textContent = String(w.combo);
      (this.comboEl.querySelector('.t') as HTMLElement).textContent = `HITS ×${w.mult.toFixed(1)}`;
      this.comboBar.style.width = `${Math.max(0, w.comboT / 3.2) * 100}%`;
    } else this.comboEl.classList.remove('on');

    // floating numbers
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.y += dt * 1.4;
      const s = g.view.projectToScreen(f.x, f.y, f.z);
      f.el.style.transform = `translate(${s.x}px, ${s.y}px)`;
      f.el.style.opacity = String(Math.min(1, f.life * 2.5));
      f.el.style.display = s.visible ? 'block' : 'none';
      if (f.life <= 0) { f.el.remove(); this.floaters.splice(i, 1); }
    }

    // enemy markers: health + incoming-attack ring, with arrows for attackers off screen
    const seen = new Set<number>();
    const W = window.innerWidth, H = window.innerHeight;
    for (const e of w.enemies) {
      if (e.state === 'dead') continue;
      seen.add(e.id);
      let m = this.enemyEls.get(e.id);
      if (!m) {
        const root = document.createElement('div');
        root.className = 'em';
        root.innerHTML = '<div class="eb"><i></i></div><div class="ico"></div>';
        const arrow = document.createElement('div');
        arrow.className = 'arrow';
        this.markers.append(root, arrow);
        m = { root, bar: root.querySelector('.eb i') as HTMLElement, ico: root.querySelector('.ico') as HTMLElement, arrow };
        this.enemyEls.set(e.id, m);
      }
      const s = g.view.projectToScreen(e.x, 2.15 * e.def.scale, e.z);
      const on = s.visible && s.x > 0 && s.x < W && s.y > 0 && s.y < H;
      const hurt = e.hp < e.maxHp;
      m.root.style.display = on ? 'block' : 'none';
      m.root.style.transform = `translate(${s.x}px, ${s.y}px)`;
      (m.root.firstElementChild as HTMLElement).style.opacity = hurt || e.kind === 'boss' || e.kind === 'brute' ? '1' : '0';
      m.bar.style.width = `${Math.max(0, (e.hp / e.maxHp) * 100)}%`;
      const attacking = e.state === 'wind' && e.atk;
      if (attacking && e.atk) {
        m.ico.className = `ico show ${ICON_CLASS[e.atk.icon]}`;
        const k = 1 - e.telegraph;
        m.ico.style.setProperty('--k', String(k));
        m.ico.textContent = e.atk.icon === 'red' ? '✕' : e.atk.icon === 'yellow' ? '◎' : '!';
      } else m.ico.className = 'ico';
      // arrow for attackers you cannot see
      if (attacking && e.atk && !on) {
        const dx = e.x - p.x, dz = e.z - p.z;
        const fx = Math.cos(g.yaw), fz = Math.sin(g.yaw);
        const ahead = dx * fx + dz * fz, side = dx * -fz + dz * fx;
        const a = Math.atan2(side, ahead);
        const R = Math.min(W, H) * 0.36;
        m.arrow.style.display = 'block';
        m.arrow.className = `arrow ${ICON_CLASS[e.atk.icon]}`;
        m.arrow.style.transform = `translate(${W / 2 + Math.sin(a) * R * 1.3}px, ${H / 2 - Math.cos(a) * R}px) rotate(${a}rad)`;
      } else m.arrow.style.display = 'none';
    }
    for (const [id, m] of this.enemyEls) if (!seen.has(id)) { m.root.remove(); m.arrow.remove(); this.enemyEls.delete(id); }
  }
}
