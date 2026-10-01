import { HEROES, HERO_IDS, HeroId, META_DEFS, META_IDS, MetaId, MetaLevels, metaCost, metaLevel } from '../logic/Meta';
import { PASSIVE_INFO, WEAPON_INFO, WeaponId, PassiveId, Card, RARITY } from '../logic/Upgrades';
import { SaveData } from '../logic/Save';
import { DIFFICULTIES, DIFFICULTY_IDS, DifficultyId } from '../logic/Difficulty';

const CSS = `
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;height:100%;background:#07051a;overflow:hidden;user-select:none;-webkit-user-select:none;touch-action:none}
body{font-family:"Segoe UI","Hiragino Sans","Noto Sans JP",system-ui,sans-serif;font-weight:800;color:#fff}
#app{position:fixed;inset:0}
canvas{display:block;position:absolute;inset:0;width:100%;height:100%}
.layer{position:absolute;inset:0;pointer-events:none}
.txt{text-shadow:0 2px 0 #000,0 0 8px #000,2px 0 0 #000,-2px 0 0 #000,0 -2px 0 #000}
.hp{position:absolute;left:14px;top:12px;width:min(300px,40vw)}
.bar{position:relative;height:24px;border-radius:12px;background:#1a1030;border:3px solid #000;overflow:hidden;box-shadow:0 0 0 2px #ffffff30}
.bar>i{position:absolute;left:0;top:0;bottom:0;width:100%;background:linear-gradient(#5dff9c,#1fb85c);transition:width .12s}
.bar>b{position:absolute;inset:0;text-align:center;font-size:14px;line-height:19px}
.xp{height:12px;margin-top:6px;border-radius:6px}
.xp>i{background:linear-gradient(#8af6ff,#2ea6ff)}
.lvl{font-size:20px;margin-top:4px;color:#8af6ff}
.top{position:absolute;left:50%;top:10px;transform:translateX(-50%);text-align:center}
.time{font-size:clamp(22px,6vw,34px);letter-spacing:2px}
.sub{font-size:13px;color:#ffd0e8;min-height:16px}
.stats{position:absolute;right:14px;top:12px;text-align:right;font-size:clamp(15px,4vw,20px);line-height:1.3}
.streak{position:absolute;right:16px;top:86px;text-align:right}
.streak .n{font-size:48px;line-height:1;transition:transform .08s}
.streak .l{font-size:14px;color:#ffe066}
.streak .t{height:6px;width:130px;margin-left:auto;background:#00000088;border-radius:3px;overflow:hidden;margin-top:3px}
.streak .t>i{display:block;height:100%;background:#ffe066}
.weapons{position:absolute;left:14px;bottom:14px;display:flex;gap:6px;flex-wrap:wrap;max-width:46vw}
.wi{position:relative;width:46px;height:46px;border-radius:10px;background:#140d2fcc;border:2px solid #ffffff44;text-align:center;font-size:24px;line-height:42px}
.wi small{position:absolute;right:2px;bottom:-2px;font-size:12px;color:#ffe066;text-shadow:0 1px 0 #000,1px 0 0 #000,-1px 0 0 #000}
.wi.p{width:36px;height:36px;font-size:18px;line-height:32px;opacity:.9}
.ult{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);width:104px;height:104px;border-radius:50%;pointer-events:auto;cursor:pointer;border:5px solid #000;background:conic-gradient(#c264ff var(--p,0%),#2a1646 0);box-shadow:0 0 0 3px #ffffff40;display:flex;align-items:center;justify-content:center;font-size:13px;text-align:center;line-height:1.1}
.ult span{background:#150a2ad9;border-radius:50%;width:78px;height:78px;display:flex;align-items:center;justify-content:center;flex-direction:column}
.ult.ready{animation:ultp .5s infinite alternate;background:conic-gradient(#ffe066,#ff4d8d,#ffe066)}
.ult.ready span{background:#ff2d78;font-size:15px}
@keyframes ultp{from{transform:translateX(-50%) scale(1);box-shadow:0 0 12px #ffe066}to{transform:translateX(-50%) scale(1.1);box-shadow:0 0 38px #ff4d8d}}
.dash{position:absolute;right:20px;bottom:24px;width:78px;height:78px;border-radius:50%;pointer-events:auto;cursor:pointer;border:4px solid #000;background:conic-gradient(#33d6ff var(--p,100%),#14304a 0);display:flex;align-items:center;justify-content:center;font-size:12px}
.dash span{background:#0d1f33d9;border-radius:50%;width:58px;height:58px;display:flex;align-items:center;justify-content:center;flex-direction:column;line-height:1.1}
.boss{position:absolute;left:50%;top:62px;transform:translateX(-50%);width:min(560px,70vw);display:none;text-align:center}
.boss .bar{height:20px}
.boss .bar>i{background:linear-gradient(#ff6a7a,#c4162f)}
.callout{position:absolute;left:50%;top:26%;transform:translate(-50%,-50%);font-size:clamp(34px,7vw,72px);white-space:nowrap;pointer-events:none}
.banner{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);font-size:clamp(30px,6vw,64px);white-space:nowrap}
.flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none}
.dmg{position:absolute;pointer-events:none;font-weight:900;font-size:18px;color:#fff;text-shadow:0 2px 0 #000,2px 0 0 #000,-2px 0 0 #000,0 -2px 0 #000;z-index:5}
.dmg.crit{font-size:30px;color:#ffe066}
.dmg.heal{color:#6dff9c}
.dmg.gold{color:#ffd633;font-size:16px}
.dmg.text{font-size:22px;color:#fff}
.modal{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#07051acc;pointer-events:auto;overflow:auto;padding:12px}
.modal h1{margin:0 0 4px;font-size:clamp(28px,6vw,52px);letter-spacing:1px}
.modal h2{margin:0 0 14px;font-size:16px;color:#b9b5d8;font-weight:700}
.cards{display:flex;gap:16px;flex-wrap:wrap;justify-content:center}
.card{position:relative;width:196px;min-height:272px;border-radius:16px;background:linear-gradient(#241a4d,#150d33);border:4px solid var(--rc,#fff);padding:14px 10px;text-align:center;cursor:pointer;box-shadow:0 0 22px var(--rc,#fff);animation:cardin .35s both;transition:transform .12s}
.card:hover,.card.sel{transform:translateY(-8px) scale(1.05)}
.card .ic{font-size:58px;line-height:1.2}
.card .nm{font-size:19px;margin-top:2px}
.card .ds{font-size:13px;color:#cfcaf0;font-weight:700;margin-top:6px;min-height:34px}
.card .rt{position:absolute;left:0;right:0;top:-14px;margin:auto;width:fit-content;padding:2px 10px;border-radius:10px;background:var(--rc);color:#000;font-size:12px;letter-spacing:1px}
.card .lv{margin-top:10px;font-size:15px;color:#ffe066}
.card .k{position:absolute;left:8px;bottom:6px;font-size:12px;color:#8e89b8}
.card.legendary{animation:cardin .35s both,glow .7s infinite alternate}
@keyframes glow{from{box-shadow:0 0 20px var(--rc)}to{box-shadow:0 0 50px var(--rc),0 0 90px var(--rc)}}
@keyframes cardin{from{transform:translateY(40px) scale(.6) rotate(-6deg);opacity:0}to{transform:none;opacity:1}}
.btn{pointer-events:auto;cursor:pointer;border:4px solid #000;border-radius:16px;padding:12px 26px;font-size:24px;font-weight:900;color:#fff;background:linear-gradient(#ff7a3d,#e12d5d);box-shadow:0 5px 0 #000;font-family:inherit;margin:6px}
.btn:active{transform:translateY(3px);box-shadow:0 2px 0 #000}
.btn.alt{background:linear-gradient(#5a6cff,#3a35c4)}
.btn.sm{font-size:16px;padding:8px 14px;border-radius:12px}
.btn[disabled]{filter:grayscale(1);opacity:.55;cursor:default}
.logo{text-shadow:none;font-size:clamp(46px,11vw,110px);line-height:.95;margin:0;text-align:center;background:linear-gradient(#fff6a8,#ff9a3d 55%,#ff3c8a);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 5px 0 #000) drop-shadow(0 0 22px #ff3c8a88);transform:rotate(-2deg)}
.logo small{display:block;font-size:.34em;letter-spacing:.35em;color:#7af0ff;-webkit-text-fill-color:#7af0ff}
.heroes{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin:14px 0}
.hero{width:176px;border-radius:14px;background:#1a1240cc;border:4px solid #ffffff33;padding:10px;text-align:center;cursor:pointer}
.hero.sel{border-color:#ffe066;box-shadow:0 0 22px #ffe06688;transform:scale(1.05)}
.hero .hn{font-size:20px}
.hero .ht{font-size:12px;color:#b9b5d8;font-weight:700;min-height:30px}
.hero .hs{font-size:12px;color:#8af6ff}
.hero.lock{opacity:.7}
.row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;align-items:center}
.small{font-size:13px;color:#b9b5d8;font-weight:700}
.coins{font-size:22px;color:#ffd633}
.list{width:min(620px,94vw)}
.up{display:flex;align-items:center;gap:10px;background:#1a1240;border:3px solid #ffffff22;border-radius:12px;padding:8px 12px;margin:6px 0}
.up .ic{font-size:28px;width:38px;text-align:center}
.up .in{flex:1;text-align:left}
.up .in b{font-size:17px}
.up .in div{font-size:12px;color:#b9b5d8;font-weight:700}
.pips{display:flex;gap:3px;margin-top:3px}
.pips i{width:16px;height:8px;border-radius:3px;background:#3a3454}
.pips i.on{background:#c264ff}
.res{display:grid;grid-template-columns:auto auto;gap:6px 26px;font-size:20px;margin:10px 0}
.res div:nth-child(even){text-align:right;color:#ffe066}
.joyzone{position:absolute;left:0;top:0;bottom:0;width:55%;pointer-events:auto;touch-action:none}
.joybase{display:none;position:fixed;width:140px;height:140px;border-radius:50%;background:#ffffff18;border:3px solid #ffffff55}
.joyknob{position:absolute;left:35px;top:35px;width:70px;height:70px;border-radius:50%;background:#ffffffaa}
.toast{position:absolute;left:50%;top:18%;transform:translateX(-50%);padding:6px 16px;background:#000a;border-radius:12px;font-size:16px;pointer-events:none;animation:toast 1.6s forwards}
@keyframes toast{0%{opacity:0;transform:translate(-50%,10px)}15%,80%{opacity:1;transform:translate(-50%,0)}100%{opacity:0}}
@keyframes popin{from{transform:translate(-50%,-50%) scale(.3);opacity:0}30%{transform:translate(-50%,-50%) scale(1.25);opacity:1}to{transform:translate(-50%,-50%) scale(1);opacity:1}}
`;

export interface HudState {
  hp: number;
  maxHp: number;
  xp: number;
  xpNeed: number;
  level: number;
  time: number;
  kills: number;
  coins: number;
  ult: number;
  dashReady: number;
  weapons: Array<{ id: WeaponId; level: number }>;
  passives: Array<{ id: PassiveId; level: number }>;
  streak: number;
  streakRemain: number;
  boss: { name: string; ratio: number } | null;
  nextBoss: string;
  touch: boolean;
}

export interface CardView {
  icon: string;
  name: string;
  desc: string;
  rarityName: string;
  color: string;
  lvText: string;
  legendary: boolean;
}

export function cardView(card: Card, curLevel: number): CardView {
  const r = RARITY[card.rarity];
  if (card.kind === 'weapon') {
    const w = WEAPON_INFO[card.id as WeaponId];
    return { icon: w.icon, name: w.name, desc: w.desc, rarityName: r.name, color: r.color, lvText: card.isNew ? 'NEW!' : `Lv ${curLevel} → ${curLevel + card.levels}`, legendary: card.rarity === 'legendary' };
  }
  const p = PASSIVE_INFO[card.id as PassiveId];
  return { icon: p.icon, name: p.name, desc: p.desc, rarityName: r.name, color: r.color, lvText: card.isNew ? 'NEW!' : `Lv ${curLevel} → ${curLevel + card.levels}`, legendary: card.rarity === 'legendary' };
}

const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** All DOM UI: HUD, title, card picks, results. Pure presentation; the Game owns the logic. */
export class Hud {
  readonly layer: HTMLDivElement;
  readonly numbers: HTMLDivElement;
  private hud: HTMLDivElement;
  private modal: HTMLDivElement | null = null;
  private el: Record<string, HTMLElement> = {};
  private flashEl: HTMLDivElement;
  private calloutEl: HTMLDivElement | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private lastStreak = 0;

  constructor(private root: HTMLElement, onUlt: () => void, onDash: () => void) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.numbers = document.createElement('div');
    this.numbers.className = 'layer';
    root.appendChild(this.numbers);
    this.hud = document.createElement('div');
    this.hud.className = 'layer txt';
    this.hud.style.display = 'none';
    this.hud.innerHTML = `
      <div class="hp"><div class="bar"><i id="hpf"></i><b id="hpt"></b></div><div class="bar xp"><i id="xpf" style="width:0"></i></div><div class="lvl" id="lvl"></div></div>
      <div class="top"><div class="time" id="time">00:00</div><div class="sub" id="nextboss"></div></div>
      <div class="stats"><div id="kills">💀 0</div><div id="coins" style="color:#ffd633">🪙 0</div></div>
      <div class="streak" id="streak" style="display:none"><div class="n" id="sn">0</div><div class="l">KILL STREAK</div><div class="t"><i id="st"></i></div></div>
      <div class="boss" id="boss"><div id="bn" style="font-size:18px"></div><div class="bar"><i id="bf"></i></div></div>
      <div class="weapons" id="weapons"></div>
      <div class="ult" id="ult"><span>ULT<b id="up">0%</b></span></div>
      <div class="dash" id="dash"><span>DASH<small id="dk">SPACE</small></span></div>`;
    root.appendChild(this.hud);
    for (const id of ['hpf', 'hpt', 'xpf', 'lvl', 'time', 'nextboss', 'kills', 'coins', 'streak', 'sn', 'st', 'boss', 'bn', 'bf', 'weapons', 'ult', 'up', 'dash', 'dk']) this.el[id] = this.hud.querySelector('#' + id) as HTMLElement;
    this.el.ult.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onUlt();
    });
    this.el.dash.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onDash();
    });
    this.layer = document.createElement('div');
    this.layer.className = 'layer';
    root.appendChild(this.layer);
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'flash';
    root.appendChild(this.flashEl);
  }

  showHud(on: boolean): void {
    this.hud.style.display = on ? 'block' : 'none';
  }

  update(s: HudState): void {
    const e = this.el;
    e.hpf.style.width = `${Math.max(0, (s.hp / s.maxHp) * 100)}%`;
    e.hpt.textContent = `${Math.max(0, Math.ceil(s.hp))} / ${Math.ceil(s.maxHp)}`;
    e.xpf.style.width = `${Math.min(100, (s.xp / s.xpNeed) * 100)}%`;
    e.lvl.textContent = `LV ${s.level}`;
    e.time.textContent = fmtTime(s.time);
    e.nextboss.textContent = s.nextBoss;
    e.kills.textContent = `💀 ${s.kills.toLocaleString()}`;
    e.coins.textContent = `🪙 ${s.coins.toLocaleString()}`;
    const ready = s.ult >= 100;
    e.ult.classList.toggle('ready', ready);
    e.ult.style.setProperty('--p', `${s.ult}%`);
    e.up.textContent = ready ? 'READY!' : `${Math.floor(s.ult)}%`;
    e.dash.style.setProperty('--p', `${Math.round(s.dashReady * 100)}%`);
    e.dk.textContent = s.touch ? '' : 'SPACE';
    if (s.streak >= 3) {
      e.streak.style.display = 'block';
      e.sn.textContent = String(s.streak);
      (e.st as HTMLElement).style.width = `${s.streakRemain * 100}%`;
      if (s.streak !== this.lastStreak) {
        e.sn.style.transform = 'scale(1.25)';
        setTimeout(() => (e.sn.style.transform = ''), 70);
      }
    } else e.streak.style.display = 'none';
    this.lastStreak = s.streak;
    if (s.boss) {
      e.boss.style.display = 'block';
      e.bn.textContent = s.boss.name;
      (e.bf as HTMLElement).style.width = `${Math.max(0, s.boss.ratio * 100)}%`;
    } else e.boss.style.display = 'none';
    // weapons + passives (rebuild only when changed)
    const key = JSON.stringify([s.weapons, s.passives]);
    if (key !== (e.weapons as HTMLElement & { _k?: string })._k) {
      (e.weapons as HTMLElement & { _k?: string })._k = key;
      e.weapons.innerHTML =
        s.weapons.map((w) => `<div class="wi" title="${WEAPON_INFO[w.id].name}">${WEAPON_INFO[w.id].icon}<small>${w.level}</small></div>`).join('') +
        s.passives.map((p) => `<div class="wi p" title="${PASSIVE_INFO[p.id].name}">${PASSIVE_INFO[p.id].icon}<small>${p.level}</small></div>`).join('');
    }
  }

  /** Big text that pops in the upper middle (kill streak callouts etc.). */
  callout(text: string, color: string, scale = 1): void {
    this.calloutEl?.remove();
    const c = document.createElement('div');
    c.className = 'callout txt';
    c.style.color = color;
    c.style.fontSize = `calc(clamp(34px,7vw,72px) * ${scale})`;
    c.textContent = text;
    c.style.animation = 'popin .35s both';
    this.layer.appendChild(c);
    this.calloutEl = c;
    setTimeout(() => {
      c.style.transition = 'opacity .4s';
      c.style.opacity = '0';
      setTimeout(() => c.remove(), 420);
    }, 900);
  }

  banner(text: string, color = '#fff', ms = 1500): void {
    const b = document.createElement('div');
    b.className = 'banner txt';
    b.style.color = color;
    b.textContent = text;
    b.style.animation = 'popin .4s both';
    this.layer.appendChild(b);
    setTimeout(() => {
      b.style.transition = 'opacity .4s';
      b.style.opacity = '0';
      setTimeout(() => b.remove(), 420);
    }, ms);
  }

  toast(text: string): void {
    const t = document.createElement('div');
    t.className = 'toast txt';
    t.textContent = text;
    this.layer.appendChild(t);
    setTimeout(() => t.remove(), 1700);
  }

  flash(color = '#fff', peak = 0.8, ms = 300): void {
    this.flashEl.style.background = color;
    this.flashEl.animate([{ opacity: peak }, { opacity: 0 }], { duration: ms, easing: 'ease-out' });
  }

  // ---- modals -----------------------------------------------------------

  closeModal(): void {
    this.modal?.remove();
    this.modal = null;
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = null;
  }

  private openModal(html: string): HTMLDivElement {
    this.closeModal();
    const m = document.createElement('div');
    m.className = 'modal txt';
    m.innerHTML = html;
    this.root.appendChild(m);
    this.modal = m;
    return m;
  }

  private bindKeys(fn: (e: KeyboardEvent) => void): void {
    this.keyHandler = fn;
    window.addEventListener('keydown', fn);
  }

  showCards(title: string, subtitle: string, cards: CardView[], rerolls: number, onPick: (i: number) => void, onReroll: () => void): void {
    const html = `<h1>${title}</h1><h2>${subtitle}</h2><div class="cards">${cards
      .map(
        (c, i) => `<div class="card ${c.legendary ? 'legendary' : ''}" data-i="${i}" style="--rc:${c.color};animation-delay:${i * 0.08}s">
          <div class="rt">${c.rarityName}</div><div class="ic">${c.icon}</div><div class="nm">${c.name}</div><div class="ds">${c.desc}</div><div class="lv">${c.lvText}</div><div class="k">[${i + 1}]</div></div>`,
      )
      .join('')}</div>${rerolls > 0 ? `<button class="btn sm alt" id="rr">🎲 REROLL (${rerolls})  [R]</button>` : ''}`;
    const m = this.openModal(html);
    let done = false;
    const pick = (i: number) => {
      if (done || i < 0 || i >= cards.length) return;
      done = true;
      onPick(i);
    };
    m.querySelectorAll<HTMLElement>('.card').forEach((el) => el.addEventListener('pointerdown', () => pick(Number(el.dataset.i))));
    m.querySelector('#rr')?.addEventListener('pointerdown', () => {
      if (!done) {
        done = true;
        onReroll();
      }
    });
    this.bindKeys((e) => {
      if (e.code === 'Digit1' || e.code === 'Numpad1') pick(0);
      else if (e.code === 'Digit2' || e.code === 'Numpad2') pick(1);
      else if (e.code === 'Digit3' || e.code === 'Numpad3') pick(2);
      else if (e.code === 'KeyR' && rerolls > 0 && !done) {
        done = true;
        onReroll();
      }
    });
  }

  /** Chest: cards flip over one by one; everything is yours. */
  showChest(cards: CardView[], coins: number, onDone: () => void): void {
    const html = `<h1 style="color:#ffd633">TREASURE!</h1><h2>Everything is yours</h2><div class="cards">${cards
      .map(
        (c, i) => `<div class="card ${c.legendary ? 'legendary' : ''}" style="--rc:${c.color};visibility:hidden" data-i="${i}">
          <div class="rt">${c.rarityName}</div><div class="ic">${c.icon}</div><div class="nm">${c.name}</div><div class="ds">${c.desc}</div><div class="lv">${c.lvText}</div></div>`,
      )
      .join('')}</div><div class="coins" style="margin-top:10px;visibility:hidden" id="cc">+${coins} 🪙</div><button class="btn" id="ok" style="visibility:hidden">COLLECT!</button>`;
    const m = this.openModal(html);
    const els = [...m.querySelectorAll<HTMLElement>('.card')];
    els.forEach((el, i) => setTimeout(() => (el.style.visibility = 'visible'), 500 + i * 650));
    setTimeout(() => {
      (m.querySelector('#cc') as HTMLElement).style.visibility = 'visible';
      (m.querySelector('#ok') as HTMLElement).style.visibility = 'visible';
    }, 500 + els.length * 650);
    let done = false;
    const fin = () => {
      if (done) return;
      done = true;
      onDone();
    };
    m.querySelector('#ok')?.addEventListener('pointerdown', fin);
    this.bindKeys((e) => {
      if (e.code === 'Enter' || e.code === 'Space') fin();
    });
  }

  showTitle(save: SaveData, h: { onDifficulty: (d: DifficultyId) => void; onPlay: (hero: HeroId) => void; onShop: () => void; onToggleSound: () => void; onToggleFx: () => void }): void {
    let sel: HeroId = save.heroes.includes(save.hero) ? save.hero : 'blaze';
    const render = () => {
      const m = this.openModal(`
        <h1 class="logo">BREAK RUSH<small>3D</small></h1>
        <div class="heroes">${HERO_IDS.map((id) => {
          const hd = HEROES[id];
          const owned = save.heroes.includes(id);
          return `<div class="hero ${sel === id ? 'sel' : ''} ${owned ? '' : 'lock'}" data-h="${id}"><div class="hn" style="color:#${hd.color.toString(16).padStart(6, '0')}">${hd.name}</div><div class="ht">${hd.tagline}</div><div class="hs">HP ${hd.hp} · SPD ${hd.speed}</div><div class="hs">${owned ? '✔ UNLOCKED' : `🔒 ${hd.cost} 🪙`}</div></div>`;
        }).join('')}</div>
        <div class="row">${DIFFICULTY_IDS.map((d) => `<button class="btn sm ${save.difficulty === d ? '' : 'alt'}" data-d="${d}">${DIFFICULTIES[d].name}</button>`).join('')}</div>
        <div class="small" style="margin-bottom:6px">${DIFFICULTIES[save.difficulty].desc}</div>
        <div class="row"><button class="btn" id="play">▶ PLAY</button><button class="btn alt" id="shop">⬆ UPGRADES</button></div>
        <div class="coins">🪙 ${save.coins.toLocaleString()}</div>
        <div class="small">BEST  ${fmtTime(save.bestTime)} · ${save.bestKills.toLocaleString()} kills · LV ${save.bestLevel} · wins ${save.wins}</div>
        <div class="row" style="margin-top:8px"><button class="btn sm alt" id="snd">${save.settings.muted ? '🔇 SOUND OFF' : '🔊 SOUND ON'}</button><button class="btn sm alt" id="fx">${save.settings.lowFx ? '✨ FX: LOW' : '✨ FX: HIGH'}</button></div>
        <div class="small" style="margin-top:10px">WASD / Arrows: move · Space/Shift: dash · Q/R/E: ULTIMATE · attacks are automatic!</div>`);
      m.querySelectorAll<HTMLElement>('.hero').forEach((el) =>
        el.addEventListener('pointerdown', () => {
          const id = el.dataset.h as HeroId;
          if (save.heroes.includes(id)) {
            sel = id;
            render();
          } else if (save.coins >= HEROES[id].cost) {
            this.heroBuy(id);
          } else this.toast(`Need ${HEROES[id].cost} coins`);
        }),
      );
      m.querySelectorAll<HTMLElement>('button[data-d]').forEach((b) =>
        b.addEventListener('pointerdown', () => {
          h.onDifficulty(b.dataset.d as DifficultyId);
          render();
        }),
      );
      m.querySelector('#play')?.addEventListener('pointerdown', () => h.onPlay(sel));
      m.querySelector('#shop')?.addEventListener('pointerdown', h.onShop);
      m.querySelector('#snd')?.addEventListener('pointerdown', () => {
        h.onToggleSound();
        render();
      });
      m.querySelector('#fx')?.addEventListener('pointerdown', () => {
        h.onToggleFx();
        render();
      });
      this.bindKeys((e) => {
        if (e.code === 'Enter' || e.code === 'Space') h.onPlay(sel);
        else if (e.code === 'KeyU') h.onShop();
      });
    };
    this.heroBuy = (id: HeroId) => {
      this.onHeroBuy?.(id);
    };
    render();
    this.rerenderTitle = render;
  }

  heroBuy: (id: HeroId) => void = () => {};
  onHeroBuy: ((id: HeroId) => void) | null = null;
  rerenderTitle: () => void = () => {};

  showShop(save: SaveData, onBuy: (id: MetaId) => void, onBack: () => void): void {
    const render = () => {
      const m = this.openModal(`<h1 style="color:#c264ff">UPGRADES</h1><div class="coins">🪙 ${save.coins.toLocaleString()}</div><div class="list">${META_IDS.map((id) => {
        const d = META_DEFS[id];
        const lv = metaLevel(save.meta as MetaLevels, id);
        const maxed = lv >= d.max;
        const cost = metaCost(save.meta as MetaLevels, id);
        return `<div class="up"><div class="ic">${d.icon}</div><div class="in"><b>${d.name}</b><div>${d.desc}</div><div class="pips">${Array.from({ length: d.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div><button class="btn sm" data-id="${id}" ${maxed || save.coins < cost ? 'disabled' : ''}>${maxed ? 'MAX' : `${cost} 🪙`}</button></div>`;
      }).join('')}</div><button class="btn alt" id="back">◀ BACK</button>`);
      m.querySelectorAll<HTMLElement>('button[data-id]').forEach((b) =>
        b.addEventListener('pointerdown', () => {
          if (!(b as HTMLButtonElement).disabled) {
            onBuy(b.dataset.id as MetaId);
            render();
          }
        }),
      );
      m.querySelector('#back')?.addEventListener('pointerdown', onBack);
      this.bindKeys((e) => {
        if (e.code === 'Escape' || e.code === 'Enter') onBack();
      });
    };
    render();
  }

  showResults(r: { victory: boolean; time: number; kills: number; level: number; coins: number; banked: number; bestTime: boolean; bestKills: boolean; maxStreak: number }, onRetry: () => void, onMenu: () => void): void {
    const m = this.openModal(`<h1 style="color:${r.victory ? '#ffe066' : '#ff4d6d'}">${r.victory ? 'VICTORY!' : 'YOU FELL'}</h1>
      <div class="res"><div>TIME</div><div>${fmtTime(r.time)}${r.bestTime ? ' 🏆' : ''}</div><div>KILLS</div><div>${r.kills.toLocaleString()}${r.bestKills ? ' 🏆' : ''}</div><div>LEVEL</div><div>${r.level}</div><div>BEST STREAK</div><div>${r.maxStreak}</div><div>COINS BANKED</div><div>+${r.banked.toLocaleString()} 🪙</div></div>
      <div class="row"><button class="btn" id="retry">↻ RETRY</button><button class="btn alt" id="menu">☰ MENU</button></div>`);
    m.querySelector('#retry')?.addEventListener('pointerdown', onRetry);
    m.querySelector('#menu')?.addEventListener('pointerdown', onMenu);
    this.bindKeys((e) => {
      if (e.code === 'Enter' || e.code === 'KeyR') onRetry();
      else if (e.code === 'Escape') onMenu();
    });
  }

  showPause(onResume: () => void, onQuit: () => void): void {
    const m = this.openModal(`<h1>PAUSED</h1><div class="row"><button class="btn" id="res">▶ RESUME</button><button class="btn alt" id="quit">☰ QUIT RUN</button></div>`);
    m.querySelector('#res')?.addEventListener('pointerdown', onResume);
    m.querySelector('#quit')?.addEventListener('pointerdown', onQuit);
    this.bindKeys((e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') onResume();
    });
  }

  get modalOpen(): boolean {
    return this.modal !== null;
  }
}
