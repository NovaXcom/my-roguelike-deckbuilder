import { Enemy, World } from '../samurai/World';
import { SamuraiView } from '../render/SamuraiView';
import { formatTime } from './Progress';

const ICON_TXT = { blue: '!', red: '!!', shot: '➤' } as const;

interface IconEl {
  el: HTMLDivElement;
  bar: HTMLDivElement;
  fill: HTMLElement;
  ring: SVGCircleElement;
  kind: string;
}

export class Hud {
  readonly root: HTMLDivElement;
  private hpFill: HTMLElement;
  private hpGhost: HTMLElement;
  private hpTxt: HTMLElement;
  private pips: HTMLElement[] = [];
  private pipBox: HTMLElement;
  private score: HTMLElement;
  private timeEl: HTMLElement;
  private stageEl: HTMLElement;
  private killsEl: HTMLElement;
  private comboEl: HTMLElement;
  private comboNum: HTMLElement;
  private comboBar: HTMLElement;
  private banner: HTMLElement;
  private bannerH: HTMLElement;
  private bannerP: HTMLElement;
  private stampEl: HTMLElement;
  private bossEl: HTMLElement;
  private bossN: HTMLElement;
  private bossFill: HTMLElement;
  private goEl: HTMLElement;
  private dmgFlash: HTMLElement;
  private lowHp: HTMLElement;
  private hint: HTMLElement;
  private icons = new Map<number, IconEl>();
  private lastCombo = 0;
  private shownScore = 0;
  private pipCount = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.className = 'off';
    this.root.innerHTML = `
      <div class="lowhp"></div><div class="dmgFlash"></div>
      <div class="ab hpWrap"><div class="hpBar"><div class="hpGhost"></div><div class="hpFill"></div></div><div class="hpTxt"></div>
        <div class="pips"></div></div>
      <div class="ab score"><small>SCORE</small><span class="sc">0</span></div>
      <div class="ab kills"></div>
      <div class="ab stage"></div>
      <div class="ab combo"><b>0</b><span>HIT</span><div class="bar"><i></i></div></div>
      <div class="ab banner"><h1></h1><p></p></div>
      <div class="ab stamp"></div>
      <div class="ab boss"><div class="n"></div><div class="b"><i></i></div></div>
      <div class="ab go">進め ▶</div>
      <div class="ab hint"></div>`;
    parent.appendChild(this.root);
    const q = <T extends HTMLElement>(s: string) => this.root.querySelector(s) as T;
    this.hpFill = q('.hpFill');
    this.hpGhost = q('.hpGhost');
    this.hpTxt = q('.hpTxt');
    this.pipBox = q('.pips');
    this.score = q('.sc');
    this.timeEl = q('.stage');
    this.stageEl = this.timeEl;
    this.killsEl = q('.kills');
    this.comboEl = q('.combo');
    this.comboNum = q('.combo b');
    this.comboBar = q('.combo .bar i');
    this.banner = q('.banner');
    this.bannerH = q('.banner h1');
    this.bannerP = q('.banner p');
    this.stampEl = q('.stamp');
    this.bossEl = q('.boss');
    this.bossN = q('.boss .n');
    this.bossFill = q('.boss .b i');
    this.goEl = q('.go');
    this.dmgFlash = q('.dmgFlash');
    this.lowHp = q('.lowhp');
    this.hint = q('.hint');
    this.hint.innerHTML = `<b>A D</b>移動　<b>SPACE</b>跳ぶ(2段可)　<b>J / 左クリック</b>斬る(連打で3連撃)<br>
      <b>W+J</b>斬り上げ(浮かせる)　<b>空中 S+J</b>落下斬り　<b>K / 右クリック</b>パリィ(敵の攻撃の直前に！)<br>
      <b>SHIFT</b>燕返し・居合ダッシュ(通った敵を一斉に斬る)　<b>I</b>居合・奥義(ゲージ2消費)　<b>赤=かわす / 青=弾く</b>`;
  }

  setMode(on: boolean): void {
    this.root.classList.toggle('off', !on);
  }

  setHint(on: boolean): void {
    this.hint.classList.toggle('off', !on);
  }

  reset(stageLabel: string): void {
    this.stageEl.textContent = stageLabel;
    this.lastCombo = 0;
    this.shownScore = 0;
    for (const [, i] of this.icons) i.el.remove(), i.bar.remove();
    this.icons.clear();
    this.bossEl.classList.remove('on');
  }

  showBanner(title: string, sub = ''): void {
    this.bannerH.textContent = title;
    this.bannerP.textContent = sub;
    this.banner.classList.remove('show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
  }

  stamp(text: string, color?: string): void {
    this.stampEl.textContent = text;
    this.stampEl.style.color = color ?? '#fff';
    this.stampEl.classList.remove('show');
    void this.stampEl.offsetWidth;
    this.stampEl.classList.add('show');
  }

  hurtFlash(): void {
    this.dmgFlash.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => this.dmgFlash.classList.remove('on')));
  }

  float(view: SamuraiView, x: number, y: number, text: string, cls: string): void {
    const s = view.projectToScreen(x, y);
    if (!s.visible) return;
    const el = document.createElement('div');
    el.className = 'fl ' + cls;
    el.textContent = text;
    el.style.left = `${s.x + (Math.random() - 0.5) * 30}px`;
    el.style.top = `${s.y}px`;
    this.root.appendChild(el);
    window.setTimeout(() => el.remove(), 850);
  }

  private icon(id: number): IconEl {
    let i = this.icons.get(id);
    if (!i) {
      const el = document.createElement('div');
      el.className = 'icon';
      el.innerHTML = '<span></span><svg viewBox="0 0 58 58"><circle cx="29" cy="29" r="26" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="163" stroke-dashoffset="0" transform="rotate(-90 29 29)"/></svg>';
      const bar = document.createElement('div');
      bar.className = 'ebar';
      bar.innerHTML = '<i></i>';
      this.root.appendChild(el);
      this.root.appendChild(bar);
      i = { el, bar, fill: bar.firstChild as HTMLElement, ring: el.querySelector('circle') as SVGCircleElement, kind: '' };
      this.icons.set(id, i);
    }
    return i;
  }

  update(w: World, view: SamuraiView, time: number): void {
    const p = w.p;
    const pct = Math.max(0, p.hp / p.maxHp) * 100;
    this.hpFill.style.width = `${pct}%`;
    this.hpGhost.style.width = `${pct}%`;
    this.hpTxt.textContent = `体力 ${Math.ceil(p.hp)} / ${p.maxHp}`;
    this.lowHp.classList.toggle('on', p.hp / p.maxHp < 0.3 && p.hp > 0);

    const maxPips = w.pipsMax;
    if (this.pipCount !== maxPips) {
      this.pipCount = maxPips;
      this.pipBox.innerHTML = '';
      this.pips = [];
      for (let i = 0; i < maxPips; i++) {
        const d = document.createElement('div');
        d.className = 'pip';
        d.innerHTML = '<i></i>';
        this.pipBox.appendChild(d);
        this.pips.push(d);
      }
      const l = document.createElement('div');
      l.className = 'pipLbl';
      l.textContent = '斬気';
      this.pipBox.appendChild(l);
    }
    for (let i = 0; i < this.pips.length; i++) {
      const f = Math.max(0, Math.min(1, p.pips - i));
      (this.pips[i].firstChild as HTMLElement).style.width = `${f * 100}%`;
      this.pips[i].classList.toggle('full', f >= 1);
    }

    this.shownScore += (w.score - this.shownScore) * 0.25;
    if (Math.abs(w.score - this.shownScore) < 1) this.shownScore = w.score;
    this.score.textContent = String(Math.round(this.shownScore)).padStart(6, '0');
    this.killsEl.textContent = `${formatTime(w.time)}　斬 ${w.kills}`;

    if (w.combo >= 2) {
      this.comboEl.classList.add('on');
      this.comboNum.textContent = String(w.combo);
      if (w.combo !== this.lastCombo) {
        this.comboNum.classList.remove('pop');
        void this.comboNum.offsetWidth;
        this.comboNum.classList.add('pop');
      }
      this.comboBar.style.width = `${Math.max(0, Math.min(1, w.comboT / 2.6)) * 100}%`;
    } else this.comboEl.classList.remove('on');
    this.lastCombo = w.combo;

    this.goEl.classList.toggle('on', w.goHint > 0 && !w.lock);

    // enemy icons & bars
    const seen = new Set<number>();
    let boss: Enemy | null = null;
    for (const e of w.enemies) {
      if (e.state === 'dead' || e.state === 'enter') continue;
      if (e.kind === 'shogun') boss = e;
      const a = view.enemyAnchor(e);
      const s = view.projectToScreen(a.x, a.y);
      if (!s.visible) continue;
      let show: 'blue' | 'red' | 'shot' | 'stun' | null = null;
      let prog = 0;
      if (e.state === 'wind' && e.atk) { show = e.atk.icon; prog = Math.min(1, e.t / e.atk.wind); }
      else if (e.state === 'stun') { show = 'stun'; prog = 1 - Math.min(1, e.stunT / 2.2); }
      const isArmor = e.def.armored && e.kind !== 'shogun';
      if (!show && !isArmor) continue;
      seen.add(e.id);
      const i = this.icon(e.id);
      if (show) {
        i.el.style.display = '';
        i.el.style.left = `${s.x}px`;
        i.el.style.top = `${s.y - 14}px`;
        if (i.kind !== show) {
          i.kind = show;
          i.el.className = 'icon ' + show;
          (i.el.firstChild as HTMLElement).textContent = show === 'stun' ? '斬' : ICON_TXT[show];
        }
        i.ring.style.strokeDashoffset = String(163 * prog);
        const sc = show === 'stun' ? 1 : 1.5 - prog * 0.5;
        i.el.style.transform = `translate(-50%, -50%) scale(${sc})`;
      } else i.el.style.display = 'none';
      if (isArmor) {
        i.bar.style.display = '';
        i.bar.style.left = `${s.x}px`;
        i.bar.style.top = `${s.y + (show ? 28 : 0)}px`;
        i.fill.style.width = `${(e.hp / e.maxHp) * 100}%`;
      } else i.bar.style.display = 'none';
    }
    for (const [id, i] of this.icons) {
      if (!seen.has(id)) {
        i.el.remove();
        i.bar.remove();
        this.icons.delete(id);
      }
    }
    if (boss) {
      this.bossEl.classList.add('on');
      this.bossN.textContent = '将軍  SHOGUN';
      this.bossFill.style.width = `${(boss.hp / boss.maxHp) * 100}%`;
    } else this.bossEl.classList.remove('on');
    void time;
  }
}
