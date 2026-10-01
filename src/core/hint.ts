import { alive, canUse, currentIntent, livingEnemies, nextIntent, previewSkill, type BattleState } from './battle';
import { SKILLS } from './data';

/**
 * 初心者向けの「今やるべきこと」ヒント(任意表示)。1つだけ返す。
 * 答えを教えすぎないよう、具体的なスキル名ではなく方針を示す。
 */
export function recommend(s: BattleState): string | null {
  if (s.phase !== 'player') return null;
  const alive_ = livingEnemies(s);
  if (!alive_.length) return null;
  const usable = s.party.flatMap((m, mi) => m.skills.filter((id) => canUse(s, mi, id)).map((id) => ({ mi, id })));
  if (usable.length === 0) return 'ターンを終了しよう（待機も選べる）';

  const hasMagic = usable.some(({ id }) => SKILLS[id].kind === 'magic' && !!SKILLS[id].damage);
  const lowest = s.party.filter(alive).reduce((a, m) => Math.min(a, m.hp / m.maxHp), 1);
  const multi = alive_.length > 1;
  const name = (i: number): string => s.enemies[i].def.name;
  const canBreak = (ei: number): boolean => usable.some(({ mi, id }) => previewSkill(s, SKILLS[id], mi, ei).breaks);

  const brokenIdx = alive_.find((i) => s.enemies[i].broken);
  if (brokenIdx !== undefined) {
    return hasMagic ? `今がチャンス! ${multi ? name(brokenIdx) + 'に' : ''}魔法でチェイン` : 'ブレイク中。魔法が使えるターンを待とう';
  }
  if (lowest < 0.35 && usable.some(({ id }) => !!SKILLS[id].healAll || !!SKILLS[id].guardSelf)) return 'HPが危ない。回復かガードを';

  const threat = alive_.find((i) => {
    const e = s.enemies[i];
    const it = currentIntent(s, i);
    return !e.broken && (it.kind === 'heavy' || it.kind === 'charge' || nextIntent(s, i).kind === 'heavy');
  });
  if (threat !== undefined) {
    const who = multi ? `${name(threat)}の` : '';
    return canBreak(threat) ? `${who}強攻撃をブレイクで阻止できる! 今ならシールドを削り切れる` : `${multi ? name(threat) + 'の' : ''}シールドを削って、強攻撃の前にブレイクを狙おう`;
  }
  const protector = alive_.find((i) => !s.enemies[i].broken && s.enemies[i].def.traits?.protects);
  if (multi && protector !== undefined) return `${name(protector)}が仲間を守っている。ブレイクで守護を崩そう`;
  if (alive_.some((i) => currentIntent(s, i).target === 'back')) return '後衛が狙われる。挑発で前衛に引きつけよう';
  const breakable = alive_.find(canBreak);
  if (breakable !== undefined) return `${multi ? name(breakable) + 'の' : ''}シールドを削り切れる。ブレイクを狙おう`;
  if (alive_.some((i) => s.enemies[i].guard > 0)) return '敵の防御がダメージを吸収中。大きな一撃かDoTを';
  return 'シールドを削ってブレイクを狙おう';
}
