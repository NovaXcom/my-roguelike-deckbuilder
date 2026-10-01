import { alive, currentIntent, nextIntent, previewSkill, type BattleState } from './battle';
import { SKILLS } from './data';

/**
 * 初心者向けの「今やるべきこと」ヒント(任意表示)。1つだけ返す。
 * 答えを教えすぎないよう、具体的なスキル名ではなく方針を示す。
 */
export function recommend(s: BattleState): string | null {
  if (s.phase !== 'player') return null;
  const e = s.enemy;
  const it = currentIntent(s);
  const usable = s.party.flatMap((m, mi) => (alive(m) && !m.acted ? m.skills.filter((id) => m.cooldowns[id] === 0).map((id) => ({ mi, id })) : []));
  if (usable.length === 0) return 'ターンを終了しよう（待機も選べる）';

  const canBreak = usable.some(({ mi, id }) => previewSkill(s, SKILLS[id], mi).breaks);
  const hasMagic = usable.some(({ id }) => SKILLS[id].kind === 'magic' && !!SKILLS[id].damage);
  const lowest = s.party.filter(alive).reduce((a, m) => Math.min(a, m.hp / m.maxHp), 1);

  if (e.broken) return hasMagic ? '今がチャンス! 魔法でチェイン' : 'ブレイク中。魔法が使えるターンを待とう';
  if (lowest < 0.35 && usable.some(({ id }) => !!SKILLS[id].healAll || !!SKILLS[id].guardSelf)) return 'HPが危ない。回復かガードを';
  if (it.kind === 'heavy' || it.kind === 'charge' || nextIntent(s).kind === 'heavy') {
    return canBreak ? 'ブレイクで強攻撃を阻止できる! 今ならシールドを削り切れる' : 'シールドを削って、強攻撃の前にブレイクを狙おう';
  }
  if (it.target === 'back') return '後衛が狙われる。挑発で前衛に引きつけよう';
  if (canBreak) return 'シールドを削り切れる。ブレイクを狙おう';
  if (e.guard > 0) return '敵の防御がダメージを吸収中。大きな一撃かDoTを';
  return 'シールドを削ってブレイクを狙おう';
}
