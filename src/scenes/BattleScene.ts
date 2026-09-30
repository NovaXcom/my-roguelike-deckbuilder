import Phaser from 'phaser';
import { audio } from '../audio';
import {
  BattleEvent, BattleState, allActed, canUse, createBattle, currentIntent, endPlayerTurn, previewSkill,
  resolveTarget, startPlayerTurn, useSkill,
} from '../core/battle';
import { ELEMENT_COLOR, ELEMENT_LABEL, SKILLS } from '../core/data';
import type { Element, SkillDef } from '../core/types';
import { COLORS, drawBackground, drawHero, drawShield, drawSlime, drawSword, txt } from '../ui/art';
import { H, W } from './TitleScene';

const HERO_POS = [{ x: 430, y: 400 }, { x: 200, y: 400 }]; // [前衛, 後衛]
const ENEMY = { x: 990, y: 350 };
const BTN_W = 140;
const BTN_H = 168;
const BTN_Y = 612;
const PANEL_X = [30, 666];
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/** 演出用の表示値。イベント再生に合わせて段階的に更新し、HPバー等を滑らかに見せる */
interface Disp {
  enemyHp: number;
  enemyShield: number;
  broken: boolean;
  hp: number[];
  guard: number[];
}

interface SkillBtn {
  member: number;
  skill: SkillDef;
  c: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  status: Phaser.GameObjects.Text;
}

const EVENT_MS: Record<BattleEvent['type'], number> = {
  skill: 0, damage: 260, shield: 0, break: 500, chain: 1900, stunned: 550, recover: 500,
  guard: 250, heal: 300, taunt: 250, enemyAttack: 380, hurt: 450, down: 450,
};

export class BattleScene extends Phaser.Scene {
  private state!: BattleState;
  private disp!: Disp;
  private busy = false;
  private buttons: SkillBtn[] = [];

  private heroes: Phaser.GameObjects.Graphics[] = [];
  private enemyGfx!: Phaser.GameObjects.Graphics;
  private stars!: Phaser.GameObjects.Container;
  private bars!: Phaser.GameObjects.Graphics;
  private hpTexts: Phaser.GameObjects.Text[] = [];
  private guardTexts: Phaser.GameObjects.Text[] = [];
  private enemyHpText!: Phaser.GameObjects.Text;
  private shieldText!: Phaser.GameObjects.Text;
  private intentBox!: Phaser.GameObjects.Container;
  private intentGfx!: Phaser.GameObjects.Graphics;
  private intentValue!: Phaser.GameObjects.Text;
  private intentLabel!: Phaser.GameObjects.Text;
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
    this.hpTexts = [];
    this.guardTexts = [];
    this.tags = [];
  }

  create(): void {
    this.state = createBattle();
    startPlayerTurn(this.state);
    this.syncDisp();
    drawBackground(this, W, H);
    const s = this.state;

    // --- パーティ ---
    s.party.forEach((m, i) => {
      const g = this.add.graphics().setPosition(HERO_POS[i].x, HERO_POS[i].y);
      drawHero(g, m.def.id, m.def.color, 1.15);
      this.tweens.add({ targets: g, scaleY: 1.02, duration: 1300 + i * 200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.heroes.push(g);
      this.hpTexts.push(txt(this, HERO_POS[i].x, HERO_POS[i].y + 40, '', 14, '#fff', { fontStyle: 'bold' }).setOrigin(0.5).setDepth(6));
      this.guardTexts.push(txt(this, HERO_POS[i].x - 112, HERO_POS[i].y + 40, '', 16, '#fff', { fontStyle: 'bold' }).setOrigin(0.5).setDepth(6));
    });
    txt(this, HERO_POS[1].x, HERO_POS[1].y - 236, '後衛', 14, '#7b8798').setOrigin(0.5);
    txt(this, HERO_POS[0].x, HERO_POS[0].y - 236, '前衛', 14, '#7b8798').setOrigin(0.5);

    // --- 敵 ---
    this.enemyGfx = this.add.graphics().setPosition(ENEMY.x, ENEMY.y);
    drawSlime(this.enemyGfx, s.enemy.def.color);
    this.tweens.add({ targets: this.enemyGfx, scaleY: 0.94, scaleX: 1.04, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.stars = this.add.container(ENEMY.x, ENEMY.y - 130);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      this.stars.add(this.add.star(Math.cos(a) * 46, Math.sin(a) * 12, 5, 4, 9, 0xffe066));
    }
    this.tweens.add({ targets: this.stars, angle: 360, duration: 1400, repeat: -1 });
    this.stars.setVisible(false);
    txt(this, ENEMY.x, ENEMY.y + 98, s.enemy.def.name, 18, '#e8dfd3').setOrigin(0.5);
    txt(this, ENEMY.x, ENEMY.y + 120,
      `弱点: ${ELEMENT_LABEL[s.enemy.def.weak]}　耐性: ${ELEMENT_LABEL[s.enemy.def.resist]}`, 14, '#f6c453').setOrigin(0.5);
    this.bars = this.add.graphics().setDepth(5);
    this.enemyHpText = txt(this, ENEMY.x, ENEMY.y + 36, '', 14, '#fff', { fontStyle: 'bold' }).setOrigin(0.5).setDepth(6);
    this.shieldText = txt(this, ENEMY.x, ENEMY.y + 66, '', 13, '#3a2a00', { fontStyle: 'bold' }).setOrigin(0.5).setDepth(6);

    // --- インテント ---
    this.intentGfx = this.add.graphics();
    this.intentValue = txt(this, 0, 36, '', 24, '#fff', { fontStyle: 'bold', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5);
    this.intentLabel = txt(this, 0, 68, '', 15, '#e8dfd3', { stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
    this.intentBox = this.add.container(ENEMY.x, ENEMY.y - 245, [this.intentGfx, this.intentValue, this.intentLabel]);
    this.tweens.add({ targets: this.intentBox, y: ENEMY.y - 255, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    this.turnText = txt(this, W / 2, 24, '', 22, '#f6e3b4', { fontStyle: 'bold' }).setOrigin(0.5);

    // --- スキルパネル ---
    s.party.forEach((m, mi) => {
      const px = PANEL_X[mi];
      const line = this.add.graphics();
      line.lineStyle(2, m.def.color, 0.8).lineBetween(px, 500, px + 4 * BTN_W + 3 * 8, 500);
      this.tags.push(txt(this, px + 4 * BTN_W + 24, 488, '', 14, '#9fb0c8').setOrigin(1, 0.5));
      txt(this, px, 486, `${m.def.name}（${m.def.position}）`, 17, hex(m.def.color), { fontStyle: 'bold' }).setOrigin(0, 0.5);
      m.def.skills.forEach((sid, si) => this.buildButton(mi, SKILLS[sid], px + BTN_W / 2 + si * (BTN_W + 8)));
    });

    // --- ターン終了 ---
    this.endBtnBg = this.add.graphics();
    this.endBtn = this.add.container(W / 2 + 20, 420, [
      this.endBtnBg, txt(this, 0, 0, 'ターン終了', 22, '#fff', { fontStyle: 'bold' }).setOrigin(0.5),
    ]);
    this.endBtn.setSize(170, 54).setInteractive({ useHandCursor: true });
    this.endBtn.on('pointerdown', () => this.endTurn());
    this.endBtn.on('pointerover', () => this.paintEnd(true));
    this.endBtn.on('pointerout', () => this.paintEnd(false));
    txt(this, W / 2 + 20, 458, 'Space', 12, '#7b8798').setOrigin(0.5);

    const back = txt(this, 20, 14, '← タイトルへ', 14, '#7b8798').setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.scene.start('Title'));
    const mute = txt(this, W - 20, 14, 'M: ミュート切替', 14, '#7b8798').setOrigin(1, 0);
    this.input.keyboard?.on('keydown-M', () => mute.setText(audio.toggleMute() ? 'M: ミュート中' : 'M: ミュート切替'));
    this.input.keyboard?.on('keydown-SPACE', () => this.endTurn());

    this.arrow = this.add.graphics().setDepth(1500);
    this.preview = txt(this, ENEMY.x + 100, ENEMY.y - 120, '', 34, '#ffffff', { fontStyle: 'bold', stroke: '#000', strokeThickness: 6, align: 'center' })
      .setOrigin(0.5).setDepth(1600).setAlpha(0);

    this.refreshAll();
    audio.play('turn');
  }

  // ------------------------------------------------------------------ 構築
  private buildButton(member: number, skill: SkillDef, x: number): void {
    const bg = this.add.graphics();
    const col = skill.element !== 'none' ? ELEMENT_COLOR[skill.element] : skill.kind === 'support' ? 0x6fcf97 : 0xe9d8c4;
    const title = txt(this, 0, -BTN_H / 2 + 20, skill.name, skill.name.length > 8 ? 13 : 16, '#fff', { fontStyle: 'bold' }).setOrigin(0.5);
    const chip = this.add.graphics();
    chip.fillStyle(col, 1).fillRoundedRect(-BTN_W / 2 + 8, -BTN_H / 2 + 40, 44, 18, 9);
    const chipText = txt(this, -BTN_W / 2 + 30, -BTN_H / 2 + 49,
      skill.kind === 'support' ? '補助' : skill.kind === 'physical' ? '物理' : ELEMENT_LABEL[skill.element] + '魔法', 11, '#111', { fontStyle: 'bold' }).setOrigin(0.5);
    const cd = txt(this, BTN_W / 2 - 8, -BTN_H / 2 + 49, `CD ${skill.cooldown}`, 12, '#9fb0c8').setOrigin(1, 0.5);
    const body = txt(this, 0, -BTN_H / 2 + 68, skill.text, 12, '#e8dfd3', {
      align: 'left', wordWrap: { width: BTN_W - 18, useAdvancedWrap: true },
    }).setOrigin(0.5, 0);
    const status = txt(this, 0, BTN_H / 2 - 22, '', 14, '#fff', { fontStyle: 'bold' }).setOrigin(0.5);
    const c = this.add.container(x, BTN_Y, [bg, title, chip, chipText, cd, body, status]).setSize(BTN_W, BTN_H);
    c.setInteractive({ useHandCursor: true });
    const btn: SkillBtn = { member, skill, c, bg, status };
    this.buttons.push(btn);
    c.on('pointerover', () => { this.paintBtn(btn, true); this.showPreview(btn); });
    c.on('pointerout', () => { this.paintBtn(btn, false); this.clearPreview(); });
    c.on('pointerdown', () => this.onSkill(btn));
  }

  private syncDisp(): void {
    const s = this.state;
    this.disp = {
      enemyHp: s.enemy.hp, enemyShield: s.enemy.shield, broken: s.enemy.broken,
      hp: s.party.map((m) => m.hp), guard: s.party.map((m) => m.guard),
    };
  }

  // ------------------------------------------------------------------ 描画更新
  private paintBtn(b: SkillBtn, hover: boolean): void {
    const s = this.state;
    const m = s.party[b.member];
    const ok = !this.busy && canUse(s, b.member, b.skill.id);
    const cdLeft = m.cooldowns[b.skill.id];
    const col = m.def.color;
    const g = b.bg;
    g.clear();
    g.fillStyle(0x000000, 0.4).fillRoundedRect(-BTN_W / 2 + 3, -BTN_H / 2 + 4, BTN_W, BTN_H, 10);
    g.fillStyle(ok ? (hover ? 0x3b4657 : 0x2d3748) : 0x1f2126, 1).fillRoundedRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 10);
    g.lineStyle(ok && hover ? 4 : 2, ok ? col : 0x444a52, 1).strokeRoundedRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 10);
    b.c.setAlpha(ok ? 1 : 0.55);
    b.c.y = ok && hover ? BTN_Y - 10 : BTN_Y;
    if (!alive(m)) b.status.setText('戦闘不能').setColor('#ff7a7a');
    else if (cdLeft > 0) b.status.setText(`あと${cdLeft}ターン`).setColor('#ffb86b');
    else if (m.acted) b.status.setText('行動済み').setColor('#9fb0c8');
    else b.status.setText('使用可能').setColor('#7be495');
  }

  private paintEnd(hover: boolean): void {
    const active = !this.busy && this.state.phase === 'player';
    const g = this.endBtnBg;
    g.clear();
    g.fillStyle(active ? (hover ? 0x3f5578 : 0x2d3748) : 0x24272c, 1).fillRoundedRect(-85, -27, 170, 54, 12);
    g.lineStyle(3, active ? COLORS.energy : 0x555b63, 1).strokeRoundedRect(-85, -27, 170, 54, 12);
    this.endBtn.setAlpha(active ? 1 : 0.6);
  }

  private refreshButtons(): void {
    this.buttons.forEach((b) => this.paintBtn(b, false));
    this.state.party.forEach((m, i) => {
      this.tags[i].setText(!alive(m) ? '戦闘不能' : m.acted ? '行動済み' : '行動可能')
        .setColor(!alive(m) ? '#ff7a7a' : m.acted ? '#7b8798' : '#7be495');
    });
    this.paintEnd(false);
  }

  private refreshIntent(): void {
    const g = this.intentGfx;
    const s = this.state;
    g.clear();
    if (s.phase === 'won') { this.intentBox.setVisible(false); return; }
    this.intentBox.setVisible(true);
    const it = currentIntent(s);
    const target = s.party[resolveTarget(s, it)].def.name;
    g.fillStyle(0x000000, 0.55).fillCircle(0, 0, 34);
    if (s.enemy.broken) {
      g.lineStyle(3, 0xffe066, 1).strokeCircle(0, 0, 34);
      this.intentValue.setText('BREAK').setColor('#ffe066').setFontSize(20);
      this.intentLabel.setText('行動不能');
      return;
    }
    g.lineStyle(3, 0xff5c5c, 1).strokeCircle(0, 0, 34);
    drawSword(g, 0, 0, 52, 0xff8a8a);
    this.intentValue.setText(String(it.value)).setColor('#ff9a9a').setFontSize(24);
    this.intentLabel.setText(`${it.name} → ${target}`);
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
    bar(ENEMY.x, ENEMY.y + 36, 210, 20, d.enemyHp / s.enemy.maxHp, COLORS.hp);
    bar(ENEMY.x, ENEMY.y + 66, 210, 18, d.broken ? 1 : d.enemyShield / s.enemy.maxShield, d.broken ? 0xff5c5c : 0xf6c453);
    this.enemyHpText.setText(`${Math.max(0, d.enemyHp)}/${s.enemy.maxHp}`);
    this.shieldText.setText(d.broken ? 'BREAK!' : `シールド ${d.enemyShield}/${s.enemy.maxShield}`).setColor(d.broken ? '#fff' : '#3a2a00');
    this.enemyGfx.setAlpha(d.broken ? 0.75 : 1);
    this.stars.setVisible(d.broken);
  }

  private refreshAll(): void {
    this.turnText.setText(`ターン ${this.state.turn}`);
    this.drawBars();
    this.refreshButtons();
    this.refreshIntent();
  }

  // ------------------------------------------------------------------ 入力
  private showPreview(b: SkillBtn): void {
    const s = this.state;
    if (this.busy || !canUse(s, b.member, b.skill.id)) return;
    const sk = b.skill;
    if (!sk.damage && !sk.breakPower) return;
    const p = previewSkill(s, sk);
    const from = HERO_POS[b.member];
    this.drawTargetLine(from.x, from.y - 150, ENEMY.x, ENEMY.y - 100, p.chain);
    const lines: string[] = [];
    if (p.hp > 0) lines.push(`-${p.hp}`);
    if (p.chain) lines.push('CHAIN!');
    else if (p.breaks) lines.push('BREAK!');
    else if (p.shield > 0) lines.push(`ゲージ-${p.shield}`);
    if (p.weak) lines.push('弱点');
    if (p.resist) lines.push('耐性');
    this.preview.setText(lines.join('\n')).setColor(p.chain ? '#ff9a3c' : p.breaks ? '#ffe066' : '#ffffff').setAlpha(0.95);
    this.preview.setFontSize(p.chain ? 40 : 30);
  }

  private clearPreview(): void {
    this.arrow.clear();
    this.preview.setAlpha(0);
  }

  private onSkill(b: SkillBtn): void {
    const s = this.state;
    if (this.busy || !canUse(s, b.member, b.skill.id)) {
      this.tweens.add({ targets: b.c, x: b.c.x + 6, duration: 40, yoyo: true, repeat: 2 });
      return;
    }
    this.clearPreview();
    const events = useSkill(s, b.member, b.skill.id)!;
    this.busy = true;
    this.refreshButtons();
    const sk = b.skill;
    const hero = this.heroes[b.member];
    const p = HERO_POS[b.member];
    const offensive = !!sk.damage || !!sk.breakPower;
    if (sk.kind === 'physical') {
      audio.play('skill');
      this.tweens.add({
        targets: hero, x: ENEMY.x - 150, duration: 150, ease: 'Cubic.in', yoyo: true, hold: 60,
        onYoyo: () => this.playSeq(events), onComplete: () => { hero.x = p.x; },
      });
    } else if (offensive) {
      audio.play('magic');
      const col = ELEMENT_COLOR[sk.element];
      const orb = this.add.circle(p.x + 40, p.y - 160, 14, col).setDepth(2000);
      this.tweens.add({ targets: hero, y: p.y - 8, duration: 120, yoyo: true });
      this.tweens.add({
        targets: orb, x: ENEMY.x, y: ENEMY.y - 90, scale: 1.6, duration: 320, delay: 140, ease: 'Cubic.in',
        onComplete: () => { orb.destroy(); this.playSeq(events); },
      });
    } else {
      this.shieldRing(p.x, p.y - 100, sk.healAll ? 0x6fcf97 : COLORS.block);
      this.time.delayedCall(150, () => this.playSeq(events));
    }
  }

  // ------------------------------------------------------------------ イベント再生
  /** イベントを種類ごとの所要時間で順に再生。完了後に表示値を state に同期する */
  private playSeq(events: BattleEvent[], onDone?: () => void): void {
    let t = 0;
    for (const e of events) {
      this.time.delayedCall(t, () => this.playEvent(e));
      t += EVENT_MS[e.type];
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
    if (p === 'won' || p === 'lost') { this.showResult(p === 'won'); return; }
    if (allActed(this.state)) this.time.delayedCall(350, () => this.endTurn());
  }

  private playEvent(e: BattleEvent): void {
    const d = this.disp;
    switch (e.type) {
      case 'damage': {
        const col = hex(ELEMENT_COLOR[e.element]);
        if (e.chain) break; // チェインは cut-in 側で演出
        d.enemyHp -= e.amount;
        audio.play('enemyHit');
        this.popup(ENEMY.x + Phaser.Math.Between(-25, 25), ENEMY.y - 140, `-${e.amount}`, e.element === 'none' ? '#ffdf6b' : col, 44 + Math.min(20, e.amount));
        if (e.weak) this.popup(ENEMY.x + 90, ENEMY.y - 175, '弱点!', '#ff9a3c', 26);
        if (e.resist) this.popup(ENEMY.x + 90, ENEMY.y - 175, '耐性', '#9fb0c8', 24);
        this.impact(e.amount, ELEMENT_COLOR[e.element] || 0xffd166);
        break;
      }
      case 'shield':
        d.enemyShield = Math.max(0, d.enemyShield - e.amount);
        break;
      case 'break':
        d.broken = true;
        audio.play('break');
        this.popup(ENEMY.x, ENEMY.y - 200, 'BREAK!', '#ffe066', 64);
        this.cameras.main.flash(180, 255, 255, 255);
        this.cameras.main.shake(380, 0.014);
        this.sparks(ENEMY.x, ENEMY.y - 60, 0xffe066, 26);
        this.hitStop(110);
        break;
      case 'chain':
        this.cutIn(e.element, e.amount);
        break;
      case 'guard':
        d.guard[e.member] += e.amount;
        audio.play('block');
        this.shieldRing(HERO_POS[e.member].x, HERO_POS[e.member].y - 90, COLORS.block);
        this.popup(HERO_POS[e.member].x, HERO_POS[e.member].y - 200, `+${e.amount} ガード`, '#9cc7ff', 26);
        break;
      case 'heal':
        d.hp[e.member] += e.amount;
        audio.play('heal');
        this.popup(HERO_POS[e.member].x, HERO_POS[e.member].y - 200, `+${e.amount}`, '#7be495', 36);
        this.shieldRing(HERO_POS[e.member].x, HERO_POS[e.member].y - 90, 0x6fcf97);
        break;
      case 'taunt':
        this.popup(HERO_POS[e.member].x, HERO_POS[e.member].y - 230, '挑発!', '#ffb86b', 34);
        break;
      case 'stunned':
        this.popup(ENEMY.x, ENEMY.y - 150, '行動不能…', '#ffe066', 34);
        break;
      case 'recover':
        d.broken = false;
        d.enemyShield = this.state.enemy.maxShield;
        this.popup(ENEMY.x, ENEMY.y - 110, 'シールド回復', '#f6c453', 22);
        break;
      case 'enemyAttack': {
        const to = HERO_POS[e.target];
        this.tweens.add({ targets: this.enemyGfx, x: to.x + 140, duration: 150, yoyo: true, ease: 'Cubic.in', hold: 40 });
        break;
      }
      case 'hurt': {
        const p = HERO_POS[e.member];
        d.hp[e.member] -= e.amount;
        d.guard[e.member] = Math.max(0, d.guard[e.member] - e.blocked);
        if (e.amount > 0) {
          audio.play('hit');
          this.popup(p.x, p.y - 190, `-${e.amount}`, '#ff8a8a', 44);
          this.sparks(p.x, p.y - 90, 0xff6b6b, 12);
          this.cameras.main.shake(160 + e.amount * 6, Math.min(0.02, 0.004 + e.amount * 0.0006));
          this.tweens.add({ targets: this.heroes[e.member], x: p.x - 16, duration: 50, yoyo: true, repeat: 2 });
          this.hitStop(80);
        } else {
          audio.play('block');
          this.popup(p.x, p.y - 190, 'ガード!', '#9cc7ff', 32);
        }
        break;
      }
      case 'down':
        this.tweens.add({ targets: this.heroes[e.member], alpha: 0.3, angle: -12, duration: 350 });
        this.popup(HERO_POS[e.member].x, HERO_POS[e.member].y - 230, '戦闘不能', '#ff7a7a', 28);
        break;
      default:
        break;
    }
    this.drawBars();
  }

  private impact(amount: number, color: number): void {
    this.sparks(ENEMY.x, ENEMY.y - 70, color, 14);
    this.cameras.main.shake(140 + amount * 6, Math.min(0.02, 0.004 + amount * 0.0006));
    this.tweens.add({ targets: this.enemyGfx, x: ENEMY.x + 16, duration: 50, yoyo: true, repeat: 2 });
    this.hitStop(90);
  }

  /** チェイン: 全画面カットイン + 大ダメージ演出 */
  private cutIn(element: Element, amount: number): void {
    const col = ELEMENT_COLOR[element];
    audio.play('chain');
    const D = 5000;
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(D);
    const band = this.add.rectangle(W / 2, 330, W, 250, col, 0.9).setDepth(D + 1).setScale(1, 0.05);
    const stripe = this.add.rectangle(W / 2, 330, W, 220, 0x000000, 0.55).setDepth(D + 1).setScale(1, 0.05);
    const hero = this.add.graphics().setDepth(D + 2).setPosition(-260, 520);
    drawHero(hero, 'elementalist', 0x4a90e2, 2.2);
    const title = txt(this, W + 500, 300, 'CHAIN!', 120, '#ffffff', { fontStyle: 'bold', stroke: hex(col), strokeThickness: 14 })
      .setOrigin(0.5).setDepth(D + 3);
    const sub = txt(this, W + 500, 385, `${ELEMENT_LABEL[element]}属性 ─ 属性爆発`, 30, hex(col), { fontStyle: 'bold', stroke: '#000', strokeThickness: 6 })
      .setOrigin(0.5).setDepth(D + 3);
    const all = [dim, band, stripe, hero, title, sub];
    this.tweens.add({ targets: dim, fillAlpha: 0.65, duration: 200 });
    this.tweens.add({ targets: [band, stripe], scaleY: 1, duration: 220, ease: 'Cubic.out' });
    this.tweens.add({ targets: hero, x: 300, duration: 380, ease: 'Cubic.out', delay: 100 });
    this.tweens.add({ targets: [title, sub], x: 800, duration: 380, ease: 'Cubic.out', delay: 160 });
    // 命中: フラッシュ・大揺れ・ダメージ表示
    this.time.delayedCall(950, () => {
      this.cameras.main.flash(260, 255, 255, 255);
      this.cameras.main.shake(520, 0.03);
      const big = txt(this, W / 2, 470, `-${amount}`, 130, hex(col), { fontStyle: 'bold', stroke: '#000', strokeThickness: 14 })
        .setOrigin(0.5).setDepth(D + 4).setScale(0.3);
      this.tweens.add({ targets: big, scale: 1, duration: 200, ease: 'Back.out' });
      all.push(big);
    });
    this.time.delayedCall(1300, () => {
      this.disp.enemyHp -= amount;
      this.drawBars();
      audio.play('enemyHit');
      this.sparks(ENEMY.x, ENEMY.y - 70, col, 30);
      this.tweens.add({ targets: all, alpha: 0, duration: 380, onComplete: () => all.forEach((o) => o.destroy()) });
      this.popup(ENEMY.x, ENEMY.y - 140, `-${amount}`, hex(col), 72);
      this.tweens.add({ targets: this.enemyGfx, x: ENEMY.x + 22, duration: 60, yoyo: true, repeat: 4 });
    });
  }

  private hitStop(ms: number): void {
    this.tweens.pauseAll();
    this.time.delayedCall(ms, () => this.tweens.resumeAll());
  }

  private popup(x: number, y: number, s: string, color: string, size: number): void {
    const t = txt(this, x, y, s, size, color, { fontStyle: 'bold', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setDepth(3000).setScale(0.4);
    this.tweens.add({ targets: t, scale: 1, duration: 120, ease: 'Back.out' });
    this.tweens.add({ targets: t, y: y - 60, alpha: 0, duration: 800, delay: 300, ease: 'Cubic.out', onComplete: () => t.destroy() });
  }

  private sparks(x: number, y: number, color: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const c = this.add.circle(x, y, Phaser.Math.Between(3, 6), color).setDepth(2500);
      const a = Math.random() * Math.PI * 2;
      const dist = Phaser.Math.Between(40, 130);
      this.tweens.add({
        targets: c, x: x + Math.cos(a) * dist, y: y + Math.sin(a) * dist, alpha: 0, scale: 0.2,
        duration: 450, ease: 'Cubic.out', onComplete: () => c.destroy(),
      });
    }
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
    if (this.busy || s.phase !== 'player') return;
    this.busy = true;
    this.clearPreview();
    audio.play('click');
    const events = endPlayerTurn(s);
    this.refreshButtons();
    this.playSeq(events, () => {
      const p = this.state.phase;
      if (p === 'won' || p === 'lost') { this.showResult(p === 'won'); return; }
      audio.play('turn');
    });
  }

  private showResult(won: boolean): void {
    this.busy = true;
    audio.play(won ? 'win' : 'lose');
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.65).setDepth(6000).setInteractive();
    const title = txt(this, W / 2, 240, won ? '勝利!' : '全滅…', 84, won ? '#f6e3b4' : '#ff7a7a', {
      fontStyle: 'bold', stroke: '#000', strokeThickness: 10,
    }).setOrigin(0.5).setDepth(6001).setScale(0.3);
    this.tweens.add({ targets: title, scale: 1, duration: 400, ease: 'Back.out' });
    const mkBtn = (y: number, label: string, cb: () => void) => {
      const c = this.add.container(W / 2, y).setDepth(6001);
      const g = this.add.graphics();
      g.fillStyle(0x2d3748, 1).fillRoundedRect(-140, -28, 280, 56, 12);
      g.lineStyle(3, COLORS.energy, 1).strokeRoundedRect(-140, -28, 280, 56, 12);
      c.add([g, txt(this, 0, 0, label, 24, '#fff', { fontStyle: 'bold' }).setOrigin(0.5)]);
      c.setSize(280, 56).setInteractive({ useHandCursor: true });
      c.on('pointerdown', () => { audio.play('click'); cb(); });
    };
    mkBtn(380, 'もう一度戦う', () => this.scene.restart());
    mkBtn(460, 'パーティ確認へ', () => this.scene.start('Party'));
  }
}

const alive = (m: { hp: number }): boolean => m.hp > 0;
