import { getCard } from './cards';
import { CHARACTERS, ENEMIES } from './characters';
import { Rng } from './rng';
import type { CardInstance, CharacterDef, CharacterId, Combatant, EnemyState, Intent } from './types';

export const HAND_SIZE = 5;
export const BASE_ENERGY = 3;

export type BattlePhase = 'player' | 'enemy' | 'won' | 'lost';

export interface BattleState {
  character: CharacterDef;
  player: Combatant;
  enemy: EnemyState;
  energy: number;
  maxEnergy: number;
  drawPile: CardInstance[];
  hand: CardInstance[];
  discardPile: CardInstance[];
  exhaustPile: CardInstance[];
  turn: number;
  phase: BattlePhase;
  rng: Rng;
}

export type BattleEvent =
  | { type: 'damage'; target: 'player' | 'enemy'; amount: number; blocked: number }
  | { type: 'block'; target: 'player' | 'enemy'; amount: number }
  | { type: 'draw'; count: number }
  | { type: 'shuffle' };

export function createBattle(characterId: CharacterId, seed: number, enemyId = 'slime'): BattleState {
  const character = CHARACTERS[characterId];
  const enemyDef = ENEMIES[enemyId];
  const rng = new Rng(seed);
  let uid = 0;
  const drawPile = rng.shuffle(character.starterDeck.map((defId) => ({ uid: uid++, defId })));
  return {
    character,
    player: { hp: character.maxHp, maxHp: character.maxHp, block: 0 },
    enemy: { def: enemyDef, hp: enemyDef.maxHp, maxHp: enemyDef.maxHp, block: 0, patternIndex: 0 },
    energy: 0,
    maxEnergy: BASE_ENERGY,
    drawPile,
    hand: [],
    discardPile: [],
    exhaustPile: [],
    turn: 0,
    phase: 'player',
    rng,
  };
}

export function currentIntent(s: BattleState): Intent {
  const p = s.enemy.def.pattern;
  return p[s.enemy.patternIndex % p.length];
}

/** 山札からn枚引く。山札が尽きたら捨て札をシャッフルして山札にする。 */
export function drawCards(s: BattleState, n: number): BattleEvent[] {
  const events: BattleEvent[] = [];
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    if (s.drawPile.length === 0) {
      if (s.discardPile.length === 0) break;
      s.drawPile = s.rng.shuffle(s.discardPile);
      s.discardPile = [];
      events.push({ type: 'shuffle' });
    }
    s.hand.push(s.drawPile.pop()!);
    drawn++;
  }
  if (drawn > 0) events.push({ type: 'draw', count: drawn });
  return events;
}

/** プレイヤーターン開始: エナジー全回復・ブロック消滅・5枚ドロー */
export function startPlayerTurn(s: BattleState): BattleEvent[] {
  s.turn += 1;
  s.phase = 'player';
  s.energy = s.maxEnergy;
  s.player.block = 0;
  return drawCards(s, HAND_SIZE);
}

export function canPlay(s: BattleState, handIndex: number): boolean {
  const inst = s.hand[handIndex];
  return s.phase === 'player' && !!inst && getCard(inst.defId).cost <= s.energy;
}

function applyDamage(target: Combatant, amount: number, who: 'player' | 'enemy'): BattleEvent {
  const blocked = Math.min(target.block, amount);
  target.block -= blocked;
  const dealt = amount - blocked;
  target.hp = Math.max(0, target.hp - dealt);
  return { type: 'damage', target: who, amount: dealt, blocked };
}

function checkEnd(s: BattleState): void {
  if (s.enemy.hp <= 0) s.phase = 'won';
  else if (s.player.hp <= 0) s.phase = 'lost';
}

/** 手札のカードを使用。使用不可なら null。 */
export function playCard(s: BattleState, handIndex: number): BattleEvent[] | null {
  if (!canPlay(s, handIndex)) return null;
  const inst = s.hand[handIndex];
  const def = getCard(inst.defId);
  s.energy -= def.cost;
  s.hand.splice(handIndex, 1);
  s.discardPile.push(inst);

  const events: BattleEvent[] = [];
  if (def.damage) events.push(applyDamage(s.enemy, def.damage, 'enemy'));
  if (def.block) {
    s.player.block += def.block;
    events.push({ type: 'block', target: 'player', amount: def.block });
  }
  if (def.draw) events.push(...drawCards(s, def.draw));
  checkEnd(s);
  return events;
}

/** ターン終了: 手札を全て捨て札へ → 敵ターン(インテント実行) → 次のプレイヤーターン開始 */
export function endPlayerTurn(s: BattleState): BattleEvent[] {
  if (s.phase !== 'player') return [];
  s.discardPile.push(...s.hand);
  s.hand = [];
  s.phase = 'enemy';

  const events: BattleEvent[] = [];
  s.enemy.block = 0;
  const intent = currentIntent(s);
  if (intent.kind === 'attack') events.push(applyDamage(s.player, intent.value, 'player'));
  else if (intent.kind === 'defend') {
    s.enemy.block += intent.value;
    events.push({ type: 'block', target: 'enemy', amount: intent.value });
  }
  s.enemy.patternIndex += 1;
  checkEnd(s);
  if (s.phase === 'enemy') events.push(...startPlayerTurn(s));
  return events;
}
