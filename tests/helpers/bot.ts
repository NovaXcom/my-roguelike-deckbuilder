import {
  LINK, canUse, canWait, currentIntent, defaultTarget, livingEnemies, endPlayerTurn, previewSkill, skillCost, usePotion, useSkill, wait, type BattleState,
} from '../../src/core/battle';
import { SKILLS } from '../../src/core/data';
import type { EquipItem } from '../../src/core/equipment';
import type { MapNode } from '../../src/core/map';
import type { MetaState } from '../../src/core/meta';
import {
  availableNodes, bankRun, buyItem, buyPotion, canEquip, enterNode, equip, finishBattle, newRun, openChest,
  priceOf, rest, sellItem, shopStock, startBattle, upgradeSkill, addCard, type RunState,
} from '../../src/core/run';

/** 1戦闘を単純な貪欲AIで最後まで進める（バランス確認・不変条件テスト用） */
/** バランス確認用: 戦闘ごとの結果 */
export const botLog: { row: number; type: string; ids: string[]; won: boolean; turns: number }[] = [];

export const botOptions = { allowWait: true, alwaysWait: false, cardThreshold: 21 };

export function autoBattle(run: RunState, node: MapNode): BattleState {
  const s = startBattle(run, node);
  for (let guard = 0; s.phase === 'player' && guard < 300; guard++) {
    const avg = s.party.reduce((a, m) => a + m.hp / m.maxHp, 0) / s.party.length;
    if (avg < 0.4 && run.potions > 0 && usePotion(s)) run.potions--;
    for (let n = 0; n < 6 && s.ap > 0 && s.phase === 'player'; n++) {
      let best: { mi: number; id: string; ti: number } | null = null;
      let bestScore = -1;
      s.party.forEach((m, mi) => {
        for (const id of m.skills) {
          if (!canUse(s, mi, id)) continue;
          const sk = SKILLS[id];
          const offensive = !!sk.damage || !!sk.breakPower;
          const targets = offensive ? livingEnemies(s) : [defaultTarget(s)];
          const scoreAt = (ti: number): number => {
            const e = s.enemies[ti];
            const p = previewSkill(s, sk, mi, ti);
            let score = p.hp - p.absorbed * 0.5 + p.shield * 0.8 + (p.breaks ? 15 : 0) + (p.chain ? 20 : 0);
            score += (p.reaction ? 10 : 0) + p.conds.length * 4;
            const it = currentIntent(s, ti);
            // 強攻撃・溜めの前にはブレイクを狙う / 倒せる敵・守護役を優先
            if (p.breaks && (it.kind === 'heavy' || it.kind === 'charge')) score += 25;
            if (p.hp - p.absorbed >= e.hp) score += 22;
            if (p.breaks && e.def.traits?.protects) score += 10;
            if (p.protectedBy) score -= 4;
            return score;
          };
          let extra = 0;
          if (sk.healAll) extra += avg < 0.6 ? 30 : 0;
          if (sk.guardSelf || sk.guardAlly) extra += 4;
          if (sk.taunt) extra += 3;
          extra -= (skillCost(sk) - 1) * 6; // 高コストは割高
          if (sk.aoe) {
            const score = targets.reduce((a, ti) => a + scoreAt(ti), 0) + extra;
            if (score > bestScore) { bestScore = score; best = { mi, id, ti: targets[0] }; }
            continue;
          }
          for (const ti of targets) {
            const score = scoreAt(ti) + extra;
            if (score > bestScore) { bestScore = score; best = { mi, id, ti }; }
          }
        }
      });
      // 連携カード(2人共通)。直前の手を参照するものを、効果が見込めるときに使う
      for (const c of s.link.hand) {
        if (!canUse(s, LINK, c.defId)) continue;
        const lk = SKILLS[c.defId];
        let v = -1;
        if (lk.link === 'chase' && s.lastHit) {
          const p = previewSkill(s, SKILLS[s.lastHit.skillId], s.lastHit.member, s.lastHit.enemy);
          v = Math.floor(p.hp * 0.5) * 0.9 + (s.enemies[s.lastHit.enemy].hp <= p.hp * 0.5 ? 20 : 0);
        } else if (lk.link === 'counter') v = s.party[0].guard > 0 && s.enemies.some((e) => e.hp > 0) ? 9 : 3;
        else if (lk.link === 'barrier') v = avg < 0.7 ? 16 : 3;
        else if (lk.link === 'unison') v = s.party.some((m) => m.skills.some((id) => !!SKILLS[id].damage && canUse(s, s.party.indexOf(m), id))) ? 10 : 0;
        else if (lk.link === 'enchant') v = s.lastMagic && s.party[0].deck.hand.some((h) => !!SKILLS[h.defId].damage) ? 9 : 0;
        else if (lk.link === 'convert') v = 4;
        v -= skillCost(lk) * 2;
        if (v > bestScore) { bestScore = v; best = { mi: LINK, id: c.defId, ti: defaultTarget(s) }; }
      }
      const b = best as { mi: number; id: string; ti: number } | null;
      if (botOptions.alwaysWait && s.turn % 2 === 1 && canWait(s, 0)) { wait(s, 0); continue; }
      if (b && (bestScore >= 6 || !botOptions.allowWait)) useSkill(s, b.mi, b.id, b.ti);
      else if (canWait(s, 0)) wait(s, 0);
      else if (canWait(s, 1)) wait(s, 1);
      else if (b) useSkill(s, b.mi, b.id, b.ti);
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
      for (const id of order) if (upgradeSkill(run, mi, id, 'a')) { any = true; return; }
    });
    if (!any) break;
  }
}

/** カード報酬: 攻撃・ブレイク・全体の価値が高いものを選ぶ(防御系は低評価) */
export function autoPickCard(run: RunState, cards?: string[]): void {
  if (!cards?.length) return;
  const val = (id: string): number => {
    const c = SKILLS[id];
    return (c.damage ?? 0) * (c.aoe ? 1.6 : 1) + (c.breakPower ?? 0) * 0.7 + (c.guardSelf ?? 0) * 0.3 - c.cooldown * 1.5;
  };
  const best = [...cards].sort((a, b) => val(b) - val(a))[0];
  if (val(best) >= botOptions.cardThreshold) addCard(run, best);
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
      botLog.push({ row: node.row, type: node.type, ids: s.enemies.map((e) => e.def.id), won: s.phase === 'won', turns: s.turn });
      const r = finishBattle(run, s, node);
      if (r.item) autoEquip(run, r.item);
      autoPickCard(run, r.cards);
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
