import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { RELICS, RelicId } from '../systems/Relics';

export interface HudState {
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  xpNeed: number;
  gold: number;
  zone: number;
  roomLabel: string;
  score: number;
  skillProgress: number;
  skillReady: boolean;
  ult: number;
  ultMax: number;
  relics: RelicId[];
}

const TXT = { fontFamily: 'monospace', stroke: '#000', strokeThickness: 4 };

/** All fixed-position game UI: HP/XP/gold top-left, zone & score top-right, skills bottom-left. */
export class RpgHud {
  private g: Phaser.GameObjects.Graphics;
  private hpText: Phaser.GameObjects.Text;
  private lvText: Phaser.GameObjects.Text;
  private goldText: Phaser.GameObjects.Text;
  private zoneText: Phaser.GameObjects.Text;
  private scoreText: Phaser.GameObjects.Text;
  private skillKey: Phaser.GameObjects.Text;
  private skillName: Phaser.GameObjects.Text;
  private ultKey: Phaser.GameObjects.Text;
  private ultReady: Phaser.GameObjects.Text;
  private relicTexts: Phaser.GameObjects.Text[] = [];
  private relicKey = '';

  constructor(private scene: Phaser.Scene) {
    const fix = <T extends Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth>(o: T, d = 100): T => {
      o.setScrollFactor(0);
      o.setDepth(d);
      return o;
    };
    this.g = fix(scene.add.graphics());
    this.hpText = fix(scene.add.text(130, 18, '', { ...TXT, fontSize: '14px', color: '#fff' }).setOrigin(0.5, 0), 101);
    this.lvText = fix(scene.add.text(20, 52, '', { ...TXT, fontSize: '16px', fontStyle: 'bold', color: '#7af0ff' }));
    this.goldText = fix(scene.add.text(20, 74, '', { ...TXT, fontSize: '16px', fontStyle: 'bold', color: '#ffd633' }));
    this.zoneText = fix(scene.add.text(GAME_WIDTH - 24, 38, '', { ...TXT, fontSize: '15px', color: '#cfc8ff' }).setOrigin(1, 0));
    this.scoreText = fix(scene.add.text(GAME_WIDTH - 24, 12, '', { ...TXT, fontSize: '22px', fontStyle: 'bold', color: '#fff' }).setOrigin(1, 0));
    this.skillKey = fix(scene.add.text(46, GAME_HEIGHT - 44, 'L', { ...TXT, fontSize: '22px', fontStyle: 'bold', color: '#fff' }).setOrigin(0.5), 102);
    this.skillName = fix(scene.add.text(76, GAME_HEIGHT - 52, 'RUSH SLASH', { ...TXT, fontSize: '13px', color: '#cfe' }));
    this.ultKey = fix(scene.add.text(46, GAME_HEIGHT - 12, 'I', { ...TXT, fontSize: '18px', fontStyle: 'bold', color: '#fff' }).setOrigin(0.5), 102);
    this.ultReady = fix(scene.add.text(76, GAME_HEIGHT - 22, 'OVER BREAK', { ...TXT, fontSize: '13px', color: '#dcc' }), 102);
  }

  update(s: HudState, now: number): void {
    const g = this.g;
    g.clear();
    // HP
    g.fillStyle(0x000000, 0.65).fillRect(18, 14, 244, 26);
    g.fillStyle(0x2a0f1a).fillRect(20, 16, 240, 22);
    g.fillStyle(0x3ddc6a).fillRect(20, 16, 240 * Math.max(0, s.hp / s.maxHp), 22);
    g.fillStyle(0xffffff, 0.18).fillRect(20, 16, 240 * Math.max(0, s.hp / s.maxHp), 7);
    this.hpText.setText(`${Math.ceil(s.hp)} / ${s.maxHp}`);
    // XP
    g.fillStyle(0x000000, 0.65).fillRect(18, 44, 244, 6);
    g.fillStyle(0x7af0ff).fillRect(20, 45, 240 * Math.min(1, s.xp / s.xpNeed), 4);
    this.lvText.setText(`LV ${s.level}`);
    this.goldText.setText(`G ${s.gold}`);
    this.zoneText.setText(`${s.roomLabel}`);
    this.scoreText.setText(s.score.toLocaleString());

    // Relic icons
    const key = s.relics.join(',');
    if (key !== this.relicKey) {
      this.relicKey = key;
      this.relicTexts.forEach((t) => t.destroy());
      this.relicTexts = s.relics.map((r, i) =>
        this.scene.add.text(32 + i * 26, 112, RELICS[r].glyph, { ...TXT, fontSize: '14px', fontStyle: 'bold', color: '#fff' }).setOrigin(0.5).setScrollFactor(0).setDepth(102),
      );
    }
    s.relics.forEach((r, i) => {
      g.fillStyle(0x000000, 0.7).fillRect(20 + i * 26, 100, 24, 24);
      g.fillStyle(RELICS[r].color, 0.85).fillRect(22 + i * 26, 102, 20, 20);
    });

    // Skill (RUSH SLASH)
    const sx = 20;
    const sy = GAME_HEIGHT - 70;
    g.fillStyle(0x000000, 0.7).fillRect(sx, sy, 52, 52);
    g.fillStyle(s.skillReady ? 0x2b6cff : 0x25304a).fillRect(sx + 3, sy + 3, 46, 46);
    if (!s.skillReady) g.fillStyle(0x7a8cff, 0.55).fillRect(sx + 3, sy + 49 - 46 * s.skillProgress, 46, 46 * s.skillProgress);
    this.skillKey.setPosition(sx + 26, sy + 26).setColor(s.skillReady ? '#ffffff' : '#8890a8');
    this.skillName.setPosition(sx + 60, sy + 4).setColor(s.skillReady ? '#bfe3ff' : '#6a7490').setText(s.skillReady ? 'RUSH SLASH  READY' : 'RUSH SLASH');

    // Ultimate gauge
    const ux = sx + 60;
    const uy = sy + 28;
    const ratio = Math.min(1, s.ult / s.ultMax);
    const full = ratio >= 1;
    g.fillStyle(0x000000, 0.7).fillRect(ux - 2, uy - 2, 224, 24);
    g.fillStyle(0x2a1a4a).fillRect(ux, uy, 220, 20);
    g.fillStyle(full ? (Math.floor(now / 120) % 2 ? 0xffe066 : 0xff9ad5) : 0xb06cff).fillRect(ux, uy, 220 * ratio, 20);
    this.ultKey.setPosition(ux + 12, uy + 10).setColor(full ? '#000' : '#fff');
    this.ultReady.setPosition(ux + 30, uy + 3).setText(full ? 'OVER BREAK  READY!' : `OVER BREAK ${Math.floor(ratio * 100)}%`).setColor(full ? '#000' : '#e8d8ff');
  }
}
