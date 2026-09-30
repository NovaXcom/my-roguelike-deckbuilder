import Phaser from 'phaser';
import { audio } from '../audio';
import {
  BattleEvent, BattleState, canPlay, createBattle, currentIntent, endPlayerTurn, playCard, startPlayerTurn,
} from '../core/battle';
import type { CharacterId, Intent } from '../core/types';
import { COLORS, drawBackground, drawHero, drawShield, drawSlime, drawSword, txt } from '../ui/art';
import { CARD_H, CardView } from '../ui/CardView';
import { H, W } from './TitleScene';

const PLAYER = { x: 300, y: 430 };
const ENEMY = { x: 960, y: 430 };
const DRAW_PILE = { x: 80, y: 640 };
const DISCARD_PILE = { x: 1200, y: 640 };
const PLAY_LINE_Y = 470; // これより上でドロップすると自分対象カードを使用
const HAND_Y = 595;
const enemyRect = new Phaser.Geom.Rectangle(ENEMY.x - 130, ENEMY.y - 200, 260, 230);

interface InitData {
  characterId: CharacterId;
  seed: number;
}

export class BattleScene extends Phaser.Scene {
  private state!: BattleState;
  private init_!: InitData;
  private views = new Map<number, CardView>();
  private busy = false;
  private dragging: CardView | null = null;
  private overEnemy = false;

  private arrow!: Phaser.GameObjects.Graphics;
  private bars!: Phaser.GameObjects.Graphics;
  private hero!: Phaser.GameObjects.Graphics;
  private enemyGfx!: Phaser.GameObjects.Graphics;
  private intentBox!: Phaser.GameObjects.Container;
  private intentGfx!: Phaser.GameObjects.Graphics;
  private intentText!: Phaser.GameObjects.Text;
  private playerHpText!: Phaser.GameObjects.Text;
  private enemyHpText!: Phaser.GameObjects.Text;
  private playerBlockText!: Phaser.GameObjects.Text;
  private enemyBlockText!: Phaser.GameObjects.Text;
  private energyGfx!: Phaser.GameObjects.Graphics;
  private energyText!: Phaser.GameObjects.Text;
  private drawCount!: Phaser.GameObjects.Text;
  private discardCount!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private endBtn!: Phaser.GameObjects.Container;
  private endBtnBg!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Battle');
  }

  init(data: InitData): void {
    this.init_ = data;
    this.views = new Map();
    this.busy = false;
    this.dragging = null;
    this.overEnemy = false;
  }

  create(): void {
    this.state = createBattle(this.init_.characterId, this.init_.seed);
    const ch = this.state.character;
    drawBackground(this, W, H);

    // --- キャラクター/敵 ---
    this.hero = this.add.graphics().setPosition(PLAYER.x, PLAYER.y);
    drawHero(this.hero, ch.id, ch.color, 1.35);
    this.enemyGfx = this.add.graphics().setPosition(ENEMY.x, ENEMY.y);
    drawSlime(this.enemyGfx, this.state.enemy.def.color);
    this.tweens.add({ targets: this.hero, scaleY: 1.02, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.tweens.add({ targets: this.enemyGfx, scaleY: 0.94, scaleX: 1.04, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    txt(this, ENEMY.x, ENEMY.y + 78, this.state.enemy.def.name, 18, '#e8dfd3').setOrigin(0.5);
    txt(this, PLAYER.x, PLAYER.y + 78, ch.name, 18, '#e8dfd3').setOrigin(0.5);

    // --- HP / ブロック ---
    this.bars = this.add.graphics();
    this.playerHpText = txt(this, PLAYER.x, PLAYER.y + 50, '', 14, '#fff', { fontStyle: 'bold' }).setOrigin(0.5);
    this.enemyHpText = txt(this, ENEMY.x, ENEMY.y + 50, '', 14, '#fff', { fontStyle: 'bold' }).setOrigin(0.5);
    this.playerBlockText = txt(this, PLAYER.x - 118, PLAYER.y + 50, '', 16, '#fff', { fontStyle: 'bold' }).setOrigin(0.5);
    this.enemyBlockText = txt(this, ENEMY.x - 118, ENEMY.y + 50, '', 16, '#fff', { fontStyle: 'bold' }).setOrigin(0.5);

    // --- インテント ---
    this.intentGfx = this.add.graphics();
    this.intentText = txt(this, 0, 34, '', 24, '#fff', { fontStyle: 'bold', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5);
    this.intentBox = this.add.container(ENEMY.x, ENEMY.y - 250, [this.intentGfx, this.intentText]);
    this.tweens.add({ targets: this.intentBox, y: ENEMY.y - 260, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // --- エナジー / 山札 / 捨て札 / ターン ---
    this.energyGfx = this.add.graphics();
    this.energyText = txt(this, 110, 530, '', 34, '#06222a', { fontStyle: 'bold' }).setOrigin(0.5);
    txt(this, 110, 585, 'エナジー', 14, '#00f2fe').setOrigin(0.5);
    this.drawCount = this.buildPile(DRAW_PILE.x, DRAW_PILE.y, '山札');
    this.discardCount = this.buildPile(DISCARD_PILE.x, DISCARD_PILE.y, '捨て札');
    this.turnText = txt(this, W / 2, 24, '', 22, '#f6e3b4', { fontStyle: 'bold' }).setOrigin(0.5);

    // --- ターン終了ボタン ---
    this.endBtnBg = this.add.graphics();
    this.endBtn = this.add.container(1130, 520, [
      this.endBtnBg,
      txt(this, 0, 0, 'ターン終了', 22, '#fff', { fontStyle: 'bold' }).setOrigin(0.5),
    ]);
    this.endBtn.setSize(180, 56).setInteractive({ useHandCursor: true });
    this.endBtn.on('pointerdown', () => this.endTurn());
    this.endBtn.on('pointerover', () => this.paintEndBtn(true));
    this.endBtn.on('pointerout', () => this.paintEndBtn(false));

    // --- その他 UI ---
    const back = txt(this, 20, 14, '← タイトルへ', 14, '#7b8798').setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.scene.start('Title'));
    const mute = txt(this, W - 20, 14, 'M: ミュート切替', 14, '#7b8798').setOrigin(1, 0);
    this.input.keyboard?.on('keydown-M', () => mute.setText(audio.toggleMute() ? 'M: ミュート中' : 'M: ミュート切替'));
    this.input.keyboard?.on('keydown-E', () => this.endTurn());

    this.arrow = this.add.graphics().setDepth(1500);

    this.setupDrag();

    // --- 開始 ---
    const ev = startPlayerTurn(this.state);
    this.playSfx(ev);
    this.refresh();
    this.syncHand(true);
  }

  // ------------------------------------------------------------------ UI 構築
  private buildPile(x: number, y: number, label: string): Phaser.GameObjects.Text {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.4);
    g.fillRoundedRect(x - 34, y - 46, 68, 92, 8);
    g.fillStyle(0x3a2f55, 1);
    g.fillRoundedRect(x - 36, y - 50, 68, 92, 8);
    g.lineStyle(3, 0x8a55b8, 1);
    g.strokeRoundedRect(x - 36, y - 50, 68, 92, 8);
    g.lineStyle(2, 0x8a55b8, 0.6);
    g.strokeRoundedRect(x - 28, y - 42, 52, 76, 5);
    txt(this, x, y + 60, label, 13, '#c9b8e8').setOrigin(0.5);
    return txt(this, x - 2, y - 4, '0', 28, '#fff', { fontStyle: 'bold', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
  }

  private paintEndBtn(hover: boolean): void {
    const active = !this.busy && this.state.phase === 'player';
    const g = this.endBtnBg;
    g.clear();
    g.fillStyle(active ? (hover ? 0x3f5578 : 0x2d3748) : 0x24272c, 1);
    g.fillRoundedRect(-90, -28, 180, 56, 12);
    g.lineStyle(3, active ? COLORS.energy : 0x555b63, 1);
    g.strokeRoundedRect(-90, -28, 180, 56, 12);
    this.endBtn.setAlpha(active ? 1 : 0.6);
  }

  /** ステータス表示を state から再描画 */
  private refresh(): void {
    const s = this.state;
    this.drawBar(PLAYER.x, PLAYER.y + 50, s.player.hp, s.player.maxHp, s.player.block, this.playerBlockText, true);
    this.drawBar(ENEMY.x, ENEMY.y + 50, s.enemy.hp, s.enemy.maxHp, s.enemy.block, this.enemyBlockText, false);
    this.playerHpText.setText(`${s.player.hp}/${s.player.maxHp}`);
    this.enemyHpText.setText(`${s.enemy.hp}/${s.enemy.maxHp}`);
    this.drawCount.setText(String(s.drawPile.length));
    this.discardCount.setText(String(s.discardPile.length));
    this.turnText.setText(`ターン ${s.turn}`);
    this.drawEnergy();
    this.drawIntent();
    this.paintEndBtn(false);
    // プレイ可能表示
    s.hand.forEach((inst, i) => this.views.get(inst.uid)?.setPlayable(canPlay(s, i)));
  }

  private barsDrawn: { x: number; y: number; hp: number; max: number; block: number; player: boolean }[] = [];
  private drawBar(x: number, y: number, hp: number, max: number, block: number, blockText: Phaser.GameObjects.Text, player: boolean): void {
    // 2本分を1つの Graphics で管理
    this.barsDrawn = this.barsDrawn.filter((b) => b.player !== player);
    this.barsDrawn.push({ x, y, hp, max, block, player });
    const g = this.bars;
    g.clear();
    for (const b of this.barsDrawn) {
      const w = 180, h = 20;
      g.fillStyle(0x000000, 0.6);
      g.fillRoundedRect(b.x - w / 2 - 2, b.y - h / 2 - 2, w + 4, h + 4, 6);
      g.fillStyle(COLORS.hp, 1);
      g.fillRoundedRect(b.x - w / 2, b.y - h / 2, Math.max(0, (w * b.hp) / b.max), h, 5);
      if (b.block > 0) {
        drawShield(g, b.x - 118, b.y, 44, COLORS.block);
        g.lineStyle(3, COLORS.block, 0.9);
        g.strokeRoundedRect(b.x - w / 2 - 3, b.y - h / 2 - 3, w + 6, h + 6, 7);
      }
    }
    blockText.setText(block > 0 ? String(block) : '').setDepth(5);
  }

  private drawEnergy(): void {
    const g = this.energyGfx;
    const s = this.state;
    g.clear();
    g.fillStyle(COLORS.energy, 0.18);
    g.fillCircle(110, 530, 62);
    g.fillStyle(COLORS.energy, 0.3);
    g.fillCircle(110, 530, 54);
    g.fillStyle(s.energy > 0 ? COLORS.energy : 0x56636a, 1);
    g.fillCircle(110, 530, 46);
    g.lineStyle(4, 0xffffff, 0.8);
    g.strokeCircle(110, 530, 46);
    this.energyText.setText(`${s.energy}/${s.maxEnergy}`).setFontSize(s.energy > 9 ? 26 : 32);
  }

  private drawIntent(): void {
    const g = this.intentGfx;
    g.clear();
    const s = this.state;
    if (s.phase === 'won') {
      this.intentBox.setVisible(false);
      return;
    }
    this.intentBox.setVisible(true);
    const it: Intent = currentIntent(s);
    g.fillStyle(0x000000, 0.55);
    g.fillCircle(0, 0, 34);
    if (it.kind === 'attack') {
      g.lineStyle(3, 0xff5c5c, 1);
      g.strokeCircle(0, 0, 34);
      drawSword(g, 0, 0, 52, 0xff8a8a);
      this.intentText.setText(String(it.value)).setColor('#ff9a9a');
    } else if (it.kind === 'defend') {
      g.lineStyle(3, COLORS.block, 1);
      g.strokeCircle(0, 0, 34);
      drawShield(g, 0, 0, 50, COLORS.block);
      this.intentText.setText(String(it.value)).setColor('#9cc7ff');
    } else {
      g.lineStyle(3, COLORS.gold, 1);
      g.strokeCircle(0, 0, 34);
      this.intentText.setText('?').setColor('#f6c453');
    }
  }

  // ------------------------------------------------------------------ 手札
  private handPositions(n: number): { x: number; y: number; rot: number }[] {
    const spacing = Math.min(142, 640 / Math.max(1, n));
    const mid = (n - 1) / 2;
    return Array.from({ length: n }, (_, i) => {
      const d = i - mid;
      return { x: W / 2 + d * spacing, y: HAND_Y + d * d * 4, rot: d * 0.045 };
    });
  }

  /** state.hand に合わせて CardView を生成し、扇状に配置（新規カードは山札からスライドイン） */
  private syncHand(deal: boolean): void {
    const hand = this.state.hand;
    const pos = this.handPositions(hand.length);
    let fresh = 0;
    hand.forEach((inst, i) => {
      let v = this.views.get(inst.uid);
      const isNew = !v;
      if (!v) {
        v = new CardView(this, inst);
        v.setPosition(DRAW_PILE.x, DRAW_PILE.y).setScale(0.3).setAlpha(0).setRotation(-0.6);
        this.views.set(inst.uid, v);
        this.bindCard(v);
      }
      v.hx = pos[i].x;
      v.hy = pos[i].y;
      v.hrot = pos[i].rot;
      v.hscale = 1;
      v.hovered = false;
      v.setDepth(i);
      this.tweens.killTweensOf(v);
      const delay = isNew ? (fresh++) * (deal ? 90 : 70) : 0;
      this.tweens.add({
        targets: v, x: v.hx, y: v.hy, rotation: v.hrot, scale: 1, alpha: 1,
        duration: 320, delay, ease: 'Cubic.out',
        onStart: () => { if (isNew) audio.play('draw'); },
      });
    });
    this.refresh();
  }

  private bindCard(v: CardView): void {
    v.setInteractive({ useHandCursor: true, draggable: true });
    this.input.setDraggable(v);
    v.on('pointerover', () => {
      if (this.busy || this.dragging) return;
      v.hovered = true;
      v.setDepth(500);
      this.tweens.killTweensOf(v);
      this.tweens.add({ targets: v, y: v.hy - 95, scale: 1.3, rotation: 0, duration: 140, ease: 'Cubic.out' });
    });
    v.on('pointerout', () => {
      if (this.dragging === v) return;
      if (!v.hovered) return;
      v.hovered = false;
      v.setDepth(this.state.hand.findIndex((c) => c.uid === v.inst.uid));
      this.tweens.killTweensOf(v);
      this.tweens.add({ targets: v, x: v.hx, y: v.hy, scale: 1, rotation: v.hrot, duration: 160, ease: 'Cubic.out' });
    });
  }

  private setupDrag(): void {
    this.input.on('dragstart', (_p: Phaser.Input.Pointer, obj: CardView) => {
      const idx = this.state.hand.findIndex((c) => c.uid === obj.inst.uid);
      if (this.busy || idx < 0 || !canPlay(this.state, idx)) {
        this.denyFeedback(obj, this.state.energy < obj.def.cost ? 'エナジー不足' : '');
        return;
      }
      this.dragging = obj;
      this.tweens.killTweensOf(obj);
      obj.setDepth(1000).setRotation(0);
      if (obj.def.target === 'enemy') {
        this.tweens.add({ targets: obj, x: obj.hx, y: obj.hy - 90, scale: 1.2, duration: 100 });
      } else {
        obj.setScale(1.15);
      }
    });
    this.input.on('drag', (p: Phaser.Input.Pointer, obj: CardView, dragX: number, dragY: number) => {
      if (this.dragging !== obj) return;
      if (obj.def.target === 'self') {
        obj.setPosition(dragX, dragY);
        obj.setGlow(p.y < PLAY_LINE_Y);
      } else {
        this.overEnemy = Phaser.Geom.Rectangle.Contains(enemyRect, p.x, p.y);
        obj.setGlow(this.overEnemy);
        this.drawTargetLine(obj.x, obj.y - CARD_H * 0.6, p.x, p.y, this.overEnemy);
        this.enemyGfx.setScale(this.overEnemy ? 1.08 : 1);
      }
    });
    this.input.on('dragend', (p: Phaser.Input.Pointer, obj: CardView) => {
      if (this.dragging !== obj) return;
      this.dragging = null;
      this.arrow.clear();
      this.enemyGfx.setScale(1);
      obj.setGlow(false);
      const ok = obj.def.target === 'enemy'
        ? Phaser.Geom.Rectangle.Contains(enemyRect, p.x, p.y)
        : p.y < PLAY_LINE_Y;
      if (ok) this.useCard(obj);
      else this.returnToHand(obj);
    });
  }

  private returnToHand(v: CardView): void {
    v.hovered = false;
    v.setDepth(Math.max(0, this.state.hand.findIndex((c) => c.uid === v.inst.uid)));
    this.tweens.killTweensOf(v);
    this.tweens.add({ targets: v, x: v.hx, y: v.hy, scale: 1, rotation: v.hrot, duration: 220, ease: 'Back.out' });
  }

  private denyFeedback(v: CardView, msg: string): void {
    this.tweens.add({ targets: v, x: v.x + 8, duration: 40, yoyo: true, repeat: 2 });
    if (msg) this.popup(v.x, v.y - 140, msg, '#ff8a8a', 22);
  }

  /** 矢印ターゲット線（ベジェ曲線＋矢じり） */
  private drawTargetLine(x0: number, y0: number, x1: number, y1: number, hot: boolean): void {
    const g = this.arrow;
    g.clear();
    const color = hot ? 0xff4d4d : COLORS.energy;
    const curve = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(x0, y0),
      new Phaser.Math.Vector2((x0 + x1) / 2, Math.min(y0, y1) - 140),
      new Phaser.Math.Vector2(x1, y1),
    );
    const pts = curve.getPoints(28);
    for (let i = 1; i < pts.length - 2; i++) {
      const t = i / pts.length;
      g.fillStyle(color, 0.35 + 0.65 * t);
      g.fillCircle(pts[i].x, pts[i].y, 3 + t * 6);
    }
    const a = pts[pts.length - 1], b = pts[pts.length - 4];
    const ang = Math.atan2(a.y - b.y, a.x - b.x);
    const L = 34;
    g.fillStyle(color, 1);
    g.fillTriangle(
      a.x + Math.cos(ang) * 8, a.y + Math.sin(ang) * 8,
      a.x + Math.cos(ang + 2.6) * L, a.y + Math.sin(ang + 2.6) * L,
      a.x + Math.cos(ang - 2.6) * L, a.y + Math.sin(ang - 2.6) * L,
    );
  }

  // ------------------------------------------------------------------ カード使用
  private useCard(v: CardView): void {
    const s = this.state;
    const idx = s.hand.findIndex((c) => c.uid === v.inst.uid);
    const events = playCard(s, idx);
    if (!events) {
      this.returnToHand(v);
      return;
    }
    this.busy = true;
    this.views.delete(v.inst.uid);
    v.disableInteractive();
    const toEnemy = v.def.target === 'enemy';
    const tx = toEnemy ? ENEMY.x : PLAYER.x + 40;
    const ty = (toEnemy ? ENEMY.y : PLAYER.y) - 110;
    this.tweens.killTweensOf(v);
    this.tweens.add({
      targets: v, x: tx, y: ty, scale: 0.75, rotation: toEnemy ? 0.3 : 0, duration: 170, ease: 'Cubic.in',
      onComplete: () => {
        audio.play('card');
        this.playEvents(events);
        this.tweens.add({
          targets: v, x: DISCARD_PILE.x, y: DISCARD_PILE.y, scale: 0.2, alpha: 0, rotation: 1.2,
          duration: 380, delay: 120, ease: 'Cubic.in', onComplete: () => v.destroy(),
        });
        this.time.delayedCall(260, () => {
          this.relayoutAfterPlay();
        });
      },
    });
    // 残りの手札を詰める
    this.relayoutAfterPlay(true);
  }

  private relayoutAfterPlay(early = false): void {
    if (!early && this.state.phase !== 'player') {
      this.refresh();
      this.finishIfOver();
      return;
    }
    // 引いたカードがあれば syncHand が生成する
    this.syncHand(false);
    if (!early) {
      this.busy = false;
      this.refresh();
      this.finishIfOver();
    }
  }

  private finishIfOver(): void {
    const p = this.state.phase;
    if (p === 'won' || p === 'lost') this.showResult(p === 'won');
  }

  /** ダメージ/ブロック等の演出（Juice） */
  private playEvents(events: BattleEvent[]): void {
    for (const e of events) {
      if (e.type === 'damage') {
        const isEnemy = e.target === 'enemy';
        const pos = isEnemy ? ENEMY : PLAYER;
        const gfx = isEnemy ? this.enemyGfx : this.hero;
        if (e.amount > 0) {
          audio.play(isEnemy ? 'enemyHit' : 'hit');
          this.popup(pos.x + Phaser.Math.Between(-20, 20), pos.y - 170, `-${e.amount}`, '#ffdf6b', 44 + Math.min(20, e.amount));
          this.sparks(pos.x, pos.y - 90, 0xffd166);
          this.cameras.main.shake(140 + e.amount * 6, Math.min(0.02, 0.004 + e.amount * 0.0006));
          this.tweens.add({ targets: gfx, x: pos.x + (isEnemy ? 18 : -18), duration: 50, yoyo: true, repeat: 2 });
          this.hitStop(90);
        } else {
          audio.play('block');
          this.popup(pos.x, pos.y - 170, 'ブロック!', '#9cc7ff', 30);
          this.cameras.main.shake(80, 0.003);
        }
        if (e.blocked > 0 && e.amount > 0) this.popup(pos.x + 60, pos.y - 130, `(${e.blocked}防御)`, '#9cc7ff', 20);
      } else if (e.type === 'block') {
        const pos = e.target === 'player' ? PLAYER : ENEMY;
        audio.play('block');
        this.popup(pos.x, pos.y - 170, `+${e.amount} ブロック`, '#9cc7ff', 32);
        this.shieldRing(pos.x, pos.y - 90);
      }
    }
    this.playSfx(events);
    this.refresh();
  }

  private playSfx(events: BattleEvent[]): void {
    if (events.some((e) => e.type === 'shuffle')) audio.play('shuffle');
  }

  private hitStop(ms: number): void {
    this.tweens.pauseAll();
    this.time.delayedCall(ms, () => this.tweens.resumeAll());
  }

  private popup(x: number, y: number, s: string, color: string, size: number): void {
    const t = txt(this, x, y, s, size, color, { fontStyle: 'bold', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setDepth(3000);
    t.setScale(0.4);
    this.tweens.add({ targets: t, scale: 1, duration: 120, ease: 'Back.out' });
    this.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 900, delay: 250, ease: 'Cubic.out', onComplete: () => t.destroy() });
  }

  private sparks(x: number, y: number, color: number): void {
    for (let i = 0; i < 12; i++) {
      const c = this.add.circle(x, y, Phaser.Math.Between(3, 6), color).setDepth(2500);
      const a = Math.random() * Math.PI * 2;
      const d = Phaser.Math.Between(40, 110);
      this.tweens.add({
        targets: c, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, scale: 0.2,
        duration: 420, ease: 'Cubic.out', onComplete: () => c.destroy(),
      });
    }
  }

  private shieldRing(x: number, y: number): void {
    const c = this.add.circle(x, y, 40).setStrokeStyle(6, COLORS.block, 1).setDepth(2500);
    this.tweens.add({ targets: c, scale: 3, alpha: 0, duration: 450, ease: 'Cubic.out', onComplete: () => c.destroy() });
  }

  // ------------------------------------------------------------------ ターン終了 / 敵ターン
  private endTurn(): void {
    const s = this.state;
    if (this.busy || this.dragging || s.phase !== 'player') return;
    this.busy = true;
    audio.play('click');
    const intent = currentIntent(s);
    const oldViews = [...this.views.values()];
    this.views.clear();
    this.paintEndBtn(false);

    // ロジックは一括で進め、演出は段階的に再生する
    const events = endPlayerTurn(s);
    const actionEvents = events.filter((e) => e.type === 'damage' || e.type === 'block');

    oldViews.forEach((v, i) => {
      v.disableInteractive();
      this.tweens.killTweensOf(v);
      this.tweens.add({
        targets: v, x: DISCARD_PILE.x, y: DISCARD_PILE.y, scale: 0.2, alpha: 0, rotation: 1.2,
        duration: 320, delay: i * 45, ease: 'Cubic.in', onComplete: () => v.destroy(),
      });
    });

    this.time.delayedCall(oldViews.length * 45 + 380, () => {
      // 敵の行動（突進）
      const dir = intent.kind === 'attack' ? -1 : 0;
      this.tweens.add({
        targets: this.enemyGfx, x: ENEMY.x + dir * 90, duration: 140, yoyo: true, ease: 'Cubic.in',
        onYoyo: () => this.playEvents(actionEvents),
      });
      this.time.delayedCall(700, () => {
        this.refresh();
        if (s.phase === 'lost') {
          this.finishIfOver();
          return;
        }
        audio.play('turn');
        this.playSfx(events);
        this.syncHand(true);
        this.busy = false;
        this.refresh();
      });
    });
  }

  // ------------------------------------------------------------------ 結果
  private showResult(won: boolean): void {
    this.busy = true;
    audio.play(won ? 'win' : 'lose');
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.65).setDepth(4000).setInteractive();
    const title = txt(this, W / 2, 260, won ? '勝利!' : '敗北…', 84, won ? '#f6e3b4' : '#ff7a7a', {
      fontStyle: 'bold', stroke: '#000', strokeThickness: 10,
    }).setOrigin(0.5).setDepth(4001).setScale(0.3);
    this.tweens.add({ targets: title, scale: 1, duration: 400, ease: 'Back.out' });
    const mkBtn = (y: number, label: string, cb: () => void) => {
      const c = this.add.container(W / 2, y).setDepth(4001);
      const g = this.add.graphics();
      g.fillStyle(0x2d3748, 1).fillRoundedRect(-140, -28, 280, 56, 12);
      g.lineStyle(3, COLORS.energy, 1).strokeRoundedRect(-140, -28, 280, 56, 12);
      c.add([g, txt(this, 0, 0, label, 24, '#fff', { fontStyle: 'bold' }).setOrigin(0.5)]);
      c.setSize(280, 56).setInteractive({ useHandCursor: true });
      c.on('pointerdown', () => { audio.play('click'); cb(); });
      return c;
    };
    mkBtn(400, 'もう一度戦う', () => this.scene.restart({ characterId: this.init_.characterId, seed: Date.now() >>> 0 }));
    mkBtn(480, 'キャラ選択へ', () => this.scene.start('CharacterSelect'));
    void dim;
  }
}
