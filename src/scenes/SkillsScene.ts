import Phaser from 'phaser';
import { audio } from '../audio';
import { MAX_SKILL_LEVEL, effectiveSkill, skillUpgradeCost } from '../core/battle';
import { ELEMENT_COLOR, MEMBERS, SKILLS } from '../core/data';
import { memberSkills, needsBranch, skillLevel, upgradeSkill } from '../core/run';
import { game } from '../game';
import { drawBackground, txt } from '../ui/art';
import { skillSummary } from '../ui/skillText';
import { hex, makeButton } from '../ui/widgets';
import { H, W } from './TitleScene';

/** スキル強化: 戦闘で得たスキルポイントでスキルのLvを上げる(Lv2: ×1.2 / Lv3: ×1.45・CD-1)。 */
export class SkillsScene extends Phaser.Scene {
  constructor() {
    super('Skills');
  }

  create(): void {
    const run = game.run;
    if (!run) { this.scene.start('Town'); return; }
    drawBackground(this, W, H);
    txt(this, W / 2, 36, 'カード強化', 36, '#f6e3b4', { fontStyle: 'bold', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5);
    txt(this, W / 2, 76, `スキルポイント  ${run.skillPoints} SP　（Lv1→2: 1SP / Lv2→3: 2SP。戦闘勝利で1、エリートで2獲得）`, 16, '#ffe066', { fontStyle: 'bold' }).setOrigin(0.5);

    run.party.forEach((m, i) => {
      const x0 = 30 + i * 625;
      const def = MEMBERS[m.role];
      const g = this.add.graphics();
      g.fillStyle(0x2d3748, 0.92).fillRoundedRect(x0, 102, 590, 520, 14).lineStyle(3, def.color, 1).strokeRoundedRect(x0, 102, 590, 520, 14);
      txt(this, x0 + 20, 112, `${def.name}（${def.position}）`, 20, hex(def.color), { fontStyle: 'bold' });
      const list = memberSkills(run, i);
      const step = Math.min(92, Math.floor(470 / Math.max(1, list.length)));
      list.forEach((sid, k) => {
        const base = SKILLS[sid];
        const lv = skillLevel(run, i, sid);
        const y = 144 + k * step;
        const col = base.element !== 'none' ? ELEMENT_COLOR[base.element] : base.kind === 'support' ? 0x6fcf97 : 0xe9d8c4;
        g.fillStyle(col, 1).fillRoundedRect(x0 + 16, y + 4, 6, step - 14, 3);
        txt(this, x0 + 32, y, base.name, 18, '#fff', { fontStyle: 'bold' });
        txt(this, x0 + 32 + 190, y + 2, `Lv${lv}${lv >= MAX_SKILL_LEVEL ? ' (MAX)' : ''}${lv >= 3 && base.branches ? ` ${base.branches.find((b) => b.id === m.branches[sid])?.name ?? ''}` : ''}`, 16, lv > 1 ? '#ffe066' : '#9fb0c8', { fontStyle: 'bold' });
        const cur = effectiveSkill(base, lv, m.branches[sid]);
        const choosing = lv < MAX_SKILL_LEVEL && needsBranch(sid, lv);
        if (!choosing) txt(this, x0 + 32, y + 28, `${skillSummary(cur).join('  ')}　疲労 ${cur.cooldown}`, 14, '#d8d0c4');
        if (choosing) {
          // Lv3: 2つの分岐から1つを選ぶ
          const cost = skillUpgradeCost(lv);
          base.branches!.forEach((br, bi) => {
            txt(this, x0 + 32, y + 26 + bi * 16, `${br.id.toUpperCase()} ${br.name}: ${br.text}`, 12, '#7be495');
            makeButton(this, x0 + 530, y + 12 + bi * 32, 100, 28, `${br.id.toUpperCase()} ${cost}SP`, () => {
              if (upgradeSkill(run, i, sid, br.id)) { audio.play('equip'); this.scene.restart(); }
            }, { size: 13, color: 0x7be495, enabled: run.skillPoints >= cost });
          });
        } else if (lv < MAX_SKILL_LEVEL) {
          const nxt = effectiveSkill(base, lv + 1);
          txt(this, x0 + 32, y + 50, `→ ${skillSummary(nxt).join('  ')}　疲労 ${nxt.cooldown}`, 14, '#7be495');
          const cost = skillUpgradeCost(lv);
          makeButton(this, x0 + 510, y + 36, 130, 44, `強化 ${cost}SP`, () => {
            if (upgradeSkill(run, i, sid)) { audio.play('equip'); this.scene.restart(); }
          }, { size: 16, color: 0x7be495, enabled: run.skillPoints >= cost });
        }
      });
    });
    makeButton(this, W / 2, 668, 240, 50, '← マップへ', () => this.scene.start('Map'), { size: 22 });
  }
}
