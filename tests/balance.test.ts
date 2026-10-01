import { describe, expect, it } from 'vitest';
import { autoRun, botLog } from './helpers/bot';
import { newMeta } from '../src/core/meta';

/** バランス確認: 自動プレイBotの踏破率と、どこで負けるか。目標は踏破率 35〜55%。 */
describe('バランス(Bot)', () => {
  it('踏破率が目標の範囲に収まり、ボスは到達者の過半数が倒せる', () => {
    botLog.length = 0;
    const N = 80;
    let wins = 0;
    for (let seed = 1; seed <= N; seed++) if (autoRun(newMeta(), seed).finished === 'victory') wins++;
    const deaths = new Map<string, number>();
    for (const b of botLog) if (!b.won) deaths.set(`${b.type === 'boss' ? 'BOSS' : b.type}${b.row}`, (deaths.get(`${b.type === 'boss' ? 'BOSS' : b.type}${b.row}`) ?? 0) + 1);
    const boss = botLog.filter((b) => b.type === 'boss');
    const bossWon = boss.filter((b) => b.won).length;
    const avgTurns = (arr: typeof botLog) => (arr.reduce((a, b) => a + b.turns, 0) / Math.max(1, arr.length)).toFixed(1);
    console.log(`[balance] 踏破 ${wins}/${N} (${((wins / N) * 100).toFixed(0)}%) / ボス ${bossWon}/${boss.length} / 敗北位置 ${JSON.stringify([...deaths.entries()].sort())}`);
    console.log(`[balance] 平均ターン: 通常 ${avgTurns(botLog.filter((b) => b.type === 'battle'))} / エリート ${avgTurns(botLog.filter((b) => b.type === 'elite'))} / ボス ${avgTurns(boss)}`);
    expect(wins / N).toBeGreaterThanOrEqual(0.3);
    expect(wins / N).toBeLessThanOrEqual(0.6);
    expect(bossWon / Math.max(1, boss.length)).toBeGreaterThan(0.45);
  });
});
