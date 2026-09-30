import { newMeta, parseMeta, type MetaState } from './core/meta';
import { newRun, type RunState } from './core/run';

const KEY = 'partyrogue.meta.v1';

function load(): MetaState {
  try {
    return parseMeta(localStorage.getItem(KEY));
  } catch {
    return newMeta(); // localStorage が使えない環境でも動作させる
  }
}

/** シーン間で共有する状態。meta=拠点の永続成長 / run=現在の挑戦 */
export const game: { meta: MetaState; run: RunState | null } = { meta: load(), run: null };

export function saveMeta(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(game.meta));
  } catch {
    /* 保存できない環境では無視 */
  }
}

export function startRun(): RunState {
  game.run = newRun(game.meta, (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
  return game.run;
}
