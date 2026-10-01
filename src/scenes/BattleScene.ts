import Phaser from 'phaser';
import { audio } from '../audio';
import { bgmForScene, castCue, deathCue, enemyAttackCue, hurtCue, impactCues, type Cue } from '../audio/cues';
import {
  BattleEvent, BattleState, HAND_SIZE, nextDraw, canUse, canWait, currentIntent, defaultTarget, effectiveSkill, endPlayerTurn, skillCost, intentValue, isEnraged,
  nextIntent, previewSkill, resolveTarget, usePotion, useSkill, wait,
} from '../core/battle';
import { recommend } from '../core/hint';
import { MAX_PLAN, WAIT_ID, appendStep, canAppend, removeStep, simulatePlan, summarizePlan, type PlanStep } from '../core/plan';
import type { MapNode } from '../core/map';
import { finishBattle, startBattle } from '../core/run';
import { game } from '../game';
import { ELEMENT_COLOR, ELEMENT_LABEL, SKILLS } from '../core/data';
import type { Element, SkillDef } from '../core/types';
import { COLORS, drawBackground, drawHero, drawShield, drawEnemy, drawSword, txt } from '../ui/art';
import { ENEMY_DISPLAY_H, HERO_DISPLAY_H, HERO_SPRITE, bgKeyFor, enemySpriteKey, skillIconKey, type HeroPose } from '../ui/assetMap';
import { hasImg } from '../ui/assets';
import { makeButton, onTap, padHitArea, type Button } from '../ui/widgets';
import { compact } from '../ui/device';
import { skillSummary } from '../ui/skillText';
import { hitStopMs, popupFontSize, shakeFor, shouldFlashHurt, sparkCount } from '../ui/juice';
import { H, W } from './TitleScene';

const HERO_POS = [{ x: 430, y: 400 }, { x: 200, y: 400 }]; // [前衛, 後衛]
const ENEMY_Y = 350;
const ENEMY = { x: 990, y: ENEMY_Y };
/** 敵の編成数ごとの配置(x座標)と縮尺 */
const ENEMY_LAYOUT: Record<number, { xs: number[]; k: number }> = {
  1: { xs: [990], k: 1 },
  2: { xs: [915, 1135], k: 0.82 },
  3: { xs: [850, 1010, 1170], k: 0.66 },
};
const ENEMY_TAG = ['A', 'B', 'C'];

/** 1体分の表示物 */
interface EnemyView {
  pos: { x: number; y: number };
  k: number;
  base: number;
  gfx: Actor;
  stars: Phaser.GameObjects.Container;
  hpText: Phaser.GameObjects.Text;
  shieldText: Phaser.GameObjects.Text;
  statusText: Phaser.GameObjects.Text;
  intentBox: Phaser.GameObjects.Container;
  intentGfx: Phaser.GameObjects.Graphics;
  intentImg: Phaser.GameObjects.Image;
  intentValue: Phaser.GameObjects.Text;
  intentLabel: Phaser.GameObjects.Text;
  intentHint: Phaser.GameObjects.Text;
  marker: Phaser.GameObjects.Text;
  barW: number;
  dead: boolean;
}
const PLAY_LINE_Y = 470; // 補助スキルをドラッグでドロップして使う境界線
const PANEL_W = 4 * 140 + 3 * 8; // パネル幅は固定。スキル数に応じてボタン幅を分割
const BTN_H = 196; // アイコン分だけ高く
const BTN_Y = 610;
const PANEL_X = [30, 666];
const WAIT_TEXT = '行動を溜める: 自分のスキルCD-1 / ガード+5 / 次のダメージスキルが強化(威力×1.2・ゲージ-5)';
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/** 演出用の表示値。イベント再生に合わせて段階的に更新し、HPバー等を滑らかに見せる */
interface Disp {
  en: { hp: number; shield: number; guard: number; broken: boolean }[];
  hp: number[];
  guard: number[];
}

/** 図形描画(Graphics)または画像(Image)で表示するキャラ */
type Actor = Phaser.GameObjects.Graphics | Phaser.GameObjects.Image;

interface SkillBtn {
  member: number;
  /** 手札のカード実体ID(旧方式は0) */
  uid: number;
  skill: SkillDef;
  w: number;
  c: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  status: Phaser.GameObjects.Text;
  hover: boolean;
}

const EVENT_MS: Record<BattleEvent['type'], number> = {
  skill: 0, damage: 260, shield: 0, break: 600, chain: 1450, stunned: 550, recover: 500,
  guard: 250, heal: 300, taunt: 250, enemyAttack: 380, hurt: 450, down: 450,
  enemyDown: 300, disrupt: 650, reaction: 700, status: 350, dot: 450, wait: 300, enemyCharge: 650, enemyGuard: 600, canceled: 700, enemyHeal: 350,
};

const STATUS_TEXT: Record<'burn' | 'bleed' | 'freeze' | 'weaken' | 'charge' | 'focus', [string, string]> = {
  burn: ['火傷!', '#ff8a4c'], bleed: ['出血!', '#e0455a'], freeze: ['凍結!', '#8fd8ff'],
  weaken: ['弱体化!', '#c9a0ff'], charge: ['帯電!', '#ffe066'], focus: ['集中!', '#9cc7ff'],
};

export class BattleScene extends Phaser.Scene {
  private state!: BattleState;
  private node!: MapNode;
  private potionBtn!: Button;
  private resultShown = false;
  private dragBtn: SkillBtn | null = null;
  private justDragged = false;
  private ghost: Phaser.GameObjects.Container | null = null;
  private armed: SkillBtn | null = null; // タッチ操作: 1回目のタップで選択(詳細表示)、2回目で使用
  private tip!: Phaser.GameObjects.Container;
  private tipTitle!: Phaser.GameObjects.Text;
  private tipBody!: Phaser.GameObjects.Text;
  private disp!: Disp;
  private busy = false;
  private buttons: SkillBtn[] = [];

  private heroes: Actor[] = [];
  private heroBase: number[] = []; // 各キャラの基準スケール(画像は原寸→表示サイズの縮尺)
  private ev: EnemyView[] = [];
  /** 選択中の狙う敵 */
  private target = 0;
  private dragTarget = -1;
  private skipCut = new Set<BattleEvent>();
  private lastHandSig = '';
  private bars!: Phaser.GameObjects.Graphics;
  private hpTexts: Phaser.GameObjects.Text[] = [];
  private guardTexts: Phaser.GameObjects.Text[] = [];
  private hintText!: Phaser.GameObjects.Text;
  private hintOn = false;
  /** 今回の作戦(予約した行動)と、それを実行した後の状態(ボタンの可否・プレビューの基準) */
  private plan: PlanStep[] = [];
  private view!: BattleState;
  private executing = false;
  private planGfx!: Phaser.GameObjects.Graphics;
  private planTexts: Phaser.GameObjects.Text[] = [];
  private planCost: Phaser.GameObjects.Text[] = [];
  private planSummary!: Phaser.GameObjects.Text;
  private endLabel!: Phaser.GameObjects.Text;
  private waitBtns: Phaser.GameObjects.Container[] = [];
  private turnText!: Phaser.GameObjects.Text;
  private tags: Phaser.GameObjects.Text[] = [];
  private endBtn!: Phaser.GameObjects.Container;
  private endBtnBg!: Phaser.GameObjects.Graphics;
  private arrow!: Phaser.GameObjects.Graphics;
  private preview!: Phaser.GameObjects.Text;

  constructor() {
    super('Battle');
  }

  init(): void {
    this.busy = false;
    this.buttons = [];
    this.heroes = [];
    this.heroBase = [];
    this.ev = [];
    this.target = 0;
    this.hpTexts = [];
    this.guardTexts = [];
    this.tags = [];
    this.waitBtns = [];
    this.plan = [];
    this.executing = false;
    this.planTexts = [];
    this.planCost = [];
    this.resultShown = false;
    this.dragBtn = null;
    this.justDragged = false;
    this.ghost = null;
    this.armed = null;
  }

  create(): void {
    const run = game.run;
    if (!run || run.current === null) { this.scene.start('Town'); return; }
    this.node = run.map.nodes[run.current];
    this.state = startBattle(run, this.node);
    this.view = this.state;
    this.syncDisp();
    const s = this.state;
    drawBackground(this, W, H, bgKeyFor('Battle', { boss: this.node.type === 'boss', row: this.node.row, enemyId: s.enemies[0].def.id }));
    // スキルパネル領域を暗くして文字を読みやすくする（背景画像の上）
    this.add.rectangle(W / 2, 604, W, 232, 0x0b0908, 0.62).setDepth(-90);

    // --- パーティ（画像があればスプライト、無ければ図形描画） ---
    s.party.forEach((m, i) => {
      const g = this.makeHero(m.def.id, m.def.color, HERO_POS[i].x, HERO_POS[i].y);
      this.heroBase.push(g.base);
      this.heroes.push(g.actor);
      this.breatheHero(i, 1300 + i * 200);
      this.hpTexts.push(txt(this, HERO_POS[i].x, HERO_POS[i].y + 40, '', 14, '#fff', { fontStyle: 'bold' }).setOrigin(0.5).setDepth(6));
      this.guardTexts.push(txt(this, HERO_POS[i].x - 112, HERO_POS[i].y + 40, '', 16, '#fff', { fontStyle: 'bold' }).setOrigin(0.5).setDepth(6));
    });
    txt(this, HERO_POS[1].x, HERO_POS[1].y - 236, '後衛', 14, '#7b8798').setOrigin(0.5);
    txt(this, HERO_POS[0].x, HERO_POS[0].y - 236, '前衛', 14, '#7b8798').setOrigin(0.5);

    // --- 敵(1〜3体) ---
    this.bars = this.add.graphics().setDepth(5);
    const lay = ENEMY_LAYOUT[s.enemies.length] ?? ENEMY_LAYOUT[1];
    s.enemies.forEach((en, i) => this.buildEnemy(i, en, lay.xs[i], lay.k, s.enemies.length > 1));
    this.target = defaultTarget(s);

    this.turnText = txt(this, W / 2, 24, '', 22, '#f6e3b4', { fontStyle: 'bold' }).setOrigin(0.5);

    // --- スキルパネル ---
    s.party.forEach((m, mi) => {
      const px = PANEL_X[mi];
      const line = this.add.graphics();
      line.lineStyle(2, m.def.color, 0.8).lineBetween(px, 500, px + PANEL_W, 500);
      // デッキ戦闘では待機は手札のカード。ヘッダーの待機ボタンは旧方式のみ
      this.tags.push(txt(this, px + PANEL_W - (s.deckMode ? 0 : 104), 488, '', compact() ? 15 : 13, '#9fb0c8').setOrigin(1, 0.5));
      if (!s.deckMode) this.buildWait(mi, px + PANEL_W - 48, 487);
      txt(this, px, 486, `${m.def.name}（${m.def.position}）`, 17, hex(m.def.color), { fontStyle: 'bold' }).setOrigin(0, 0.5);
    });
    this.rebuildHand();

    // --- ターン終了 ---
    this.endBtnBg = this.add.graphics();
    this.endLabel = txt(this, 0, 0, 'ターン終了', 22, '#fff', { fontStyle: 'bold' }).setOrigin(0.5);
    this.endBtn = this.add.container(W / 2 + 20, 380, [this.endBtnBg, this.endLabel]);
    padHitArea(this.endBtn, 170, 54);
    onTap(this.endBtn, () => this.executePlan());
    this.endBtn.on('pointerover', () => this.paintEnd(true));
    this.endBtn.on('pointerout', () => this.paintEnd(false));
    if (!compact()) txt(this, W / 2 + 20, 414, 'Space', 12, '#7b8798').setOrigin(0.5);
    this.potionBtn = makeButton(this, W / 2 + 20, 452, 170, 40, '', () => this.drinkPotion(), { size: 15, color: 0x6fcf97 });

    const back = txt(this, 20, 14, '← 挑戦を諦める', 14, '#7b8798').setInteractive({ useHandCursor: true });
    onTap(back, () => { run.finished = 'defeat'; this.scene.start('RunEnd'); });
    // 初心者向けヒント(任意): 「今やるべきこと」を1行だけ表示。既定はOFF（パズル性を損なわないため）
    try { this.hintOn = localStorage.getItem('partyrogue.hint') === '1'; } catch { this.hintOn = false; }
    this.hintText = txt(this, W / 2, 56, '', compact() ? 18 : 16, '#9ff0c0', { fontStyle: 'bold', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(10);
    const hintBtn = txt(this, 20, 38, '', 14, '#9ff0c0').setInteractive({ useHandCursor: true });
    const paintHint = () => { hintBtn.setText(this.hintOn ? 'ヒント: ON' : 'ヒント: OFF').setColor(this.hintOn ? '#9ff0c0' : '#7b8798'); this.refreshHint(); };
    onTap(hintBtn, () => {
      this.hintOn = !this.hintOn;
      try { localStorage.setItem('partyrogue.hint', this.hintOn ? '1' : '0'); } catch { /* 保存できない環境では無視 */ }
      audio.play('ui_select');
      paintHint();
    });
    paintHint();
    this.input.keyboard?.on('keydown-M', () => audio.toggleMute());
    this.input.keyboard?.on('keydown-SPACE', () => this.executePlan());
    this.buildPlanPanel();

    this.arrow = this.add.graphics().setDepth(1500);
    // スキル詳細ツールチップ（コンパクト/タッチ時。小さな説明文の代わりに大きな文字で表示）
    const tipBg = this.add.graphics();
    tipBg.fillStyle(0x14110f, 0.94).fillRoundedRect(-330, -46, 660, 132, 12).lineStyle(3, COLORS.energy, 1).strokeRoundedRect(-330, -46, 660, 132, 12);
    this.tipTitle = txt(this, 0, -30, '', 22, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5, 0);
    this.tipBody = txt(this, 0, 2, '', 20, '#d8d0c4', { align: 'center', wordWrap: { width: 620, useAdvancedWrap: true } }).setOrigin(0.5, 0);
    this.tip = this.add.container(W / 2 - 40, 84, [tipBg, this.tipTitle, this.tipBody]).setDepth(1800).setVisible(false);
    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      // スキルボタン以外をタップしたら選択解除
      if (this.armed && !over.some((o) => this.buttons.some((b) => b.c === o))) this.disarm();
    });
    this.input.dragDistanceThreshold = 6;
    this.setupDrag();
    audio.playBgm(bgmForScene('Battle', { boss: this.node.type === 'boss' })); // ボス戦は専用BGM
    this.preview = txt(this, ENEMY.x + 100, ENEMY.y - 120, '', 34, '#ffffff', { fontStyle: 'bold', stroke: '#000', strokeThickness: 6, align: 'center' })
      .setOrigin(0.5).setDepth(1600).setAlpha(0);

    this.refreshAll();
  }

  // ------------------------------------------------------------------ 構築
  /** 敵1体分のスプライト・バー・予告表示を作る */
  private buildEnemy(i: number, en: BattleState['enemies'][number], x: number, k: number, multi: boolean): void {
    const y = multi ? ENEMY_Y - 26 : ENEMY_Y; // 複数編成は少し上へ(下の情報を行動パネルに被せない)
    const id = en.def.id;
    const spriteKey = enemySpriteKey(id);
    const withImg = hasImg(this, spriteKey);
    const dispH = (ENEMY_DISPLAY_H[id] ?? 200) * k;
    let gfx: Actor;
    let base = 1;
    if (withImg) {
      const img = this.add.image(x, y, spriteKey).setOrigin(0.5, 1);
      base = dispH / img.height;
      img.setScale(base);
      this.add.ellipse(x, y, img.displayWidth * 0.8, 24 * k, 0x000000, 0.35).setDepth(-1);
      gfx = img;
    } else {
      gfx = this.add.graphics().setPosition(x, y);
      gfx.setScale(k);
      base = k;
      drawEnemy(gfx, id, en.def.color);
    }
    this.tweens.add({ targets: gfx, scaleY: base * 0.94, scaleX: base * 1.04, duration: 1100 + i * 170, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const stars = this.add.container(x, y - (withImg ? dispH - 10 * k : 130 * k));
    for (let n = 0; n < 3; n++) {
      const a = (n / 3) * Math.PI * 2;
      stars.add(this.add.star(Math.cos(a) * 46 * k, Math.sin(a) * 12 * k, 5, 4 * k, 9 * k, 0xffe066));
    }
    this.tweens.add({ targets: stars, angle: 360, duration: 1400, repeat: -1 });
    stars.setVisible(false);
    const fs = (n: number): number => (compact() ? Math.max(16, Math.round(n * k)) : Math.max(11, Math.round(n * k)));
    const traitLines = en.def.traits?.text ?? [];
    const tag = multi ? `${ENEMY_TAG[i]} ` : '';
    txt(this, x, y + 98, tag + en.def.name + (traitLines.length ? ' ⓘ' : ''), fs(18), '#e8dfd3').setOrigin(0.5);
    txt(this, x, y + 98 + fs(18) + 4, `弱点:${ELEMENT_LABEL[en.def.weak]} 耐性:${ELEMENT_LABEL[en.def.resist]}`, fs(14), '#f6c453').setOrigin(0.5);
    // 敵の選択/特性表示(クリック・タップ): 狙う敵を切り替える
    const zone = this.add.zone(x, y - 90 * k, 300 * k, 330 * k).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => { if (!this.dragBtn && traitLines.length) this.showTipText(`${en.def.name}の特性`, traitLines.join('\n')); });
    zone.on('pointerout', () => { if (!this.armed) this.hideTip(); });
    onTap(zone, () => {
      if (en.hp <= 0 || this.dragBtn) return;
      this.target = i;
      audio.play('ui_select');
      if (traitLines.length) this.showTipText(`${en.def.name}の特性`, traitLines.join('\n'));
      this.time.delayedCall(3800, () => { if (!this.armed) this.hideTip(); });
      this.replan();
    });
    const barW = Math.max(120, Math.round(210 * k));
    const statusText = txt(this, x, y + 14, '', compact() ? 16 : Math.max(11, Math.round(14 * k)), '#ffd9a0', { fontStyle: 'bold', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(6);
    const hpText = txt(this, x, y + 36, '', 14, '#fff', { fontStyle: 'bold' }).setOrigin(0.5).setDepth(6);
    const shieldText = txt(this, x, y + 66, '', 13, '#3a2a00', { fontStyle: 'bold' }).setOrigin(0.5).setDepth(6);
    // 狙う敵の目印
    const marker = txt(this, x, y - dispH - 8, '▼', 26, '#00f2fe', { stroke: '#000', strokeThickness: 5 }).setOrigin(0.5, 1).setDepth(7).setVisible(false);
    this.tweens.add({ targets: marker, y: marker.y - 8, duration: 500, yoyo: true, repeat: -1 });
    // 行動予告
    const intentGfx = this.add.graphics();
    const intentValue = txt(this, 0, 36, '', 24, '#fff', { fontStyle: 'bold', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5);
    const intentLabel = txt(this, 0, 68, '', 15, '#e8dfd3', { stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
    const intentHint = txt(this, 0, 92, '', 14, '#ffe066', { fontStyle: 'bold', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
    const intentImg = this.add.image(0, 0, hasImg(this, 'icon_status_intent_attack') ? 'icon_status_intent_attack' : '__DEFAULT').setVisible(false);
    // 背の高い敵の頭に行動予告が被らないよう、敵の高さに合わせて位置を上げる
    const intentY = Math.max(66, y - (withImg ? dispH : 110 * k) - 72);
    const intentBox = this.add.container(x, withImg ? intentY : y - 245 * k, [intentGfx, intentImg, intentValue, intentLabel, intentHint]);
    intentBox.setScale(multi ? Math.max(0.78, k + 0.1) : 1);
    this.tweens.add({ targets: intentBox, y: intentBox.y - 10, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.ev.push({
      pos: { x, y }, k, base, gfx, stars, hpText, shieldText, statusText, intentBox, intentGfx, intentImg, intentValue, intentLabel, intentHint,
      marker, barW, dead: false,
    });
  }

  /** 待機ボタン: 行動を溜める(CD-1・ガード+5・次のスキル強化) */
  private buildWait(member: number, x: number, y: number): void {
    const w = compact() ? 92 : 88;
    const h = compact() ? 34 : 28;
    const bg = this.add.graphics();
    const label = txt(this, 0, 0, '待機', compact() ? 17 : 14, '#fff', { fontStyle: 'bold' }).setOrigin(0.5);
    const waitIcon = hasImg(this, 'icon_ui_wait') ? this.add.image(-w / 2 + 16, 0, 'icon_ui_wait').setDisplaySize(h - 8, h - 8) : null;
    if (waitIcon) label.setX(10);
    const c = this.add.container(x, y, [bg, label, ...(waitIcon ? [waitIcon] : [])]).setSize(w, h);
    const paint = (hover: boolean) => {
      const ok = !this.locked() && canWait(this.view, member);
      bg.clear();
      bg.fillStyle(ok ? (hover ? 0x3b4657 : 0x2d3748) : 0x1f2126, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 8);
      bg.lineStyle(2, ok ? 0x9cc7ff : 0x444a52, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
      c.setAlpha(ok ? 1 : 0.5);
    };
    c.setData('paint', paint);
    c.setInteractive({ useHandCursor: true });
    padHitArea(c, w, h);
    c.on('pointerover', () => {
      paint(true);
      if (!this.locked() && canWait(this.view, member)) this.showTipText('待機', WAIT_TEXT);
    });
    c.on('pointerout', () => { paint(false); if (!this.armed) this.hideTip(); });
    onTap(c, () => {
      this.addWait(member);
    });
    this.waitBtns.push(c);
    paint(false);
  }

  /** アイコンが一瞬ふくらんで消える */
  private iconPop(key: string, x: number, y: number, size: number): void {
    if (!hasImg(this, key)) return;
    const im = this.add.image(x, y, key).setDisplaySize(size, size).setDepth(3000).setAlpha(0);
    this.tweens.add({ targets: im, alpha: 1, y: y - 40, duration: 260, onComplete: () => this.tweens.add({ targets: im, alpha: 0, duration: 500, onComplete: () => im.destroy() }) });
  }

  /** 横並びスプライトシート(256×256×N)のエフェクトを1回再生する。画像が無ければ何もしない */
  private playFx(key: string, x: number, y: number, scale: number): void {
    if (!hasImg(this, key)) return;
    const tex = this.textures.get(key);
    const src = tex.getSourceImage() as HTMLImageElement;
    const n = Math.max(1, Math.floor(src.width / src.height));
    const fs = src.height;
    for (let i = 0; i < n; i++) if (!tex.has(String(i))) tex.add(String(i), 0, i * fs, 0, fs, fs);
    const im = this.add.image(x, y, key, '0').setScale(scale).setDepth(2700).setBlendMode(Phaser.BlendModes.ADD);
    let f = 0;
    this.time.addEvent({
      delay: 70, repeat: n - 1,
      callback: () => { im.setFrame(String(Math.min(f, n - 1))); f += 1; if (f >= n) this.time.delayedCall(70, () => im.destroy()); },
    });
  }

  /** 手札の署名(変わったら手札ボタンを作り直す) */
  private handSig(): string {
    return this.state.party.map((m) => m.deck.hand.map((c) => `${c.uid}:${c.sealed}`).join(',')).join('|');
  }

  /** 手札(旧方式は全スキル)に合わせて、スキルボタンを作り直す */
  private rebuildHand(): void {
    for (const b of this.buttons) { this.tweens.killTweensOf(b.c); b.c.destroy(); }
    this.buttons = [];
    this.armed = null;
    this.lastHandSig = this.handSig();
    this.state.party.forEach((m, mi) => {
      const px = PANEL_X[mi];
      const gap = 6;
      const n = Math.max(m.deck.hand.length, HAND_SIZE);
      const bw = (PANEL_W - gap * (n - 1)) / n;
      m.deck.hand.forEach((card, si) => this.buildButton(mi, SKILLS[card.defId], px + bw / 2 + si * (bw + gap), bw, card.uid));
    });
  }

  private buildButton(member: number, baseSkill: SkillDef, x: number, BTN_W: number, uid = 0): void {
    const cmp = compact();
    const level = this.state.party[member].levels[baseSkill.id] ?? 1;
    const skill = effectiveSkill(baseSkill, level);
    const bg = this.add.graphics();
    const col = skill.element !== 'none' ? ELEMENT_COLOR[skill.element] : skill.kind === 'support' ? 0x6fcf97 : 0xe9d8c4;
    const kindLabel = skill.aoe ? '全体' : skill.kind === 'support' ? '補助' : skill.kind === 'physical' ? '物理' : ELEMENT_LABEL[skill.element] + '魔法';
    // 名前は幅に収まらなければ折り返す（コンパクト時は最小16pxのため）
    const iconKey = skillIconKey(skill.id);
    const iconSize = cmp ? 40 : 50; // コンパクト時は文字が最小16pxになるため、アイコンを小さくして縦の余白を確保
    const icon = hasImg(this, iconKey) ? this.add.image(0, -BTN_H / 2 + iconSize / 2 + 6, iconKey).setDisplaySize(iconSize, iconSize) : null;
    const iy = icon ? (cmp ? 46 : 58) : 0; // アイコン分だけ下へずらす
    const title = txt(this, 0, -BTN_H / 2 + iy + (cmp ? 8 : 12), skill.name, cmp ? 16 : Math.min(16, Math.floor((BTN_W - 8) / Math.max(4, skill.name.length))), '#fff',
      { fontStyle: 'bold', align: 'center', wordWrap: { width: BTN_W - 8, useAdvancedWrap: true } }).setOrigin(0.5, 0);
    const chipW = cmp ? 62 : 44, chipH = cmp ? 24 : 18;
    const chipY = -BTN_H / 2 + iy + (cmp ? 52 : 40);
    const chip = this.add.graphics();
    chip.fillStyle(col, 1).fillRoundedRect(-BTN_W / 2 + 6, chipY, chipW, chipH, chipH / 2);
    const chipText = txt(this, -BTN_W / 2 + 6 + chipW / 2, chipY + chipH / 2, kindLabel, 11, '#111', { fontStyle: 'bold' }).setOrigin(0.5);
    const cd = txt(this, BTN_W / 2 - 6, chipY + chipH / 2, `${level > 1 ? `Lv${level} ` : ''}${this.state.deckMode ? (skill.cooldown > 0 ? `疲労${skill.cooldown}` : '') : `CD${skill.cooldown}`}`, 11, level > 1 ? '#ffe066' : '#9fb0c8').setOrigin(1, 0.5);
    // 説明: 通常は全文 / コンパクトは要点のみ（全文はタップ時にツールチップで表示）
    const hasCond = !!skill.conds?.length && BTN_W >= 130;
    const bodyText = cmp ? skillSummary(skill).join('\n') : (level > 1 ? skillSummary(skill).join(' / ') : skill.text) + (hasCond ? '\n◆条件で強化' : '');
    const body = txt(this, 0, chipY + chipH + 8, bodyText, cmp ? 16 : BTN_W < 130 ? 11 : 12, cmp ? '#ffd9a0' : '#e8dfd3', {
      align: cmp ? 'center' : 'left', fontStyle: cmp ? 'bold' : 'normal', wordWrap: { width: BTN_W - 14, useAdvancedWrap: true },
    }).setOrigin(0.5, 0);
    const status = txt(this, 0, BTN_H / 2 - 16, '', 13, '#fff', { fontStyle: 'bold' }).setOrigin(0.5);
    const badgeKey = level >= 3 ? 'ui_skillbtn_badge_lv3' : level === 2 ? 'ui_skillbtn_badge_lv2' : '';
    const badge = badgeKey && hasImg(this, badgeKey) ? this.add.image(BTN_W / 2 - 18, -BTN_H / 2 + 18, badgeKey).setDisplaySize(32, 32) : null;
    const c = this.add.container(x, BTN_Y, [bg, ...(icon ? [icon] : []), ...(badge ? [badge] : []), title, chip, chipText, cd, body, status]).setSize(BTN_W, BTN_H);
    c.setInteractive({ useHandCursor: true });
    const btn: SkillBtn = { member, uid, skill: baseSkill, c, bg, status, w: BTN_W, hover: false };
    this.buttons.push(btn);
    this.input.setDraggable(c);
    c.on('pointerover', () => {
      btn.hover = true;
      this.paintBtn(btn, true);
      if (this.dragBtn || this.armed) return;
      if (!this.locked() && canUse(this.view, member, skill.id)) {
        audio.play('hover');
        this.liftBtn(btn, true);
        this.showPreview(btn);
        this.showTip(btn);
      }
    });
    c.on('pointerout', () => {
      btn.hover = false;
      this.paintBtn(btn, false);
      if (this.dragBtn || this.armed === btn) return; // タッチで選択中は表示を維持
      if (this.armed) return;
      this.liftBtn(btn, false);
      this.clearPreview();
      this.hideTip();
    });
    c.on('pointerdown', () => {
      if (!this.locked() && canUse(this.view, member, skill.id)) this.tweens.add({ targets: c, scale: 0.95, duration: 60, ease: 'Quad.out' });
    });
    // 離したときに使用（ドラッグ終了時・画面遷移直後の指離しでは発火させない）
    let pressed = false;
    c.on('pointerdown', () => { pressed = true; });
    c.on('pointerup', (p: Phaser.Input.Pointer) => {
      const wasPressed = pressed;
      pressed = false;
      if (!wasPressed || this.justDragged || this.dragBtn) return;
      if (p.wasTouch && !this.locked() && canUse(this.view, member, skill.id) && this.armed !== btn) {
        this.arm(btn); // タッチ: 1回目は選択して効果を確認
        return;
      }
      this.disarm();
      this.liftBtn(btn, btn.hover);
      this.onSkill(btn);
    });
  }

  /** タッチ操作で1回目のタップ: スキルを選択(持ち上げ・予測ダメージ・詳細を表示) */
  private arm(b: SkillBtn): void {
    if (this.armed && this.armed !== b) this.liftBtn(this.armed, false);
    this.armed = b;
    audio.play('ui_select');
    this.liftBtn(b, true);
    this.showPreview(b);
    this.showTip(b, true);
  }

  private disarm(): void {
    if (!this.armed) return;
    const b = this.armed;
    this.armed = null;
    this.liftBtn(b, b.hover);
    this.clearPreview();
    this.hideTip();
  }

  private showTip(b: SkillBtn, armedHint = false): void {
    const lv = this.state.party[b.member].levels[b.skill.id] ?? 1;
    const eff = effectiveSkill(b.skill, lv);
    const conds = (eff.conds ?? []).map((c) => `◆${c.label}`);
    const body = lv > 1 ? skillSummary(eff).join(' / ') : b.skill.text;
    this.showTipText(b.skill.name + (lv > 1 ? ` Lv${lv}` : '') + (armedHint ? '　─ もう一度タップで使用 / 敵へドラッグ' : ''), [body, ...conds].join('\n'));
  }

  private showTipText(title: string, body: string): void {
    this.tip.setPosition(compact() ? W / 2 - 40 : 350, compact() ? 84 : 96);
    this.tipTitle.setText(title);
    this.tipBody.setText(body);
    this.tip.setVisible(true);
  }

  private hideTip(): void {
    this.tip.setVisible(false);
  }

  /** ホバー時にふわりと浮き上がる（離すと戻る） */
  private liftBtn(b: SkillBtn, on: boolean): void {
    this.tweens.killTweensOf(b.c);
    this.tweens.add({
      targets: b.c, y: on ? BTN_Y - 14 : BTN_Y, scale: on ? 1.06 : 1, duration: on ? 110 : 150, ease: on ? 'Cubic.out' : 'Cubic.inOut',
    });
    b.c.setDepth(on ? 50 : 0);
  }

  private syncDisp(): void {
    const s = this.state;
    this.disp = {
      en: s.enemies.map((e) => ({ hp: e.hp, shield: e.shield, guard: e.guard, broken: e.broken })),
      hp: s.party.map((m) => m.hp), guard: s.party.map((m) => m.guard),
    };
  }

  // ------------------------------------------------------------------ 描画更新
  private paintBtn(b: SkillBtn, hover: boolean): void {
    const m = this.view.party[b.member];
    const cdLeft = m.cooldowns[b.skill.id];
    const real = this.state.party[b.member];
    const card = real.deck.hand.find((c) => c.uid === b.uid);
    const sealed = this.state.deckMode && !!card && card.sealed > 0;
    // 予約済みか: 同名カードの何枚目かで判定(旧方式は種類で判定)
    const planned = this.plan.filter((st) => st.member === b.member && st.skillId === b.skill.id).length;
    const rank = this.buttons.filter((x) => x.member === b.member && x.skill.id === b.skill.id && x.uid < b.uid).length;
    const queued = this.state.deckMode ? rank < planned : planned > 0;
    const ok = !this.locked() && !queued && !sealed && canUse(this.view, b.member, b.skill.id);
    const col = m.def.color;
    const g = b.bg;
    const BTN_W = b.w;
    g.clear();
    g.fillStyle(0x000000, 0.4).fillRoundedRect(-BTN_W / 2 + 3, -BTN_H / 2 + 4, BTN_W, BTN_H, 10);
    g.fillStyle(ok ? (hover ? 0x3b4657 : 0x2d3748) : 0x1f2126, 1).fillRoundedRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 10);
    g.lineStyle(ok && hover ? 4 : 2, ok ? col : 0x444a52, 1).strokeRoundedRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 10);
    b.c.setAlpha(ok ? 1 : 0.55);
    if (!alive(m)) b.status.setText('戦闘不能').setColor('#ff7a7a');
    else if (queued) b.status.setText('予約中').setColor('#9ff0c0');
    else if (sealed) b.status.setText(`封印 あと${card!.sealed}ターン`).setColor('#d9a8ff');
    else if (cdLeft > 0) b.status.setText(`あと${cdLeft}ターン`).setColor('#ffb86b');
    else if (!this.state.deckMode && m.used.includes(b.skill.id)) b.status.setText('使用済み').setColor('#9fb0c8');
    else if (this.view.ap < skillCost(b.skill)) b.status.setText('AP不足').setColor('#ff9a9a');
    else b.status.setText('使用可能').setColor('#7be495');
  }

  private paintEnd(hover: boolean): void {
    const active = !this.locked() && this.state.phase === 'player';
    const g = this.endBtnBg;
    g.clear();
    g.fillStyle(active ? (hover ? 0x3f5578 : 0x2d3748) : 0x24272c, 1).fillRoundedRect(-85, -27, 170, 54, 12);
    g.lineStyle(3, active ? COLORS.energy : 0x555b63, 1).strokeRoundedRect(-85, -27, 170, 54, 12);
    this.endBtn.setAlpha(active ? 1 : 0.6);
  }

  private refreshButtons(): void {
    this.buttons.forEach((b) => this.paintBtn(b, b.hover));
    this.state.party.forEach((m, i) => {
      const buff = [m.focus ? '集中' : '', m.charged ? '帯電' : ''].filter(Boolean).join('・');
      const dk = m.deck;
      const nx = nextDraw(this.state, i);
      const pile = this.state.deckMode
        ? `山${dk.draw.length} 捨${dk.discard.length} 疲${dk.fatigued.length}${!compact() && nx ? ` 次:${SKILLS[nx].name}` : ''}`
        : '';
      this.tags[i].setText([!alive(m) ? '戦闘不能' : '', buff, pile].filter(Boolean).join('  '))
        .setColor(!alive(m) ? '#ff7a7a' : '#ffe066');
      (this.waitBtns[i]?.getData('paint') as ((h: boolean) => void) | undefined)?.(false);
    });
    this.endLabel.setText(this.plan.length ? '実行 ▶' : 'ターン終了').setColor(this.plan.length ? '#9ff0c0' : '#ffffff');
    this.paintEnd(false);
    this.refreshPotion();
  }

  private refreshPotion(): void {
    const run = game.run!;
    const s = this.state;
    this.potionBtn.setLabel(`ポーション ×${run.potions}`);
    this.potionBtn.setEnabled(!this.locked() && s.phase === 'player' && run.potions > 0 && s.party.some((m) => alive(m) && m.hp < m.maxHp));
  }

  private drinkPotion(): void {
    const run = game.run!;
    if (this.locked() || run.potions <= 0) return;
    const ev = usePotion(this.state);
    if (!ev) return;
    run.potions -= 1;
    this.busy = true;
    this.refreshButtons();
    this.playSeq(ev, () => { this.refreshAll(); });
  }

  private refreshIntent(): void {
    this.state.enemies.forEach((_, i) => this.refreshIntentOf(i));
  }

  private refreshIntentOf(ei: number): void {
    const v = this.ev[ei];
    const e = this.state.enemies[ei];
    const g = v.intentGfx;
    const s = this.state;
    g.clear();
    v.intentHint.setText('');
    if (s.phase === 'won' || e.hp <= 0 || v.dead) { v.intentBox.setVisible(false); return; }
    v.intentBox.setVisible(true);
    v.intentImg.setVisible(false);
    const it = currentIntent(s, ei);
    const next = nextIntent(s, ei);
    const ti = resolveTarget(s, it);
    const target = ti === -1 ? '全体' : s.party[ti].def.name;
    g.fillStyle(0x000000, 0.55).fillCircle(0, 0, 34);
    if (e.broken) {
      g.lineStyle(3, 0xffe066, 1).strokeCircle(0, 0, 34);
      v.intentValue.setText('BREAK').setColor('#ffe066').setFontSize(20);
      v.intentLabel.setText('行動不能');
      if (it.kind === 'heavy') v.intentHint.setText(`${it.name}を阻止!`).setColor('#7be495');
      else if (it.kind === 'charge') v.intentHint.setText(`溜めと${next.name}を阻止!`).setColor('#7be495');
      return;
    }
    const kind = it.kind ?? 'attack';
    const ring = kind === 'heavy' ? 0xff2d2d : kind === 'charge' ? 0xffa23c : kind === 'guard' ? 0x6fa8ff : kind === 'disrupt' ? 0xc58bff : 0xff5c5c;
    g.lineStyle(kind === 'heavy' ? 6 : 3, ring, 1).strokeCircle(0, 0, kind === 'heavy' ? 38 : 34);
    if (kind === 'attack' || kind === 'heavy') {
      const iconKey = kind === 'heavy' && hasImg(this, 'icon_status_intent_heavy') ? 'icon_status_intent_heavy'
        : it.target === 'all' ? 'icon_status_intent_attack_all' : 'icon_status_intent_attack';
      if (hasImg(this, iconKey)) v.intentImg.setTexture(iconKey).setDisplaySize(50, 50).setVisible(true);
      else drawSword(g, 0, 0, 52, 0xff8a8a);
      v.intentValue.setText(String(intentValue(s, it, ei))).setColor(kind === 'heavy' ? '#ff5c5c' : '#ff9a9a').setFontSize(kind === 'heavy' ? 28 : 24);
      v.intentLabel.setText(`${kind === 'heavy' ? '【強攻撃】' : ''}${it.name} → ${target}`);
      if (kind === 'heavy') v.intentHint.setText('ブレイクで阻止!').setColor('#ffe066');
      else if (next.kind === 'heavy' || next.kind === 'charge') v.intentHint.setText(`次→${next.name}`).setColor('#ffb86b');
    } else if (kind === 'charge') {
      if (hasImg(this, 'icon_status_intent_charge')) v.intentImg.setTexture('icon_status_intent_charge').setDisplaySize(50, 50).setVisible(true);
      else drawSword(g, 0, 0, 40, 0xffa23c);
      v.intentValue.setText('溜め').setColor('#ffb86b').setFontSize(22);
      v.intentLabel.setText(`${it.name} → 次は${next.name}`);
      v.intentHint.setText('溜め中にブレイクで両方阻止').setColor('#ffe066');
    } else if (kind === 'disrupt') {
      drawSword(g, 0, 0, 40, 0xc58bff);
      g.lineStyle(3, 0xc58bff, 1).strokeCircle(0, 0, 34);
      v.intentValue.setText('封印').setColor('#d9a8ff').setFontSize(22);
      v.intentLabel.setText(`${it.name} → ${target}`);
      v.intentHint.setText('スキルを1つ封印される').setColor('#ffe066');
    } else {
      if (hasImg(this, 'icon_status_intent_guard')) v.intentImg.setTexture('icon_status_intent_guard').setDisplaySize(50, 50).setVisible(true);
      else drawShield(g, 0, 0, 40, 0x6fa8ff);
      v.intentValue.setText(`+${it.guard ?? 0}`).setColor('#9cc7ff').setFontSize(24);
      v.intentLabel.setText(`${it.name}(防御)`);
      v.intentHint.setText(`次→${next.name}`).setColor('#ffb86b');
    }
  }

  /** 「今回の作戦」パネル: 行動ポイントと、予約した行動の順番を表示 */
  private buildPlanPanel(): void {
    const cx = W / 2 + 20;
    this.planGfx = this.add.graphics().setDepth(4);
    txt(this, cx - 120, 100, '今回の作戦', compact() ? 17 : 15, '#f6e3b4', { fontStyle: 'bold' }).setDepth(5);
    for (let k = 0; k < MAX_PLAN; k++) {
      const y = 134 + k * (compact() ? 52 : 46);
      this.planTexts.push(txt(this, cx - 100, y, '', compact() ? 16 : 15, '#ffffff', { fontStyle: 'bold' }).setOrigin(0, 0.5).setDepth(5));
      this.planCost.push(txt(this, cx + 112, y, '', 13, '#ffd166', { fontStyle: 'bold' }).setOrigin(1, 0.5).setDepth(5));
      const zone = this.add.zone(cx, y, 244, compact() ? 48 : 42).setInteractive({ useHandCursor: true }).setDepth(6);
      onTap(zone, () => {
        if (this.locked() || k >= this.plan.length) return;
        this.plan = removeStep(this.state, this.plan, k);
        audio.play('ui_cancel');
        this.replan();
      });
    }
    this.planSummary = txt(this, cx, 134 + MAX_PLAN * (compact() ? 52 : 46) - 8, '', compact() ? 16 : 13, '#9ff0c0', { align: 'center', fontStyle: 'bold', wordWrap: { width: 250, useAdvancedWrap: true } })
      .setOrigin(0.5, 0).setDepth(5);
  }

  private drawPlan(): void {
    if (!this.planGfx) return;
    const g = this.planGfx;
    const cx = W / 2 + 20;
    const rowH = compact() ? 52 : 46;
    g.clear();
    g.fillStyle(0x0b0908, 0.62).fillRoundedRect(cx - 130, 88, 260, 134 + MAX_PLAN * rowH - 88 + 70, 12);
    g.lineStyle(2, 0x4a5262, 1).strokeRoundedRect(cx - 130, 88, 260, 134 + MAX_PLAN * rowH - 88 + 70, 12);
    // 行動ポイント(●=残り / ◐=この作戦で使う分)
    const left = this.view.ap;
    const apMax = this.state.apMax;
    for (let i = 0; i < apMax; i++) {
      const x = cx + 30 + i * 26;
      const free = i < left;
      g.fillStyle(free ? COLORS.energy : 0x6b7686, free ? 1 : 0.5).fillCircle(x, 108, 9);
      g.lineStyle(2, 0xffffff, 0.8).strokeCircle(x, 108, 9);
    }
    for (let k = 0; k < MAX_PLAN; k++) {
      const y = 134 + k * rowH;
      const st = this.plan[k];
      const h = rowH - 6;
      g.fillStyle(st ? 0x2d3748 : 0x1a1d22, 0.95).fillRoundedRect(cx - 122, y - h / 2, 244, h, 8);
      if (st) {
        const m = this.state.party[st.member];
        g.fillStyle(m.def.color, 1).fillRoundedRect(cx - 122, y - h / 2, 6, h, 3);
        const name = st.skillId === WAIT_ID ? '待機' : SKILLS[st.skillId].name;
        const sk = st.skillId === WAIT_ID ? null : SKILLS[st.skillId];
        const tg = sk?.aoe ? '→全体' : this.state.enemies.length > 1 && sk && (sk.damage || sk.breakPower) && st.target !== undefined ? `→${ENEMY_TAG[st.target]}` : '';
        this.planTexts[k].setText(`${k + 1}  ${name}${tg}`).setColor('#ffffff');
        const cost = st.skillId === WAIT_ID ? 1 : skillCost(SKILLS[st.skillId]);
        this.planCost[k].setText(`AP${cost}`);
      } else {
        g.lineStyle(1, 0x4a5262, 1).strokeRoundedRect(cx - 122, y - h / 2, 244, h, 8);
        this.planTexts[k].setText(`${k + 1}  ─`).setColor('#5b6370');
        this.planCost[k].setText('');
      }
    }
    // 予想
    if (!this.plan.length) {
      this.planSummary.setText('スキルを選んで順番を組もう').setColor('#7b8798');
      return;
    }
    const sm = summarizePlan(this.state, this.plan);
    const parts = [`予想 -${sm.damage}`];
    if (sm.breakAt) parts.push(`${sm.breakAt}手目でBREAK`);
    if (sm.chains) parts.push('CHAIN!');
    if (sm.reactions.length) parts.push(sm.reactions.join('・'));
    if (sm.kills) parts.push('撃破!');
    this.planSummary.setText(parts.join('\n')).setColor(sm.chains || sm.kills ? '#ffb86b' : sm.breakAt ? '#ffe066' : '#9ff0c0');
  }

  private drawBars(): void {
    const g = this.bars;
    const s = this.state;
    const d = this.disp;
    g.clear();
    const bar = (cx: number, y: number, w: number, h: number, ratio: number, color: number) => {
      g.fillStyle(0x000000, 0.65).fillRoundedRect(cx - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4, 6);
      g.fillStyle(color, 1).fillRoundedRect(cx - w / 2, y - h / 2, Math.max(0, w * ratio), h, 5);
    };
    s.party.forEach((m, i) => {
      const p = HERO_POS[i];
      bar(p.x, p.y + 40, 150, 20, d.hp[i] / m.maxHp, alive(m) || d.hp[i] > 0 ? COLORS.hp : 0x444444);
      if (d.guard[i] > 0) {
        g.lineStyle(3, COLORS.block, 0.95).strokeRoundedRect(p.x - 77, p.y + 40 - 13, 154, 26, 7);
        drawShield(g, p.x - 112, p.y + 40, 44, COLORS.block);
      }
      this.hpTexts[i].setText(`${Math.max(0, d.hp[i])}/${m.maxHp}`);
      this.guardTexts[i].setText(d.guard[i] > 0 ? String(d.guard[i]) : '');
    });
    // 敵HP / シールドゲージ
    s.enemies.forEach((e, i) => {
      const v = this.ev[i];
      const de = d.en[i];
      const live = !v.dead && (de.hp > 0 || e.hp > 0);
      v.hpText.setVisible(live);
      v.shieldText.setVisible(live);
      v.statusText.setVisible(live);
      if (!live) return;
      bar(v.pos.x, v.pos.y + 36, v.barW, 20, de.hp / e.maxHp, COLORS.hp);
      bar(v.pos.x, v.pos.y + 66, v.barW, 18, de.broken ? 1 : de.shield / e.maxShield, de.broken ? 0xff5c5c : 0xf6c453);
      v.hpText.setText(`${Math.max(0, de.hp)}/${e.maxHp}`);
      v.shieldText.setText(de.broken ? 'BREAK!' : `シールド ${de.shield}/${e.maxShield}`).setColor(de.broken ? '#fff' : '#3a2a00');
      if (de.guard > 0) g.lineStyle(3, COLORS.block, 0.95).strokeRoundedRect(v.pos.x - v.barW / 2 - 2, v.pos.y + 36 - 13, v.barW + 4, 26, 7);
      // 狙う敵に選択マーカー(複数編成のときのみ)
      if (s.enemies.length > 1 && i === this.curTarget()) {
        g.lineStyle(3, COLORS.energy, 1).strokeRoundedRect(v.pos.x - v.barW / 2 - 7, v.pos.y + 36 - 17, v.barW + 14, 64, 9);
      }
      this.updateEnemySprite(i);
      this.refreshEnemyStatus(i);
    });
  }

  /** ブレイク中は気絶スプライト、竜は激昂で差し替え（画像があれば） */
  private updateEnemySprite(i: number): void {
    const v = this.ev[i];
    const de = this.disp.en[i];
    const e = this.state.enemies[i];
    const base = enemySpriteKey(e.def.id);
    let useStunned = false;
    if (base && v.gfx instanceof Phaser.GameObjects.Image) {
      let key = base;
      if (de.broken && hasImg(this, `${base}_stunned`)) { key = `${base}_stunned`; useStunned = true; }
      else if (isEnraged(e) && hasImg(this, `${base}_enraged`)) key = `${base}_enraged`;
      if (v.gfx.texture.key !== key) v.gfx.setTexture(key);
    }
    v.gfx.setAlpha(de.broken && !useStunned ? 0.75 : 1);
    v.stars.setVisible(de.broken && !useStunned);
  }

  private refreshEnemyStatus(i: number): void {
    const e = this.state.enemies[i];
    const de = this.disp.en[i];
    const parts: string[] = [];
    if (de.guard > 0) parts.push(`防御${de.guard}`);
    if (e.burn) parts.push(`火傷${e.burn.dmg}×${e.burn.turns}`);
    if (e.bleed) parts.push(`出血${e.bleed.dmg}×${e.bleed.turns}`);
    if (e.frozen) parts.push('凍結');
    if (e.weakened) parts.push('弱体');
    if (isEnraged(e)) parts.push('激昂');
    if (e.def.traits?.protects && !de.broken && this.state.enemies.length > 1) parts.push('守護');
    this.ev[i].statusText.setText(parts.join(' '));
  }

  private locked(): boolean {
    return this.busy || this.executing;
  }

  private refreshHint(): void {
    if (!this.hintText) return;
    const t = this.hintOn && !this.locked() ? recommend(this.view) : null;
    this.hintText.setText(t ? `おすすめ: ${t}` : '');
  }

  private refreshAll(): void {
    const tag = this.node.type === 'elite' ? ' ─ エリート' : this.node.danger ? ' ─ 危険な戦闘' : '';
    this.turnText.setText(`第${this.node.row + 1}階層 ─ ターン ${this.state.turn}${tag}`);
    if (this.handSig() !== this.lastHandSig) this.rebuildHand();
    this.drawBars();
    this.refreshButtons();
    this.refreshIntent();
    this.refreshHint();
  }

  // ------------------------------------------------------------------ 入力
  /** 点の下にいる生存中の敵(なければ -1) */
  private enemyAt(x: number, y: number): number {
    return this.ev.findIndex((v, i) => this.state.enemies[i].hp > 0 && !v.dead
      && Math.abs(x - v.pos.x) <= 150 * v.k && y >= v.pos.y - 230 * v.k && y <= v.pos.y + 40);
  }

  /** 選択中の狙う敵(倒れていたら先頭の生存者に切り替える) */
  private curTarget(): number {
    if (this.state.enemies[this.target]?.hp <= 0 || this.ev[this.target]?.dead) this.target = defaultTarget(this.state);
    return this.target;
  }

  private showPreview(b: SkillBtn, ti = this.curTarget()): void {
    if (this.locked() || !canUse(this.view, b.member, b.skill.id)) return;
    const sk = b.skill;
    if (!sk.damage && !sk.breakPower) return;
    const p = previewSkill(this.view, sk, b.member, ti);
    const from = HERO_POS[b.member];
    const ep = this.ev[ti].pos;
    this.preview.setPosition(ep.x + 100 * this.ev[ti].k, ep.y - 120);
    this.drawTargetLine(from.x, from.y - 150, ep.x, ep.y - 100, p.chain);
    const lines: string[] = [];
    if (p.hp > 0) lines.push(`-${p.hp}`);
    if (p.chain) lines.push('CHAIN!');
    else if (p.breaks) lines.push('BREAK!');
    else if (p.shield > 0) lines.push(`ゲージ-${p.shield}`);
    if (p.weak) lines.push('弱点');
    if (p.resist) lines.push('耐性');
    if (p.absorbed > 0) lines.push(`防御が${p.absorbed}吸収`);
    if (p.reaction) lines.push(`${p.reaction.name}!`);
    if (p.focus) lines.push('集中');
    if (p.charged) lines.push('帯電');
    if (sk.aoe) lines.push('全体攻撃');
    if (p.protectedBy) lines.push('守護で被ダメ-25%');
    for (const c of p.conds) lines.push(`◆${c}`);
    this.preview.setText(lines.join('\n')).setColor(p.chain ? '#ff9a3c' : p.breaks ? '#ffe066' : '#ffffff').setAlpha(0.95);
    this.preview.setFontSize(p.chain ? 40 : 30);
    if (lines.length > 4) this.preview.setFontSize(compact() ? 20 : 18);
  }

  private clearPreview(): void {
    this.arrow.clear();
    this.preview.setAlpha(0);
  }

  /** スキルをドラッグして敵にドロップ（補助スキルは上部へドロップ）。クリックでも使用可能。 */
  private setupDrag(): void {
    this.input.on('dragstart', (p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) => {
      const b = this.buttons.find((x) => x.c === obj);
      if (!b) return;
      if (this.locked() || !canUse(this.view, b.member, b.skill.id)) {
        audio.play('deny');
        this.tweens.add({ targets: obj, x: obj.x + 6, duration: 40, yoyo: true, repeat: 2 });
        return;
      }
      this.armed = null;
      this.hideTip();
      this.dragBtn = b;
      this.justDragged = true;
      audio.play('ui_select');
      this.tweens.killTweensOf(obj);
      this.tweens.add({ targets: obj, y: BTN_Y, scale: 0.94, alpha: 0.7, duration: 90 });
      // ポインタに追従するスキル名チップ
      const chip = this.add.graphics();
      chip.fillStyle(0x2d3748, 0.95).fillRoundedRect(-70, -18, 140, 36, 10);
      chip.lineStyle(3, this.state.party[b.member].def.color, 1).strokeRoundedRect(-70, -18, 140, 36, 10);
      this.ghost = this.add.container(p.x, p.y - 28, [chip, txt(this, 0, 0, b.skill.name, 15, '#fff', { fontStyle: 'bold' }).setOrigin(0.5)]).setDepth(1700);
      this.ghost.setScale(0.6);
      this.tweens.add({ targets: this.ghost, scale: 1, duration: 120, ease: 'Back.out' });
      this.showPreview(b);
    });
    this.input.on('drag', (p: Phaser.Input.Pointer) => {
      const b = this.dragBtn;
      if (!b) return;
      this.ghost?.setPosition(p.x, p.y - 28);
      const offensive = !!b.skill.damage || !!b.skill.breakPower;
      const from = HERO_POS[b.member];
      if (offensive) {
        const hov = this.enemyAt(p.x, p.y);
        const over = hov >= 0;
        const ti = over ? hov : this.curTarget();
        const pv = previewSkill(this.view, b.skill, b.member, ti);
        this.drawTargetLine(from.x, from.y - 150, p.x, p.y, over && pv.chain);
        this.ev.forEach((v, i) => v.gfx.setScale(v.base * (i === hov ? 1.08 : 1)));
        if (over && hov !== this.dragTarget) { this.dragTarget = hov; this.showPreview(b, hov); }
        this.preview.setAlpha(over ? 0.95 : 0.4);
      } else {
        const ok = p.y < PLAY_LINE_Y;
        const g = this.arrow;
        g.clear();
        g.lineStyle(3, ok ? 0x7be495 : 0x7b8798, 0.9).lineBetween(280, PLAY_LINE_Y, 1000, PLAY_LINE_Y);
        this.preview.setAlpha(0);
        this.ghost?.setAlpha(ok ? 1 : 0.7);
      }
    });
    this.input.on('dragend', (p: Phaser.Input.Pointer) => {
      const b = this.dragBtn;
      if (!b) return;
      this.dragBtn = null;
      this.time.delayedCall(80, () => { this.justDragged = false; });
      this.ghost?.destroy();
      this.ghost = null;
      this.clearPreview();
      this.ev.forEach((v) => v.gfx.setScale(v.base));
      this.dragTarget = -1;
      this.tweens.add({ targets: b.c, y: BTN_Y, scale: 1, alpha: 1, duration: 140, ease: 'Back.out' });
      b.c.setDepth(0);
      b.hover = false;
      const offensive = !!b.skill.damage || !!b.skill.breakPower;
      const hov = offensive ? this.enemyAt(p.x, p.y) : -1;
      const ok = offensive ? hov >= 0 : p.y < PLAY_LINE_Y;
      if (ok) this.onSkill(b, hov >= 0 ? hov : undefined);
      else this.tweens.add({ targets: b.c, x: b.c.x + 5, duration: 40, yoyo: true, repeat: 1 });
      this.paintBtn(b, false);
    });
  }

  /** スキル選択: 作戦に予約する(実際の処理は「実行」で順番に行う) */
  private onSkill(b: SkillBtn, target?: number): void {
    const offensive = !!b.skill.damage || !!b.skill.breakPower;
    if (offensive && target !== undefined) this.target = target;
    const st: PlanStep = { member: b.member, skillId: b.skill.id, target: offensive ? this.curTarget() : undefined };
    if (this.locked() || !canAppend(this.state, this.plan, st)) {
      audio.play('deny');
      this.tweens.add({ targets: b.c, x: b.c.x + 6, duration: 40, yoyo: true, repeat: 2 });
      return;
    }
    this.armed = null;
    this.hideTip();
    this.clearPreview();
    this.plan = appendStep(this.state, this.plan, st);
    audio.play('ui_select');
    this.replan();
  }

  private addWait(member: number): void {
    const st: PlanStep = { member, skillId: WAIT_ID };
    if (this.locked() || !canAppend(this.state, this.plan, st)) { audio.play('deny'); return; }
    this.disarm();
    this.hideTip();
    this.plan = appendStep(this.state, this.plan, st);
    audio.play('ui_select');
    this.replan();
  }

  /** 作戦を変更したら、実行後の状態を再計算して表示を更新する */
  private replan(): void {
    this.view = simulatePlan(this.state, this.plan).state;
    this.drawBars();
    this.refreshButtons();
    this.drawPlan();
    this.refreshHint();
  }

  /** 「実行」: 予約した手を順に処理し、最後にターンを終える(予約が空なら、そのままターン終了) */
  private executePlan(): void {
    const s = this.state;
    if (this.locked() || s.phase !== 'player') return;
    const steps = [...this.plan];
    this.plan = [];
    this.executing = true;
    this.disarm();
    this.hideTip();
    this.clearPreview();
    this.view = this.state;
    this.drawPlan();
    audio.play('ui_click');
    const run = (i: number): void => {
      if (i >= steps.length) { this.executing = false; this.endTurn(); return; }
      const st = steps[i];
      const next = (): void => {
        const p = this.state.phase;
        if (p === 'won' || p === 'lost') { this.executing = false; this.afterAction(); return; }
        this.time.delayedCall(160, () => run(i + 1));
      };
      if (st.skillId === WAIT_ID) {
        const ev = wait(this.state, st.member);
        if (!ev) { run(i + 1); return; }
        this.busy = true;
        this.refreshButtons();
        this.playSeq(ev, next);
        return;
      }
      this.performSkill(st, next);
    };
    run(0);
  }

  private performSkill(st: PlanStep, done: () => void): void {
    const s = this.state;
    const b = this.buttons.find((x) => x.member === st.member && x.skill.id === st.skillId);
    const ti = st.target !== undefined && s.enemies[st.target]?.hp > 0 ? st.target : defaultTarget(s);
    const tp = this.ev[ti].pos;
    const events = b ? useSkill(s, st.member, st.skillId, ti) : null;
    if (!b || !events) { done(); return; }
    this.busy = true;
    this.refreshButtons();
    const sk = b.skill;
    const hero = this.heroes[b.member];
    const p = HERO_POS[b.member];
    const offensive = !!sk.damage || !!sk.breakPower;
    if (sk.kind === 'physical') {
      this.playCue(castCue(sk));
      this.heroPose(b.member, 'attack', 520);
      this.tweens.add({
        targets: hero, x: tp.x - 150 * this.ev[ti].k, duration: 150, ease: 'Cubic.in', yoyo: true, hold: 60,
        onYoyo: () => this.playSeq(events, done), onComplete: () => { hero.x = p.x; },
      });
    } else if (offensive) {
      this.playCue(castCue(sk));
      this.heroPose(b.member, 'attack', 650);
      const col = ELEMENT_COLOR[sk.element];
      const orb = this.add.circle(p.x + 40, p.y - 160, 14, col).setDepth(2000);
      this.tweens.add({ targets: hero, y: p.y - 8, duration: 120, yoyo: true });
      if (sk.aoe) {
        // 全体攻撃: 他の敵にも魔力の弾が飛ぶ
        this.ev.forEach((v, i) => {
          if (i === ti || this.state.enemies[i].hp <= 0 && !events.some((x) => x.type === 'damage' && x.enemy === i)) return;
          const o2 = this.add.circle(p.x + 40, p.y - 160, 12, col).setDepth(2000);
          this.tweens.add({ targets: o2, x: v.pos.x, y: v.pos.y - 90, scale: 1.4, duration: 320, delay: 140, ease: 'Cubic.in', onComplete: () => o2.destroy() });
        });
      }
      this.tweens.add({
        targets: orb, x: tp.x, y: tp.y - 90, scale: 1.6, duration: 320, delay: 140, ease: 'Cubic.in',
        onComplete: () => { orb.destroy(); this.playSeq(events, done); },
      });
    } else {
      this.shieldRing(p.x, p.y - 100, sk.healAll ? 0x6fcf97 : COLORS.block);
      this.time.delayedCall(150, () => this.playSeq(events, done));
    }
  }

  /** 音IDと再生速度(Cue)を鳴らす */
  private playCue(cue: Cue | null): void {
    if (cue) audio.play(cue.id, { rate: cue.rate });
  }

  // ------------------------------------------------------------------ イベント再生
  /** イベントを種類ごとの所要時間で順に再生。完了後に表示値を state に同期する */
  private playSeq(events: BattleEvent[], onDone?: () => void): void {
    let t = 0;
    let seenChain = false;
    this.skipCut.clear();
    for (const e of events) {
      // 全体攻撃で複数の敵がチェインしても、カットインは最初の1回だけ(以降はダメージ表示のみ)
      const extraChain = e.type === 'chain' && seenChain;
      if (e.type === 'chain') { if (seenChain) this.skipCut.add(e); seenChain = true; }
      this.time.delayedCall(t, () => this.playEvent(e));
      t += extraChain ? 120 : EVENT_MS[e.type];
    }
    this.time.delayedCall(t + 120, () => {
      this.syncDisp();
      this.busy = false;
      this.refreshAll();
      if (onDone) onDone();
      else this.afterAction();
    });
  }

  private afterAction(): void {
    const p = this.state.phase;
    if (p === 'won') { this.time.delayedCall(800, () => this.showResult(true)); return; }
    if (p === 'lost') { this.showResult(false); return; }
  }

  private playEvent(e: BattleEvent): void {
    const d = this.disp;
    const en = 'enemy' in e && typeof e.enemy === 'number' ? e.enemy : 0;
    const V = this.ev[en];
    const de = d.en[en];
    const EX = V.pos.x;
    const EY = V.pos.y;
    switch (e.type) {
      case 'damage': {
        if (e.chain) break; // チェインは cut-in 側で演出
        de.hp -= e.amount;
        de.guard -= e.absorbed;
        impactCues(e).forEach((c) => this.playCue(c));
        const col = e.element === 'none' ? '#ffdf6b' : hex(ELEMENT_COLOR[e.element]);
        if (e.absorbed > 0) this.popup(EX - 110, EY - 110, `防御 -${e.absorbed}`, '#9cc7ff', 24);
        if (e.amount > 0) this.damagePopup(EX, EY - 140, e.amount, col, { weak: e.weak });
        if (e.weak) this.popup(EX + 100, EY - 185, '弱点!', '#ff9a3c', 26);
        if (e.resist) this.popup(EX + 100, EY - 185, '耐性', '#9fb0c8', 24);
        this.impact(e.amount, ELEMENT_COLOR[e.element] || 0xffd166, en);
        break;
      }
      case 'shield':
        de.shield = Math.max(0, de.shield - e.amount);
        break;
      case 'break': {
        de.broken = true;
        audio.play('fx_break');
        const sh = shakeFor(0, 'break');
        this.cameras.main.flash(150, 255, 255, 255);
        this.cameras.main.shake(sh.ms, sh.intensity);
        this.popup(EX - 150, EY - 150, 'BREAK!', '#ffe066', 70);
        this.shockwave(EX, EY - 70, 0xffe066);
        this.shards(EX, EY - 70, 0xffe066);
        this.sparks(EX, EY - 60, 0xffe066, 26);
        this.zoomPunch(1.05);
        this.hitStop(hitStopMs(0, 'break'));
        break;
      }
      case 'chain':
        if (this.skipCut.has(e)) {
          de.hp -= e.amount;
          this.damagePopup(EX, EY - 140, e.amount, hex(ELEMENT_COLOR[e.element]), { chain: true });
          this.impact(e.amount, ELEMENT_COLOR[e.element], en);
        } else this.cutIn(e.element, e.amount, en);
        break;
      case 'disrupt': {
        const hp = HERO_POS[e.member];
        audio.play('deny');
        this.popup(hp.x, hp.y - 230, `封印! ${SKILLS[e.skillId].name}`, '#d9a8ff', 30);
        this.shockwave(hp.x, hp.y - 100, 0xc58bff);
        this.cameras.main.flash(120, 197, 139, 255);
        break;
      }
      case 'guard':
        d.guard[e.member] += e.amount;
        audio.play('sup_guard');
        this.shieldRing(HERO_POS[e.member].x, HERO_POS[e.member].y - 90, COLORS.block);
        this.popup(HERO_POS[e.member].x, HERO_POS[e.member].y - 200, `+${e.amount} ガード`, '#9cc7ff', 26);
        break;
      case 'heal':
        d.hp[e.member] += e.amount;
        audio.play('sup_heal');
        this.popup(HERO_POS[e.member].x, HERO_POS[e.member].y - 200, `+${e.amount}`, '#7be495', 36);
        this.shieldRing(HERO_POS[e.member].x, HERO_POS[e.member].y - 90, 0x6fcf97);
        break;
      case 'taunt':
        audio.play('sup_taunt');
        this.popup(HERO_POS[e.member].x, HERO_POS[e.member].y - 230, '挑発!', '#ffb86b', 34);
        break;
      case 'stunned':
        this.popup(EX, EY - 150, '行動不能…', '#ffe066', 34);
        break;
      case 'recover':
        de.broken = false;
        de.shield = this.state.enemies[en].shield;
        this.popup(EX, EY - 110, 'シールド回復', '#f6c453', 22);
        break;
      case 'enemyAttack': {
        this.playCue(enemyAttackCue(this.state.enemies[en].def.id, e.intent));
        const to = e.target === -1 ? { x: (HERO_POS[0].x + HERO_POS[1].x) / 2 } : HERO_POS[e.target];
        this.tweens.add({ targets: V.gfx, x: to.x + 140, duration: 150, yoyo: true, ease: 'Cubic.in', hold: 40 });
        break;
      }
      case 'hurt': {
        const p = HERO_POS[e.member];
        d.hp[e.member] -= e.amount;
        d.guard[e.member] = Math.max(0, d.guard[e.member] - e.blocked);
        if (e.amount > 0) {
          this.playCue(hurtCue(e.amount));
          this.damagePopup(p.x, p.y - 190, e.amount, '#ff8a8a', {});
          this.sparks(p.x, p.y - 90, 0xff6b6b, sparkCount(e.amount));
          const sh = shakeFor(e.amount, 'hurt');
          this.cameras.main.shake(sh.ms, sh.intensity);
          if (shouldFlashHurt(e.amount)) this.cameras.main.flash(110, 255, 60, 60);
          this.heroPose(e.member, 'hit', 380);
          this.tweens.add({ targets: this.heroes[e.member], x: p.x - 18, duration: 50, yoyo: true, repeat: 2 });
          this.flashAdd(this.heroes[e.member]);
          this.hitStop(hitStopMs(e.amount, 'hurt'));
        } else {
          this.playCue(hurtCue(0));
          this.popup(p.x, p.y - 190, 'ガード!', '#9cc7ff', 32);
          this.shieldRing(p.x, p.y - 90, COLORS.block);
        }
        break;
      }
      case 'down':
        audio.play('party_down');
        if (HERO_SPRITE[this.state.party[e.member].def.id]?.down && hasImg(this, HERO_SPRITE[this.state.party[e.member].def.id]!.down)) this.heroPose(e.member, 'down');
        else this.tweens.add({ targets: this.heroes[e.member], alpha: 0.3, angle: -12, duration: 350 });
        this.popup(HERO_POS[e.member].x, HERO_POS[e.member].y - 230, '戦闘不能', '#ff7a7a', 28);
        break;
      case 'reaction': {
        const col = this.state.enemies[en].lastElement ? ELEMENT_COLOR[this.state.enemies[en].lastElement] : 0xffe066;
        audio.play('hit_weak');
        this.popup(EX, EY - 215, e.name + '!', '#ffffff', 44);
        this.playFx(`fx_reaction_${e.id}`, EX, EY - 100, 1.6);
        this.shockwave(EX, EY - 90, col);
        this.sparks(EX, EY - 90, col, 24);
        break;
      }
      case 'status': {
        const [label, color] = STATUS_TEXT[e.kind];
        const pos = e.kind === 'charge' || e.kind === 'focus' ? { x: HERO_POS[0].x, y: HERO_POS[0].y - 250 } : { x: EX + 90, y: EY - 170 };
        this.popup(pos.x, pos.y, label, color, 28);
        this.iconPop(`icon_status_${e.kind}`, pos.x - 70, pos.y, 40);
        break;
      }
      case 'dot':
        de.hp -= e.amount;
        this.popup(EX, EY - 130, `-${e.amount} ${e.kind === 'burn' ? '火傷' : '出血'}`, e.kind === 'burn' ? '#ff8a4c' : '#e0455a', 30);
        this.sparks(EX, EY - 70, e.kind === 'burn' ? 0xff8a4c : 0xe0455a, 8);
        break;
      case 'wait':
        audio.play('ui_select');
        this.popup(HERO_POS[e.member].x, HERO_POS[e.member].y - 230, '待機…', '#9cc7ff', 30);
        if (hasImg(this, 'fx_wait_aura')) {
          const a = this.add.image(HERO_POS[e.member].x, HERO_POS[e.member].y - 110, 'fx_wait_aura').setDepth(2400).setScale(1.3).setAlpha(0);
          this.tweens.add({ targets: a, alpha: 0.95, scale: 1.7, duration: 280, yoyo: true, onComplete: () => a.destroy() });
        }
        break;
      case 'enemyCharge':
        audio.play('en_dragon_claw');
        this.popup(EX, EY - 215, '力を溜めている…!', '#ffb86b', 34);
        this.tweens.add({ targets: V.gfx, scaleX: V.base * 1.12, scaleY: V.base * 1.12, duration: 220, yoyo: true });
        this.shockwave(EX, EY - 90, 0xffa23c);
        break;
      case 'enemyGuard':
        de.guard += e.amount;
        audio.play('sup_guard');
        this.popup(EX, EY - 215, `防御 +${e.amount}`, '#9cc7ff', 34);
        this.shieldRing(EX, EY - 100, COLORS.block);
        break;
      case 'canceled':
        audio.play('hit_resist');
        this.popup(EX, EY - 215, `${e.intent.name} 阻止!`, '#7be495', 40);
        break;
      case 'enemyHeal':
        de.hp += e.amount;
        audio.play('sup_heal');
        this.popup(EX, EY - 130, `+${e.amount}`, '#7be495', 30);
        break;
      case 'enemyDown':
        this.enemyDie(en);
        break;
      default:
        break;
    }
    this.drawBars();
  }

  /** 敵への命中演出: 火花・画面揺れ・ヒットストップ・発光・ノックバック */
  private impact(amount: number, color: number, en = 0): void {
    const V = this.ev[en];
    const sh = shakeFor(amount, 'hit');
    this.sparks(V.pos.x, V.pos.y - 70, color, sparkCount(amount));
    this.cameras.main.shake(sh.ms, sh.intensity);
    this.tweens.add({ targets: V.gfx, x: V.pos.x + 16 + Math.min(14, amount * 0.6), duration: 50, yoyo: true, repeat: 2 });
    this.flashAdd(V.gfx);
    if (amount >= 15) this.zoomPunch(1.03);
    this.hitStop(hitStopMs(amount, 'hit'));
  }

  /** キャラを生成。役職に画像があればスプライト(足元原点)、無ければ図形描画 */
  private makeHero(role: 'knight' | 'elementalist', color: number, x: number, y: number): { actor: Actor; base: number } {
    const sprite = HERO_SPRITE[role];
    if (sprite && hasImg(this, sprite.idle)) {
      const img = this.add.image(x, y, sprite.idle).setOrigin(0.5, 1);
      const base = HERO_DISPLAY_H / img.height; // 全ポーズ共通の縮尺（待機ポーズの高さ基準）
      img.setScale(base);
      this.add.ellipse(x, y, 130, 22, 0x000000, 0.35).setDepth(-1);
      return { actor: img, base };
    }
    const g = this.add.graphics().setPosition(x, y);
    drawHero(g, role, color, 1.15);
    return { actor: g, base: 1 };
  }

  private breatheHero(i: number, duration: number): void {
    const a = this.heroes[i];
    const b = this.heroBase[i];
    this.tweens.add({ targets: a, scaleY: b * 1.02, duration, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  /**
   * ポーズ画像があれば差し替える（idle以外は revertMs 後に待機へ戻す。down は戻さない）。
   * 差し替え中は呼吸の揺れを止め、戻すときに再開する。
   */
  private heroPose(i: number, pose: HeroPose, revertMs = 0): void {
    const a = this.heroes[i];
    const sprite = HERO_SPRITE[this.state.party[i].def.id];
    const key = sprite?.[pose];
    if (!(a instanceof Phaser.GameObjects.Image) || !sprite || !hasImg(this, key)) return;
    this.tweens.killTweensOf(a);
    a.setTexture(key).setScale(this.heroBase[i]);
    if (pose === 'idle') { this.breatheHero(i, 1300 + i * 200); return; }
    if (pose === 'down' || revertMs <= 0) return;
    this.time.delayedCall(revertMs, () => {
      if (!a.scene || this.state.party[i].hp <= 0) return;
      this.heroPose(i, 'idle');
    });
  }

  /** 一瞬だけ加算合成にして白く光らせる（画像アセット不要のヒット発光） */
  private flashAdd(g: Actor): void {
    g.setBlendMode(Phaser.BlendModes.ADD);
    this.time.delayedCall(70, () => g.setBlendMode(Phaser.BlendModes.NORMAL));
  }

  private zoomPunch(zoom: number): void {
    this.tweens.add({ targets: this.cameras.main, zoom, duration: 80, yoyo: true, ease: 'Quad.out' });
  }

  /** チェイン: 全画面カットイン + 大ダメージ演出（約1.3秒） */
  private cutIn(element: Element, amount: number, en = 0): void {
    const V = this.ev[en];
    const col = ELEMENT_COLOR[element];
    audio.play('fx_chain');
    audio.duck(0.3, 1.9); // カットイン中はBGMを下げる
    const D = 5000;
    const all: Phaser.GameObjects.GameObject[] = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { all.push(o); return o; };
    const dim = add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(D));
    const band = add(this.add.rectangle(W / 2, 330, W, 250, col, 0.92).setDepth(D + 1).setScale(1, 0.05));
    const stripe = add(this.add.rectangle(W / 2, 330, W, 214, 0x000000, 0.55).setDepth(D + 1).setScale(1, 0.05));
    // スピード線
    for (let i = 0; i < 14; i++) {
      const y = 230 + Math.random() * 200;
      const len = 260 + Math.random() * 520;
      const line = add(this.add.rectangle(W + len, y, len, 3, 0xffffff, 0.5).setDepth(D + 2));
      this.tweens.add({ targets: line, x: -len, duration: 260 + Math.random() * 240, delay: 120 + Math.random() * 300, repeat: 1 });
    }
    let hero: Actor;
    if (hasImg(this, 'cutin_elementalist_bust')) {
      // 立ち絵(胸像)が用意されていればカットインに使用
      const bust = this.add.image(-300, 600, 'cutin_elementalist_bust').setOrigin(0.5, 1).setDepth(D + 3);
      bust.setScale(560 / bust.height);
      hero = add(bust);
    } else {
      hero = add(this.add.graphics().setDepth(D + 3).setPosition(-260, 520));
      drawHero(hero, 'elementalist', 0x4a90e2, 2.2);
    }
    const title = add(txt(this, 800, 300, 'CHAIN!', 120, '#ffffff', { fontStyle: 'bold', stroke: hex(col), strokeThickness: 14 })
      .setOrigin(0.5).setDepth(D + 4).setScale(2.6).setAlpha(0).setAngle(-6));
    const sub = add(txt(this, W + 500, 388, `${ELEMENT_LABEL[element]}属性 ─ 属性爆発`, 30, hex(col), { fontStyle: 'bold', stroke: '#000', strokeThickness: 6 })
      .setOrigin(0.5).setDepth(D + 4));
    this.tweens.add({ targets: dim, fillAlpha: 0.68, duration: 150 });
    this.tweens.add({ targets: [band, stripe], scaleY: 1, duration: 200, ease: 'Back.out' });
    this.tweens.add({ targets: hero, x: 300, duration: 300, ease: 'Cubic.out', delay: 60 });
    this.tweens.add({ targets: title, scale: 1, alpha: 1, angle: 0, duration: 260, ease: 'Back.out', delay: 140 });
    this.tweens.add({ targets: sub, x: 800, duration: 300, ease: 'Cubic.out', delay: 240 });
    // 命中の瞬間: フラッシュ → ヒットストップ → ダメージ数字
    this.time.delayedCall(620, () => {
      this.cameras.main.flash(180, 255, 255, 255);
      const sh = shakeFor(amount, 'chain');
      this.cameras.main.shake(sh.ms, sh.intensity);
      const big = add(txt(this, W / 2, 476, `-${amount}`, 130, hex(col), { fontStyle: 'bold', stroke: '#000', strokeThickness: 14 })
        .setOrigin(0.5).setDepth(D + 5).setScale(0.3));
      this.tweens.add({ targets: big, scale: 1, duration: 180, ease: 'Back.out' });
      this.zoomPunch(1.06);
      this.hitStop(hitStopMs(amount, 'chain'));
    });
    // カットインを畳み、敵に大ダメージを反映
    this.time.delayedCall(1000, () => {
      this.disp.en[en].hp -= amount;
      this.drawBars();
      this.sparks(V.pos.x, V.pos.y - 70, col, 34);
      this.shockwave(V.pos.x, V.pos.y - 70, col);
      this.flashAdd(V.gfx);
      this.tweens.add({ targets: all, alpha: 0, duration: 280, onComplete: () => all.forEach((o) => o.destroy()) });
      this.damagePopup(V.pos.x, V.pos.y - 140, amount, hex(col), { chain: true });
      this.tweens.add({ targets: V.gfx, x: V.pos.x + 24, duration: 60, yoyo: true, repeat: 4 });
    });
  }

  /** 撃破演出(1体): 光の粒になって崩れ落ちる */
  private enemyDie(en: number): void {
    const v = this.ev[en];
    if (v.dead) return;
    v.dead = true;
    const e = this.state.enemies[en];
    this.playCue(deathCue(e.def.id));
    v.intentBox.setVisible(false);
    v.stars.setVisible(false);
    v.marker.setVisible(false);
    v.hpText.setVisible(false);
    v.shieldText.setVisible(false);
    v.statusText.setVisible(false);
    this.cameras.main.shake(320, 0.014);
    this.sparks(v.pos.x, v.pos.y - 80, e.def.color, 40);
    this.shockwave(v.pos.x, v.pos.y - 80, 0xffffff);
    this.tweens.killTweensOf(v.gfx);
    this.tweens.add({ targets: v.gfx, alpha: 0, scaleX: v.base * 1.3, scaleY: v.base * 0.4, angle: 6, duration: 700, ease: 'Cubic.in' });
  }

  private hitStop(ms: number): void {
    this.tweens.pauseAll();
    this.time.delayedCall(ms, () => this.tweens.resumeAll());
  }

  /** ダメージ数字: 大きく弾んで弧を描き、上へ消える */
  private damagePopup(x: number, y: number, amount: number, color: string, opts: { weak?: boolean; chain?: boolean }): void {
    const size = popupFontSize(amount, opts);
    const t = txt(this, x + Phaser.Math.Between(-18, 18), y, `-${amount}`, size, color, { fontStyle: 'bold', stroke: '#000', strokeThickness: Math.round(size / 8) + 3 })
      .setOrigin(0.5).setDepth(3000).setScale(0.2).setAngle(Phaser.Math.Between(-9, 9));
    const drift = Phaser.Math.Between(-36, 36);
    this.tweens.add({ targets: t, scale: 1.35, duration: 100, ease: 'Back.out', onComplete: () => this.tweens.add({ targets: t, scale: 1, duration: 110, ease: 'Quad.out' }) });
    this.tweens.add({ targets: t, x: t.x + drift, angle: 0, duration: 900, ease: 'Sine.out' });
    this.tweens.add({
      targets: t, y: y - 85, duration: 360, ease: 'Quad.out',
      onComplete: () => this.tweens.add({ targets: t, y: y - 45, alpha: 0, duration: 520, ease: 'Quad.in', onComplete: () => t.destroy() }),
    });
  }

  private popup(x: number, y: number, s: string, color: string, size: number): void {
    const t = txt(this, x, y, s, size, color, { fontStyle: 'bold', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setDepth(3000).setScale(0.4);
    this.tweens.add({ targets: t, scale: 1, duration: 130, ease: 'Back.out' });
    this.tweens.add({ targets: t, y: y - 60, alpha: 0, duration: 800, delay: 300, ease: 'Cubic.out', onComplete: () => t.destroy() });
  }

  private sparks(x: number, y: number, color: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const c = this.add.circle(x, y, Phaser.Math.Between(3, 6), color).setDepth(2500);
      const a = Math.random() * Math.PI * 2;
      const dist = Phaser.Math.Between(40, 140);
      this.tweens.add({
        targets: c, x: x + Math.cos(a) * dist, y: y + Math.sin(a) * dist + 20, alpha: 0, scale: 0.2,
        duration: 450, ease: 'Cubic.out', onComplete: () => c.destroy(),
      });
    }
  }

  /** ブレイク: ガラス片が飛び散る */
  private shards(x: number, y: number, color: number): void {
    for (let i = 0; i < 14; i++) {
      const s = Phaser.Math.Between(8, 18);
      const tri = this.add.triangle(x, y, 0, s, s, s, s / 2, 0, color, 0.95).setDepth(2600).setStrokeStyle(2, 0xffffff, 0.8);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 3.4;
      const dist = Phaser.Math.Between(90, 230);
      this.tweens.add({
        targets: tri, x: x + Math.cos(a) * dist, y: y + Math.sin(a) * dist + 60, angle: Phaser.Math.Between(-360, 360), alpha: 0,
        duration: 650, ease: 'Cubic.out', onComplete: () => tri.destroy(),
      });
    }
  }

  private shockwave(x: number, y: number, color: number): void {
    const c = this.add.circle(x, y, 30).setStrokeStyle(6, color, 1).setDepth(2550);
    this.tweens.add({ targets: c, scale: 6, alpha: 0, duration: 480, ease: 'Cubic.out', onComplete: () => c.destroy() });
  }

  private shieldRing(x: number, y: number, color: number): void {
    const c = this.add.circle(x, y, 40).setStrokeStyle(6, color, 1).setDepth(2500);
    this.tweens.add({ targets: c, scale: 3, alpha: 0, duration: 450, ease: 'Cubic.out', onComplete: () => c.destroy() });
  }

  /** 矢印ターゲット線（ベジェ曲線＋矢じり） */
  private drawTargetLine(x0: number, y0: number, x1: number, y1: number, hot: boolean): void {
    const g = this.arrow;
    g.clear();
    const color = hot ? 0xff9a3c : COLORS.energy;
    const curve = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(x0, y0),
      new Phaser.Math.Vector2((x0 + x1) / 2, Math.min(y0, y1) - 120),
      new Phaser.Math.Vector2(x1, y1),
    );
    const pts = curve.getPoints(28);
    for (let i = 1; i < pts.length - 2; i++) {
      const t = i / pts.length;
      g.fillStyle(color, 0.35 + 0.65 * t).fillCircle(pts[i].x, pts[i].y, 3 + t * 6);
    }
    const a = pts[pts.length - 1], b = pts[pts.length - 4];
    const ang = Math.atan2(a.y - b.y, a.x - b.x);
    g.fillStyle(color, 1).fillTriangle(
      a.x + Math.cos(ang) * 8, a.y + Math.sin(ang) * 8,
      a.x + Math.cos(ang + 2.6) * 34, a.y + Math.sin(ang + 2.6) * 34,
      a.x + Math.cos(ang - 2.6) * 34, a.y + Math.sin(ang - 2.6) * 34,
    );
  }

  // ------------------------------------------------------------------ ターン進行
  private endTurn(): void {
    const s = this.state;
    if (this.locked() || s.phase !== 'player') return;
    this.busy = true;
    this.disarm();
    this.clearPreview();
    audio.play('ui_click');
    const events = endPlayerTurn(s);
    this.refreshButtons();
    this.playSeq(events, () => {
      const p = this.state.phase;
      if (p === 'won' || p === 'lost') { this.showResult(p === 'won'); return; }
      audio.play('turn');
      this.plan = [];
      this.replan();
    });
  }

  private showResult(won: boolean): void {
    if (this.resultShown) return;
    this.resultShown = true;
    this.busy = true;
    const run = game.run!;
    const reward = finishBattle(run, this.state, this.node); // HP持ち越し・報酬付与・ラン終了判定
    // 勝利ジングルは通常戦闘のみ（ボス撃破は結果画面で踏破ジングル）。BGMは止めてジングルを聴かせる
    audio.playBgm(null, 0.4);
    if (!won) audio.play('jg_lose');
    else if (!run.finished) audio.play('jg_win');
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.65).setDepth(6000).setInteractive();
    const boss = this.node.type === 'boss';
    const title = txt(this, W / 2, 240, won ? (boss ? 'ボス撃破!' : '勝利!') : '全滅…', 84, won ? '#f6e3b4' : '#ff7a7a', {
      fontStyle: 'bold', stroke: '#000', strokeThickness: 10,
    }).setOrigin(0.5).setDepth(6001).setScale(0.3);
    this.tweens.add({ targets: title, scale: 1, duration: 400, ease: 'Back.out' });
    if (won) {
      txt(this, W / 2, 340, `+${reward.gold} G　　+${reward.stones + (run.finished === 'victory' ? 20 : 0)} 魔導石`, 26, '#ffe066', { fontStyle: 'bold' })
        .setOrigin(0.5).setDepth(6001);
    }
    const next = () => {
      if (run.finished) this.scene.start('RunEnd', { jingleDone: !won });
      else {
        const after = reward.cards?.length
          ? { scene: 'CardReward', data: { cards: reward.cards, returnTo: { scene: 'Map' } } }
          : { scene: 'Map' };
        this.scene.start('Loot', { title: '戦利品', reward, returnTo: after });
      }
    };
    makeButton(this, W / 2, 440, 300, 60, won ? '戦利品へ' : '結果へ', () => { audio.play('ui_click'); next(); }, { size: 26 }).c.setDepth(6001);
  }
}

const alive = (m: { hp: number }): boolean => m.hp > 0;
