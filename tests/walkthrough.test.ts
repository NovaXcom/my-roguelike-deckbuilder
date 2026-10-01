// 攻略ルート（リファレンス）。設計した全ルートが実際にクリア可能であることを検証する。
import { describe, expect, it } from 'vitest';
import { EVENTS } from '../src/data';
import { availableEvents, connect, travelOptions } from '../src/engine/logic';
import { startDay, playEvent, tellTo, travelTo, waitMinutes, type Gen } from '../src/engine/session';
import { newState, nextLoop, recCount } from '../src/engine/state';
import type { LocId, NpcId, Step } from '../src/engine/types';

const T = (h: number, m = 0) => h * 60 + m;
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;

function drain(g: Gen, choices: number[] = []): Step[] {
  const out: Step[] = [];
  let ci = 0;
  let r = g.next();
  while (!r.done) { out.push(r.value); r = g.next(r.value.t === 'choice' ? choices[ci++] ?? 0 : undefined); }
  return out;
}

class Bot {
  s = newState();
  begin(choices: number[] = [0]) { drain(startDay(this.s), choices); }
  at(loc: LocId, h?: number, m = 0) {
    if (this.s.loc !== loc) {
      if (!travelOptions(this.s).some((o) => o.id === loc)) throw new Error(`L${this.s.loop} ${fmt(this.s.time)} ${this.s.loc} から ${loc} へ行けない`);
      drain(travelTo(this.s, loc));
    }
    if (h !== undefined && this.s.time < T(h, m)) drain(waitMinutes(this.s, T(h, m) - this.s.time));
    return this;
  }
  do(id: string, choices: number[] = []) {
    const ev = EVENTS.find((e) => e.id === id)!;
    if (!ev) throw new Error(`no event ${id}`);
    if (!availableEvents(this.s).includes(ev)) {
      throw new Error(`L${this.s.loop} ${fmt(this.s.time)} @${this.s.loc}: 「${id}」を実行できない`);
    }
    drain(playEvent(this.s, ev), choices);
    return this;
  }
  tell(npc: NpcId, fact: string) { drain(tellTo(this.s, npc, fact)); return this; }
  link(a: string, b: string) { const r = connect(this.s, a, b); if (!r.fresh) throw new Error(`推理に失敗 ${a}+${b}`); return this; }
  endDay() {
    drain(waitMinutes(this.s, 3000));
    if (!this.s.over) nextLoop(this.s);
  }
}

describe('攻略ルート：TRUE END まで8周で到達できる', () => {
  it('全イベントの条件・時間制約が整合している', () => {
    const b = new Bot();

    // ── LOOP 1：ごく普通の一日 ──
    b.begin();
    b.at('shopping', 9, 0).do('tad_hello').do('han_hello');
    b.at('station', 14, 50).do('st_close');
    b.at('beach', 17, 30).do('min_beach').do('gen_monument');
    b.at('shrine', 23, 40).do('gi_talk1');
    b.endDay();
    expect(b.s.loop).toBe(2);
    expect(b.s.facts.girl_not_day).toBeDefined();

    // ── LOOP 2：伝える ──
    b.begin();
    b.do('kubo_hello');
    b.at('shopping', 9, 0).do('tad_hello').do('tad_shelf').do('han_hello');
    b.at('shopping', 8, 45);
    b.tell('mina', 'station_3pm').tell('tadokoro', 'blackout_2347').tell('tadokoro', 'loop_confirmed');
    b.at('park').do('yu_hello').do('yu_aware_talk').do('yu_sketch').do('yu_girl_talk');
    b.at('station', 14, 10).do('kur_talk');
    b.at('station', 14, 30).do('st_mina_clash');
    b.do('st_overhear').do('st_close').do('st_warehouse');
    expect(b.s.facts.key_basement).toBeDefined();
    expect(b.s.facts.warehouse_empty).toBeDefined();
    b.at('beach', 17, 30).do('min_follow').do('min_beach').do('min_if_a');
    b.at('station', 19, 56).do('st_figure');
    b.at('shrine', 21, 50).do('asa_ema').do('asa_hello').do('shr_follow');
    b.at('shrine', 23, 40).do('gi_why');
    b.endDay();

    // ── LOOP 3：資料と診療所 ──
    b.begin();
    b.do('kubo_hello');
    b.at('school', 9, 0).do('sch_archive');
    b.link('date_school', 'date_shrine').link('dates_same', 'date_beach').link('every_year_817', 'expiry_817');
    b.do('sin_names').do('sin_hello');
    b.at('clinic').do('sae_hello').tell('saeki', 'loop_confirmed');
    b.at('beach', 17, 30).do('min_kei');
    b.at('clinic', 19, 15).do('sae_peek');
    b.at('clinic', 19, 50).do('sae_cert').do('sae_chart');
    b.endDay();

    // ── LOOP 4：病衣の男 → 地下施設 ──
    b.begin();
    b.do('kubo_hello');
    expect(b.s.facts.ooya_kanrinin).toBeDefined();
    b.link('cert_18', 'patient_station_2000');
    b.at('station', 19, 56).do('st_figure');
    expect(b.s.facts.door_code).toBeDefined();
    b.at('underground').do('u_hall').do('u_log').do('u_monitors').do('u_sister').do('u_self').do('u_shiori');
    b.link('names_match', 'capsules').link('town_is_memory', 'self_patient');
    b.at('shrine', 23, 40).do('gi_name').do('gi_request');
    b.endDay();
    expect(b.s.facts.girl_name).toBeDefined();

    // ── LOOP 5：ミナ・黒田・佐伯 ──
    b.begin();
    b.do('home_storeroom');
    b.at('station').do('kur_talk').do('st_tracks');
    b.link('tracks_end', 'kuroda_daughter');
    b.do('kur_rec');
    b.at('clinic', 12, 0).do('sae_hello').do('sae_secret');
    b.at('beach', 17, 30).do('min_accident').do('min_truth').do('min_rec');
    b.endDay();

    // ── LOOP 6：商店街・学校・診療所・夜のコンビニ ──
    b.begin();
    b.do('kubo_rec');
    b.at('shopping', 9, 0).do('han_hello').do('han_rec').do('shi_rec');
    b.at('school').do('sin_hello').do('sin_rec');
    b.at('clinic', 12, 0).do('sae_hello').do('sae_rec');
    b.at('shopping', 23, 47).do('tad_candle');
    b.endDay();

    // ── LOOP 7：公園・神社・海 ──
    b.begin();
    b.at('park', 9, 0).do('yu_play').do('yu_rec');
    b.at('shrine').do('asa_hello').do('asa_scroll').do('asa_rec');
    b.at('beach').tell('gen', 'light_2350');
    b.do('gen_hello').do('gen_light').do('gen_rec');
    b.endDay();
    expect(recCount(b.s)).toBe(11);

    // ── LOOP 8：最後の選択 ──
    b.begin();
    b.at('station', 17, 0);
    b.at('underground');
    drain(waitMinutes(b.s, 3000), [3]);
    expect(b.s.over).toBe('end_tomorrow');
    expect(b.s.endings).toEqual(['end_tomorrow']);
  });
});
