import {
  canUse, canWait, currentIntent, endPlayerTurn, previewSkill, skillCost, usePotion, useSkill, wait, type BattleState,
} from '../../src/core/battle';
import { SKILLS } from '../../src/core/data';
import type { EquipItem } from '../../src/core/equipment';
import type { MapNode } from '../../src/core/map';
import type { MetaState } from '../../src/core/meta';
import {
  availableNodes, bankRun, buyItem, buyPotion, canEquip, enterNode, equip, finishBattle, newRun, openChest,
  priceOf, rest, sellItem, shopStock, startBattle, upgradeSkill, type RunState,
} from '../../src/core/run';

/** 1戦闘を単純な貪欲AIで最後まで進める（バランス確認・不変条件テスト用） */
export const botOptions = { allowWait: true, alwaysWait: false };

export function autoBattle(run: RunState, node: MapNode): BattleState {
  const s = startBattle(run, node);
  for (let guard = 0; s.phase === 'player' && guard < 300; guard++) {
    const avg = s.party.reduce((a, m) => a + m.hp / m.maxHp, 0) / s.party.length;
    if (avg < 0.4 && run.potions > 0 && usePotion(s)) run.potions--;
    for (let n = 0; n < 6 && s.ap > 0 && s.phase === 'player'; n++) {
      let best: { mi: number; id: string } | null = null;
      let bestScore = -1;
      s.party.forEach((m, mi) => {
        for (const id of m.skills) {
          if (!canUse(s, mi, id)) continue;
          const sk = SKILLS[id];
          const p = previewSkill(s, sk, mi);
          let score = p.hp - p.absorbed * 0.5 + p.shield * 0.8 + (p.breaks ? 15 : 0) + (p.chain ? 20 : 0);
          score += (p.reaction ? 10 : 0) + p.conds.length * 4;
          // 強攻撃・溜めの前にはブレイクを狙う
          const it = currentIntent(s);
          if (p.breaks && (it.kind === 'heavy' || it.kind === 'charge')) score += 25;
          if (sk.healAll) score += avg < 0.6 ? 30 : 0;
          if (sk.guardSelf || sk.guardAlly) score += 4;
          if (sk.taunt) score += 3;
          score -= (skillCost(sk) - 1) * 6; // 高コストは割高
          if (score > bestScore) { bestScore = score; best = { mi, id }; }
        }
      });
      if (botOptions.alwaysWait && s.turn % 2 === 1 && canWait(s, 0)) { wait(s, 0); continue; }
      if (best && (bestScore >= 6 || !botOptions.allowWait)) useSkill(s, (best as { mi: number }).mi, (best as { id: string }).id);
      else if (canWait(s, 0)) wait(s, 0);
      else if (canWait(s, 1)) wait(s, 1);
      else if (best) useSkill(s, (best as { mi: number }).mi, (best as { id: string }).id);
      else break;
    }
    if (s.phase === 'player') endPlayerTurn(s);
  }
  return s;
}

const gearScore = (i: EquipItem | null): number =>
  i ? i.stats.hp * 0.3 + i.stats.power * 4 + i.stats.guard * 2 + i.stats.breakBonus * 2 + (i.skill ? 10 : 0) : 0;

/** 拾った装備を評価し、最も伸びるキャラに装備 / 伸びなければ売却 */
export function autoEquip(run: RunState, item: EquipItem): void {
  let bestMember = -1;
  let bestGain = 0;
  run.party.forEach((m, i) => {
    if (!canEquip(run, i, item)) return;
    const gain = gearScore(item) - gearScore(m.gear[item.slot]);
    if (gain > bestGain) { bestGain = gain; bestMember = i; }
  });
  if (bestMember >= 0) equip(run, bestMember, item);
  else sellItem(run, item);
}

/** スキルポイントを、使い慣れた基本スキルから順に強化 */
export function autoSpendSkillPoints(run: RunState): void {
  const order = ['slash', 'shield_bash', 'firebolt', 'thunder', 'ice_lance'];
  for (let guard = 0; guard < 30 && run.skillPoints > 0; guard++) {
    let any = false;
    run.party.forEach((_, mi) => {
      for (const id of order) if (upgradeSkill(run, mi, id)) { any = true; return; }
    });
    if (!any) break;
  }
}

export function autoRun(meta: MetaState, seed: number): RunState {
  const run = newRun(meta, seed);
  for (let step = 0; !run.finished && step < 60; step++) {
    const nodes = availableNodes(run);
    const pick = (t: string) => nodes.find((n) => n.type === t);
    const low = run.party.some((m) => m.hp < 40);
    const safeBattle = nodes.find((n) => n.type === 'battle' && !n.danger);
    const node = (low ? pick('rest') : undefined) ?? pick('chest') ?? pick('shop') ?? pick('rest') ?? safeBattle ?? pick('battle') ?? pick('elite') ?? nodes[0];
    enterNode(run, node.id);
    if (node.type === 'battle' || node.type === 'boss' || node.type === 'elite') {
      const s = autoBattle(run, node);
      const r = finishBattle(run, s, node);
      if (r.item) autoEquip(run, r.item);
      autoSpendSkillPoints(run);
    } else if (node.type === 'chest' || node.type === 'cursed') {
      const r = openChest(run, node.type === 'cursed');
      if (r.item) autoEquip(run, r.item);
    } else if (node.type === 'rest') {
      rest(run, 'heal');
    } else if (node.type === 'shop') {
      const stock = shopStock(run, node.id);
      stock.items.forEach((it, idx) => {
        if (it && gearScore(it) > 12 && run.gold >= priceOf(it)) {
          const bought = buyItem(run, node.id, idx);
          if (bought) autoEquip(run, bought);
        }
      });
      while (run.gold >= 30 && buyPotion(run, node.id)) { /* buy */ }
    }
  }
  bankRun(meta, run);
  return run;
}
