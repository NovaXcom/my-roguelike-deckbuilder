import Phaser from 'phaser';
import { audio } from '../audio';
import { SKILLS } from '../core/data';
import { EFFECT_TEXT, RARITY_COLOR, RARITY_LABEL, SELL_VALUE, statLines, type EquipItem, type EquipStats } from '../core/equipment';
import { canEquip, equip, sellItem, type Reward } from '../core/run';
import { game } from '../game';
import { drawBackground, txt } from '../ui/art';
import { hex, itemCard, makeButton, variantNote } from '../ui/widgets';
import { H, W } from './TitleScene';

const STAT_NAMES: [keyof EquipStats, string][] = [['hp', '最大HP'], ['power', '攻撃'], ['guard', 'ガード'], ['breakBonus', 'ブレイク']];

/** 装備入れ替えによる増減の説明文 */
export function diffText(cur: EquipItem | null, next: EquipItem): { text: string } {
  const parts: string[] = [];
  for (const [k, label] of STAT_NAMES) {
    const d = next.stats[k] - (cur?.stats[k] ?? 0);
    if (d !== 0) parts.push(`${label} ${d > 0 ? '+' : ''}${d}`);
  }
  if ((cur?.skill ?? null) !== (next.skill ?? null)) {
    parts.push(next.skill ? `スキル「${SKILLS[next.skill].name}」を習得` : '固有スキルを失う');
  }
  if ((cur?.effect ?? null) !== (next.effect ?? null)) {
    parts.push(next.effect ? `固有効果「${EFFECT_TEXT[next.effect]}」${variantNote(next.effect)}` : '固有効果を失う');
  }
  return { text: parts.join('  /  ') || '変化なし' };
}

export interface LootData {
  title: string;
  reward: Reward;
  returnTo: { scene: string; data?: object };
}

/** 戦闘勝利・宝箱・購入時の獲得画面。装備するか売却するかを選ぶ（ハクスラの中心）。 */
export class LootScene extends Phaser.Scene {
  private data_!: LootData;

  constructor() {
    super('Loot');
  }

  init(data: LootData): void {
    this.data_ = data;
  }

  create(): void {
    const run = game.run;
    if (!run) { this.scene.start('Town'); return; }
    const { title, reward, returnTo } = this.data_;
    const item = reward.item;
    drawBackground(this, W, H);
    txt(this, W / 2, 46, title, 40, '#f6e3b4', { fontStyle: 'bold', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5);
    const parts = [];
    if (reward.gold) parts.push(`+${reward.gold} G`);
    if (reward.stones) parts.push(`+${reward.stones} 魔導石`);
    if (reward.skillPoints) parts.push(`+${reward.skillPoints} スキルポイント`);
    txt(this, W / 2, 96, parts.join('     ') || '', 22, '#ffe066', { fontStyle: 'bold' }).setOrigin(0.5);
    txt(this, W / 2, 128, `所持: ${run.gold} G ／ 魔導石 ${run.stones}`, 14, '#7b8798').setOrigin(0.5);

    const leave = () => this.scene.start(returnTo.scene, returnTo.data);
    if (!item) {
      txt(this, W / 2, 330, '装備品のドロップはなかった…', 22, '#9fb0c8').setOrigin(0.5);
      makeButton(this, W / 2, 470, 260, 60, '進む', leave, { size: 26 });
      return;
    }

    audio.play(item.rarity === 'legendary' ? 'jg_legendary' : item.rarity === 'rare' ? 'loot' : 'coin');
    const card = itemCard(this, 250, 380, 340, 340, item, '獲得した装備');
    card.setScale(0.5).setAlpha(0);
    this.tweens.add({ targets: card, scale: 1, alpha: 1, duration: 300, ease: 'Back.out' });
    if (item.rarity === 'legendary') {
      txt(this, 250, 172, '✦ LEGENDARY ✦', 20, '#ffa726', { fontStyle: 'bold', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
      this.cameras.main.flash(300, 255, 200, 90);
    }

    // 装備先（キャラごと）: 現在の装備と増減を表示
    let y = 200;
    run.party.forEach((m, i) => {
      if (!canEquip(run, i, item)) return;
      const cur = m.gear[item.slot];
      const name = m.role === 'knight' ? 'ナイト' : 'エレメンタリスト';
      const slot = { weapon: '武器', armor: '防具', accessory: '装飾' }[item.slot];
      this.add.graphics().fillStyle(0x1f2126, 0.9).fillRoundedRect(440, y, 500, 150, 12)
        .lineStyle(2, 0x4a5262, 1).strokeRoundedRect(440, y, 500, 150, 12);
      txt(this, 456, y + 10, `${name} の現在の${slot}`, 13, '#7b8798');
      txt(this, 456, y + 32, cur ? `${cur.name} [${RARITY_LABEL[cur.rarity]}]` : 'なし', 17, cur ? hex(RARITY_COLOR[cur.rarity]) : '#7b8798', { fontStyle: 'bold' });
      txt(this, 456, y + 58, cur ? (statLines(cur.stats).join('  ') || '(数値なし)') : '', 13, '#d8d0c4');
      txt(this, 456, y + 78, cur?.skill ? `固有スキル: ${SKILLS[cur.skill].name}` : '固有スキルなし', 13, '#ffd166');
      const diff = diffText(cur, item);
      txt(this, 456, y + 106, `変化  ${diff.text}`, 14, '#ffffff', { fontStyle: 'bold', wordWrap: { width: 470, useAdvancedWrap: true } });
      makeButton(this, 1080, y + 75, 250, 60, `${name}に装備`, () => this.doEquip(i, item, leave), { size: 20 });
      y += 168;
    });
    const sell = SELL_VALUE[item.rarity];
    makeButton(this, 1080, 560, 250, 54, `売却  +${sell} G`, () => {
      sellItem(run, item);
      audio.play('coin');
      leave();
    }, { size: 20, color: 0xf6c453 });
    if (!run.party.some((_, i) => canEquip(run, i, item))) txt(this, 690, 300, '装備できるキャラがいない', 18, '#ff8a8a').setOrigin(0.5);
    txt(this, 640, 620, '※ 装備すると同じ部位の旧装備は自動で売却されます', 13, '#7b8798').setOrigin(0.5);
  }

  private doEquip(member: number, item: EquipItem, leave: () => void): void {
    const run = game.run!;
    equip(run, member, item);
    audio.play('equip');
    this.time.delayedCall(200, leave);
  }
}
