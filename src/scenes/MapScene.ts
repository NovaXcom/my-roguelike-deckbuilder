import Phaser from 'phaser';
import { audio } from '../audio';
import { NODE_LABEL, type MapNode, type NodeType } from '../core/map';
import { availableNodes, enterNode, memberMaxHp, usePotionOnMap } from '../core/run';
import { game } from '../game';
import { COLORS, drawBackground, txt } from '../ui/art';
import { nodeIconKey } from '../ui/assetMap';
import { hasImg } from '../ui/assets';
import { compact } from '../ui/device';
import { makeButton, onTap, padHitArea, panel } from '../ui/widgets';
import { H, W } from './TitleScene';

const NODE_COLOR: Record<NodeType, number> = {
  battle: 0xd64545, chest: 0xf6c453, rest: 0x6fcf97, shop: 0x5aa9ff, boss: 0xb06be0,
};
const NODE_GLYPH: Record<NodeType, string> = { battle: '戦', chest: '宝', rest: '休', shop: '店', boss: '王' };
const NODE_SCENE: Record<NodeType, string> = { battle: 'Battle', boss: 'Battle', chest: 'Chest', rest: 'Rest', shop: 'Shop' };

const ROW_H = 62;
const BASE_Y = 640;
const px = (n: MapNode, cols: number): number => 330 + (n.col / (cols - 1)) * 620;
const py = (n: MapNode): number => BASE_Y - n.row * ROW_H;

/** ダンジョン探索: ランダム生成された樹形図ルートから次のマスを選ぶ。 */
export class MapScene extends Phaser.Scene {
  constructor() {
    super('Map');
  }

  create(): void {
    const run = game.run;
    if (!run) { this.scene.start('Town'); return; }
    drawBackground(this, W, H);
    const map = run.map;
    const avail = new Set(availableNodes(run).map((n) => n.id));
    const visited = new Set(run.visited);

    // --- 経路線 ---
    const lines = this.add.graphics();
    for (const n of map.nodes) {
      for (const id of n.next) {
        const m = map.nodes[id];
        const used = visited.has(n.id) && visited.has(id);
        const hot = n.id === run.current && avail.has(id);
        lines.lineStyle(used ? 5 : 3, hot ? 0xffe066 : used ? 0x8a9bb5 : 0x4a5262, hot || used ? 1 : 0.8);
        lines.lineBetween(px(n, map.cols), py(n), px(m, map.cols), py(m));
      }
    }
    // --- ノード ---
    for (const n of map.nodes) {
      const x = px(n, map.cols), y = py(n);
      const r = n.type === 'boss' ? 38 : 24;
      const col = NODE_COLOR[n.type];
      const isAvail = avail.has(n.id);
      const isVisited = visited.has(n.id);
      const c = this.add.container(x, y);
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.5).fillCircle(2, 3, r);
      g.fillStyle(isVisited ? 0x3a3f4a : col, isAvail || isVisited ? 1 : 0.35).fillCircle(0, 0, r);
      g.lineStyle(n.id === run.current ? 6 : 3, n.id === run.current ? 0xffffff : isAvail ? 0xffe066 : 0x1a1714, 1).strokeCircle(0, 0, r);
      const iconKey = nodeIconKey(n.type, isVisited && n.id !== run.current ? 'visited' : 'normal');
      if (hasImg(this, iconKey)) {
        // 画像アイコン（無ければ従来の文字グリフ）
        const size = n.type === 'boss' ? 84 : 46;
        c.add([g, this.add.image(0, 0, iconKey).setDisplaySize(size, size).setAlpha(isAvail || isVisited ? 1 : 0.5)]);
      } else {
        c.add([g, txt(this, 0, 0, isVisited && n.id !== run.current ? '✓' : NODE_GLYPH[n.type], n.type === 'boss' ? 28 : 20, '#ffffff', { fontStyle: 'bold' })
          .setOrigin(0.5).setAlpha(isAvail || isVisited ? 1 : 0.5)]);
      }
      if (isAvail) {
        this.tweens.add({ targets: c, scale: 1.14, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        padHitArea(c, r * 2 + 10, r * 2 + 10);
        const label = txt(this, x, y + r + 12, NODE_LABEL[n.type], 13, '#ffe066', { stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
        c.on('pointerover', () => label.setScale(1.15));
        c.on('pointerout', () => label.setScale(1));
        onTap(c, () => this.enter(n.id));
      }
    }
    if (!compact()) txt(this, 640, BASE_Y + 52, '▲ 進行方向', 13, '#5b6370').setOrigin(0.5);

    // --- HUD（左: パーティ状態 / 右: 操作） ---
    panel(this, 16, 70, 250, 300, 0x4a5262);
    txt(this, 30, 82, `第 ${(run.current === null ? 0 : map.nodes[run.current].row) + 1} 階層 / ${map.rows}`, 16, '#f6e3b4', { fontStyle: 'bold' });
    const hudLine = (y: number, iconKey: string, label: string, color: string) => {
      const withIcon = hasImg(this, iconKey);
      if (withIcon) this.add.image(42, y + 9, iconKey).setDisplaySize(24, 24);
      txt(this, withIcon ? 60 : 30, y, label, 16, color);
    };
    hudLine(110, 'icon_status_gold', `ゴールド  ${run.gold} G`, '#ffe066');
    hudLine(136, 'icon_status_mana_stone', `魔導石  ${run.stones}`, '#7fe9ff');
    hudLine(162, 'icon_status_potion', `ポーション ×${run.potions}`, '#7be495');
    const bars = this.add.graphics();
    run.party.forEach((m, i) => {
      const y = 214 + i * 68;
      const max = memberMaxHp(run, i);
      txt(this, 30, y - 24, m.role === 'knight' ? 'ナイト' : 'エレメンタリスト', 14, '#e8dfd3', { fontStyle: 'bold' });
      bars.fillStyle(0x000000, 0.6).fillRoundedRect(28, y, 214, 20, 6);
      bars.fillStyle(COLORS.hp, 1).fillRoundedRect(30, y + 2, 210 * (m.hp / max), 16, 5);
      txt(this, 135, y + 10, `${m.hp}/${max}`, 13, '#fff', { fontStyle: 'bold' }).setOrigin(0.5);
    });

    makeButton(this, 141, 410, 220, 44, '装備を確認', () => this.scene.start('Gear'), { size: 18 });
    const pot = makeButton(this, 141, 466, 220, 44, `ポーション使用 ×${run.potions}`, () => {
      if (usePotionOnMap(run)) { audio.play('sup_heal'); this.scene.restart(); }
    }, { size: 18, color: 0x6fcf97, enabled: run.potions > 0 && run.party.some((m, i) => m.hp < memberMaxHp(run, i)) });
    void pot;
    makeButton(this, 141, 660, 220, 40, '挑戦を諦める', () => { run.finished = 'defeat'; this.scene.start('RunEnd'); }, { size: 14, color: 0x7b8798 });

    // 凡例
    (['battle', 'chest', 'rest', 'shop', 'boss'] as NodeType[]).forEach((t, i) => {
      const y = 100 + i * 30;
      if (hasImg(this, nodeIconKey(t))) {
        this.add.image(1052, y, nodeIconKey(t)).setDisplaySize(28, 28);
        txt(this, 1074, y, NODE_LABEL[t], 14, '#d8d0c4').setOrigin(0, 0.5);
      } else {
        const g = this.add.graphics();
        g.fillStyle(NODE_COLOR[t], 1).fillCircle(1050, y, 10);
        txt(this, 1070, y, `${NODE_GLYPH[t]}：${NODE_LABEL[t]}`, 14, '#d8d0c4').setOrigin(0, 0.5);
      }
    });
  }

  private enter(id: number): void {
    const run = game.run!;
    const node = enterNode(run, id);
    if (!node) return;
    audio.play(node.type === 'battle' || node.type === 'boss' ? 'map_battle' : 'ui_click');
    this.scene.start(NODE_SCENE[node.type]);
  }
}
