import Phaser from 'phaser';
import { audio } from '../audio';
import { ELEMENT_COLOR, MEMBERS, SKILLS } from '../core/data';
import { MIN_DECK, memberBaseDeck, removeCard, buyRemoval, removalCost, variantOf } from '../core/run';
import { game } from '../game';
import { drawBackground, txt } from '../ui/art';
import { hex, makeButton } from '../ui/widgets';
import { H, W } from './TitleScene';

export interface DeckSceneData {
  /** view=閲覧 / remove=カード削除(休憩所は無料) / buy-remove=ショップ(有料) */
  mode: 'view' | 'remove' | 'buy-remove';
  returnTo: { scene: string; data?: object };
  /** 「やめる」で戻る先(省略時は returnTo) */
  cancelTo?: { scene: string; data?: object };
}

/** デッキ一覧。削除モードでは、カードを選んで1枚デッキから取り除く。 */
export class DeckScene extends Phaser.Scene {
  private d: DeckSceneData = { mode: 'view', returnTo: { scene: 'Map' } };
  constructor() {
    super('Deck');
  }

  init(data: DeckSceneData): void {
    this.d = data ?? this.d;
  }

  create(): void {
    const run = game.run;
    if (!run) { this.scene.start('Town'); return; }
    drawBackground(this, W, H);
    const m = this.d.mode;
    txt(this, W / 2, 36, m === 'view' ? 'デッキ' : 'カード削除', 36, '#f6e3b4', { fontStyle: 'bold', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5);
    const sub = m === 'view' ? '山札の構成。同じカードの枚数が多いほど引きやすい'
      : m === 'remove' ? 'デッキから外すカードを1枚選ぼう（最低6枚は残る）'
        : `削除料金 ${removalCost(run)} G（所持 ${run.gold} G）。デッキを薄くすると強いカードを引きやすくなる`;
    txt(this, W / 2, 76, sub, 15, '#9fb0c8').setOrigin(0.5);
    txt(this, W / 2, 96, `連携デッキ(2人共通・毎ターン1枚引く): ${run.linkDeck.map((id) => SKILLS[id].name).join('・')}（${run.linkDeck.length}枚）`, 14, '#c9a6ff').setOrigin(0.5);
    run.party.forEach((p, i) => {
      const def = MEMBERS[p.role];
      const x0 = 30 + i * 625;
      const g = this.add.graphics();
      g.fillStyle(0x2d3748, 0.92).fillRoundedRect(x0, 116, 590, 504, 14).lineStyle(3, def.color, 1).strokeRoundedRect(x0, 116, 590, 504, 14);
      const deck = memberBaseDeck(run, i);
      txt(this, x0 + 20, 124, `${def.name}  ${deck.length}枚`, 20, hex(def.color), { fontStyle: 'bold' });
      const kinds = [...new Set(deck)];
      const step = Math.min(56, Math.floor(450 / Math.max(1, kinds.length)));
      kinds.forEach((id, k) => {
        const sk = SKILLS[variantOf(run, i, id)];
        const y = 160 + k * step;
        const n = deck.filter((x) => x === id).length;
        const col = sk.element !== 'none' ? ELEMENT_COLOR[sk.element] : sk.kind === 'support' ? 0x6fcf97 : 0xe9d8c4;
        g.fillStyle(col, 1).fillRoundedRect(x0 + 16, y + 2, 6, step - 12, 3);
        txt(this, x0 + 32, y, `${sk.name} ×${n}`, 16, '#fff', { fontStyle: 'bold' });
        txt(this, x0 + 32, y + 22, `${sk.text}`, 11, '#b8c2d0', { wordWrap: { width: 330, useAdvancedWrap: true } });
        txt(this, x0 + 400, y + 2, `AP${sk.cost ?? 1} ${sk.cooldown ? `疲労${sk.cooldown}` : ''}`, 12, '#ffb86b');
        if (m !== 'view') {
          // 装備の固有カード(武器)は装備中のみ。恒久デッキの分だけ削除できる
          const inBase = p.deck.includes(id);
          const ok = inBase && p.deck.length > MIN_DECK && (m === 'remove' || run.gold >= removalCost(run));
          makeButton(this, x0 + 530, y + 14, 90, 36, '削除', () => {
            const done = m === 'remove' ? removeCard(run, i, id) : buyRemoval(run, i, id);
            if (!done) { audio.play('deny'); return; }
            audio.play('ui_cancel');
            this.scene.start(this.d.returnTo.scene, this.d.returnTo.data);
          }, { size: 15, color: 0xe08a3c, enabled: ok });
        }
      });
    });
    makeButton(this, W / 2, 668, 260, 48, m === 'view' ? '← マップへ' : 'やめる', () => { const c = this.d.cancelTo ?? this.d.returnTo; this.scene.start(c.scene, c.data); }, { size: 20 });
  }
}
