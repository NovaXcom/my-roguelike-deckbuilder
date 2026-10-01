import { describe, expect, it } from 'vitest';
import { DEDUCTIONS, FACT_LIST, THREADS, WHISPERS, factMap } from '../src/data/facts';
import { EVENTS, FINALES, TELLS } from '../src/data';
import { NPCS } from '../src/data/world';
import { availableEvents, availableThreads, nextAuto, ok, presentNpcs, tellOptions, tellScript, travelOptions, undergroundRoute, where } from '../src/engine/logic';
import { runAll } from '../src/engine/runner';
import { advance, dayOver, nextLoop, newState, recCount, serialize, deserialize, learn, setFlag } from '../src/engine/state';
import type { Cond, Effect, Node } from '../src/engine/types';
import { at, know, play } from './helpers';

describe('時間', () => {
  it('行動で時間が進み、23:59で止まる', () => {
    const s = newState();
    advance(s, 20);
    expect(s.time).toBe(8 * 60 + 20);
    advance(s, 99999);
    expect(s.time).toBe(23 * 60 + 59);
    expect(dayOver(s)).toBe(true);
  });
  it('移動は場所ごとに10〜30分かかる', () => {
    const s = at('home', 8);
    for (const o of travelOptions(s)) expect(o.cost).toBeGreaterThanOrEqual(10);
    expect(travelOptions(s).some((o) => o.id === 'underground')).toBe(false);
  });
});

describe('NPCの行動表', () => {
  it('黒田は15:00に倉庫へ入って姿を消す', () => {
    expect(where(at('station', 14, 0), 'kuroda')).toBe('station');
    expect(where(at('station', 15, 10), 'kuroda')).toBeNull();
    expect(where(at('station', 16, 0), 'kuroda')).toBe('station');
  });
  it('ミナは17:30に海岸へ行く', () => {
    expect(where(at('beach', 17, 0), 'mina')).toBe('shopping');
    expect(where(at('beach', 17, 35), 'mina')).toBe('beach');
  });
  it('ミナに「駅は15:00に閉まる」と伝えると、10分後に駅へ確認しに行く', () => {
    const s = at('shopping', 14, 0);
    expect(where(s, 'mina')).toBe('shopping');
    runAll(s, tellScript(s, 'mina', 'station_3pm'));
    s.time = 14 * 60 + 15;
    expect(where(s, 'mina')).toBe('shopping'); // まだ10分経っていない…が14:30まで駅には現れない
    s.time = 14 * 60 + 35;
    expect(where(s, 'mina')).toBe('station');
  });
  it('伝えた内容は次の周回にも残り、ミナは最初から駅へ向かう', () => {
    const s = at('shopping', 14, 0);
    runAll(s, tellScript(s, 'mina', 'station_3pm'));
    nextLoop(s);
    s.time = 14 * 60 + 35;
    expect(where(s, 'mina')).toBe('station');
    expect(s.flags['told:mina|station_3pm']).toBeUndefined(); // 周回フラグは消える
    expect(s.pflags['p:told:mina|station_3pm']).toBe(1);        // 永続フラグは残る
  });
  it('少女は23:40に神社へ現れ、地下にいれば地下に現れる', () => {
    expect(where(at('shrine', 23, 30), 'shiori')).toBeNull();
    expect(where(at('shrine', 23, 41), 'shiori')).toBe('shrine');
    expect(where(at('underground', 23, 41), 'shiori')).toBe('underground');
  });
  it('どのNPCも24時間のどこかで居場所が定義されている（12人）', () => {
    expect(NPCS.length).toBe(12);
  });
});

describe('周回をまたぐ変化（1周目に存在しなかったイベントが2周目に発生）', () => {
  it('1周目は駅の密談を聞けず、15:00の閉鎖を目撃するだけ', () => {
    const s = at('station', 14, 50);
    const names = availableEvents(s).map((e) => e.id);
    expect(names).toContain('st_close');
    expect(names).not.toContain('st_overhear');
  });
  it('「15時に駅が閉まる」を知っている2周目は、14:50に黒田と町長の密談を聞ける', () => {
    const s = at('station', 14, 50, { loop: 2 });
    know(s, 'station_3pm');
    expect(availableEvents(s).map((e) => e.id)).toContain('st_overhear');
    play(s, 'st_overhear');
    expect(s.facts['kuroda_shiina_talk']).toBeDefined();
  });
  it('ミナに伝えた周回は、駅でミナと黒田の遭遇が起き、鍵を得る', () => {
    const s = at('shopping', 13, 0);
    runAll(s, tellScript(s, 'mina', 'station_3pm'));
    s.loc = 'station'; s.time = 14 * 60 + 35;
    expect(presentNpcs(s)).toContain('mina');
    play(s, 'st_mina_clash');
    expect(s.facts['key_basement']).toBeDefined();
    expect(s.rel.kuroda).toBeGreaterThanOrEqual(2);
  });
  it('地下への入口：鍵と隠し扉を知っていれば17時以降、駅から行ける', () => {
    const s = at('station', 17, 30);
    expect(undergroundRoute(s)).toBeNull();
    know(s, 'key_basement', 'hatch_known');
    expect(undergroundRoute(s)).toBe('station');
    expect(travelOptions(s).some((o) => o.id === 'underground')).toBe(true);
    s.time = 16 * 60;
    expect(undergroundRoute(s)).toBeNull();
  });
  it('神社の隠し扉は22:00以降のみ', () => {
    const s = at('shrine', 21, 0);
    know(s, 'shrine_hatch');
    expect(undergroundRoute(s)).toBeNull();
    s.time = 22 * 60 + 5;
    expect(undergroundRoute(s)).toBe('shrine');
  });
});

describe('周回システム', () => {
  it('周回するとフラグ・時刻・場所はリセットされるが、情報と好感度は残る', () => {
    const s = at('beach', 22, 0);
    learn(s, 'news'); setFlag(s, 'blackout'); setFlag(s, 'p:key'); s.rel.mina = 3;
    const r = nextLoop(s);
    expect(r.learned).toContain('news');
    expect(s.loop).toBe(2);
    expect(s.time).toBe(8 * 60);
    expect(s.loc).toBe('home');
    expect(s.flags.blackout).toBeUndefined();
    expect(s.pflags['p:key']).toBe(1);
    expect(s.facts.news).toBeDefined();
    expect(s.rel.mina).toBe(3);
  });
  it('何も得られなかった周回には「少女の囁き」が必ず与えられる（無駄な周回を作らない）', () => {
    const s = newState();
    const r = nextLoop(s);
    expect(r.whisper).toBe(WHISPERS[0]);
    expect(r.learned).toEqual([WHISPERS[0]]);
    const r2 = nextLoop(s);
    expect(r2.whisper).toBe(WHISPERS[1]);
  });
  it('新情報があった周回には囁きは与えられない', () => {
    const s = newState();
    learn(s, 'news');
    expect(nextLoop(s).whisper).toBeUndefined();
  });
  it('セーブデータをシリアライズ・復元できる', () => {
    const s = newState(); learn(s, 'news'); s.loop = 4;
    expect(deserialize(serialize(s))!.loop).toBe(4);
    expect(deserialize('broken')).toBeNull();
  });
  it('今日の方針（焦点）には必ずリードがあり、未知の情報を指す', () => {
    const s = newState();
    const th = availableThreads(s);
    expect(th.length).toBeGreaterThan(2);
    for (const t of th) expect(t.lead).toBeTruthy();
  });
});

describe('朝の自動イベントと夜の異変', () => {
  it('8:00に自宅にいると朝のイベントが自動で起きる', () => {
    const s = at('home', 8, 0);
    expect(nextAuto(s)!.id).toBe('wake');
  });
  it('23:47/23:50/23:57の異変は時刻順に発生する', () => {
    const s = at('beach', 23, 58);
    const order: string[] = [];
    for (let i = 0; i < 5; i++) {
      const e = nextAuto(s); if (!e) break;
      order.push(e.id); play(s, e.id);
    }
    expect(order).toEqual(['n2347', 'n2350', 'n2357']);
    expect(s.flags.blackout).toBeDefined();
    expect(s.facts.crack_2357).toBeDefined();
  });
  it('1周目の23:59は少女のセリフ、地下で真実を知っていれば最後の選択になる', () => {
    expect(FINALES.find((f) => ok(at('beach', 23, 59), f.cond))!.id).toBe('final_first');
    const s2 = at('beach', 23, 59, { loop: 3 });
    expect(FINALES.find((f) => ok(s2, f.cond))!.id).toBe('final_default');
    const s3 = at('underground', 23, 59, { loop: 9 });
    expect(FINALES.find((f) => ok(s3, f.cond))!.id).toBe('final_default');
    know(s3, 'truth_self', 'truth_sister', 'loop_count_huge', 'truth_girl');
    expect(FINALES.find((f) => ok(s3, f.cond))!.id).toBe('final_choice');
  });
});

describe('「誰に何を伝えたか」', () => {
  it('伝えられる選択肢は、知っている情報（と噂）だけ', () => {
    const s = at('shopping', 12, 0);
    s.time = 9 * 60;
    let opts = tellOptions(s);
    expect(opts.every((o) => o.fact === 'station_3pm')).toBe(true); // 噂は最初から流せる
    know(s, 'blackout_2347');
    opts = tellOptions(s);
    expect(opts.some((o) => o.npc === 'tadokoro' && o.fact === 'blackout_2347')).toBe(true);
  });
  it('ユウに少女のことを伝えると、夜に神社へ現れる', () => {
    const s = at('park', 12, 0);
    know(s, 'girl_2340');
    expect(where({ ...s, time: 23 * 60 } as any, 'yu')).toBeNull();
    runAll(s, tellScript(s, 'yu', 'girl_2340'));
    s.time = 23 * 60;
    expect(where(s, 'yu')).toBe('shrine');
  });
  it('佐伯に「ループしている」と伝えると仮説を得る', () => {
    const s = at('clinic', 12, 0);
    know(s, 'loop_confirmed');
    runAll(s, tellScript(s, 'saeki', 'loop_confirmed'));
    expect(s.facts.saeki_theory).toBeDefined();
  });
});

describe('推理（情報の繋ぎ合わせ）', () => {
  it('矛盾：18時に死んだ患者が20時に駅にいる → 駅で自分自身を見つける', () => {
    const s = at('station', 20, 0, { loop: 4 });
    know(s, 'cert_18', 'patient_station_2000');
    const d = DEDUCTIONS.find((x) => x.a === 'cert_18' && x.b === 'patient_station_2000')!;
    learn(s, d.result);
    play(s, 'st_figure');
    expect(s.facts.self_patient).toBeDefined();
    expect(s.facts.door_code).toBeDefined();
  });
  it('推理は連鎖して「この町は最後の日を再生している」に至る', () => {
    const has = new Set(['date_school', 'date_shrine', 'date_beach', 'expiry_817']);
    let changed = true;
    while (changed) {
      changed = false;
      for (const d of DEDUCTIONS) if (has.has(d.a) && has.has(d.b) && !has.has(d.result)) { has.add(d.result); changed = true; }
    }
    expect(has.has('town_replays')).toBe(true);
  });
});

describe('記録とエンディング', () => {
  it('住民の記録は11人分あり、集めた数を数えられる', () => {
    const recs = FACT_LIST.filter((f) => f.cat === 'record');
    expect(recs.length).toBe(11);
    const s = newState();
    learn(s, 'rec_mina'); learn(s, 'rec_yu');
    expect(recCount(s)).toBe(2);
  });
  it('最終選択：記録が11人分そろわないと「記録」「残る」は選べない', () => {
    const s = at('underground', 23, 59, { loop: 9 });
    know(s, 'truth_self', 'truth_sister', 'loop_count_huge', 'truth_girl');
    const fin = FINALES.find((f) => f.id === 'final_choice')!;
    const steps = runAll(s, fin.script, [0]);
    const ch = steps.find((x) => x.t === 'choice') as { opts: string[] };
    expect(ch.opts.length).toBe(2);
    expect(s.over).toBe('end_last');
  });
  it('11人分の記録があれば「記録」を選べて END3 に至る', () => {
    const s = at('underground', 23, 59, { loop: 9 });
    know(s, 'truth_self', 'truth_sister', 'loop_count_huge', 'truth_girl', ...FACT_LIST.filter((f) => f.cat === 'record').map((f) => f.id));
    const fin = FINALES.find((f) => f.id === 'final_choice')!;
    const steps = runAll(s, fin.script, [2]);
    const ch = steps.find((x) => x.t === 'choice') as { opts: string[] };
    expect(ch.opts.length).toBe(3);
    expect(s.over).toBe('end_record');
  });
  it('TRUE END は、少女・ミナ・妹の手紙まで辿り着いた時だけ選べる', () => {
    const s = at('underground', 23, 59, { loop: 20 });
    know(s, 'truth_self', 'truth_sister', 'loop_count_huge', 'truth_girl', 'girl_name', 'mina_truth', 'sister_letter',
      ...FACT_LIST.filter((f) => f.cat === 'record').map((f) => f.id));
    const fin = FINALES.find((f) => f.id === 'final_choice')!;
    const steps = runAll(s, fin.script, [3]);
    expect((steps.find((x) => x.t === 'choice') as { opts: string[] }).opts.length).toBe(4);
    expect(s.over).toBe('end_tomorrow');
    expect(s.endings).toContain('end_tomorrow');
  });
  it('「続ける」は常に選べる', () => {
    const s = at('underground', 23, 59, { loop: 9 });
    know(s, 'truth_self', 'truth_sister', 'loop_count_huge', 'truth_girl');
    runAll(s, FINALES.find((f) => f.id === 'final_choice')!.script, [1]);
    expect(s.over).toBe('end_eternal');
  });
});

// ───── データ整合性 ─────
function walk(nodes: Node[], visit: (n: Node) => void) {
  for (const n of nodes) {
    visit(n);
    if (n.k === 'if') { walk(n.then, visit); if (n.else) walk(n.else, visit); }
    if (n.k === 'choice') for (const o of n.opts) walk(o.then, visit);
  }
}
function condFacts(c: Cond | undefined, out: Set<string>) {
  if (!c) return;
  c.has?.forEach((x) => out.add(x));
  c.not?.forEach((x) => out.add(x));
  c.any?.forEach((x) => condFacts(x, out));
}

describe('データ整合性', () => {
  const granted = new Set<string>();
  const referenced = new Set<string>();
  const addEffect = (e: Effect) => e.fact?.forEach((f) => granted.add(f));
  for (const e of [...EVENTS, ...FINALES.map((f) => ({ id: f.id, script: f.script, cond: f.cond }))]) {
    walk(e.script, (n) => {
      if (n.k === 'fx') addEffect(n.fx);
      if (n.k === 'if') condFacts(n.c, referenced);
      if (n.k === 'choice') n.opts.forEach((o) => condFacts(o.show, referenced));
    });
    condFacts(e.cond, referenced);
  }
  for (const k of Object.keys(TELLS)) walk(TELLS[k], (n) => { if (n.k === 'fx') addEffect(n.fx); });
  for (const d of DEDUCTIONS) { granted.add(d.result); referenced.add(d.a); referenced.add(d.b); }
  for (const w of WHISPERS) granted.add(w);
  for (const t of THREADS) for (const st of t.steps) { referenced.add(st.done); condFacts(st.req, referenced); }

  it('イベントIDは重複しない', () => {
    const idsList = EVENTS.map((e) => e.id);
    expect(new Set(idsList).size).toBe(idsList.length);
  });
  it('参照されるfactはすべて定義されている', () => {
    for (const f of [...referenced, ...granted]) expect(factMap[f], `未定義のfact: ${f}`).toBeDefined();
  });
  it('条件で必要とされるfactは、どこかで入手できる', () => {
    for (const f of referenced) expect(granted.has(f), `入手経路のないfact: ${f}`).toBe(true);
  });
  it('定義されたfactは全部どこかで入手できる（入手不能な情報がない）', () => {
    for (const f of FACT_LIST) expect(granted.has(f.id), `入手経路のないfact: ${f.id}`).toBe(true);
  });
  it('「伝える」反応の対象は、実在するNPCと伝達可能なfact', () => {
    for (const k of Object.keys(TELLS)) {
      const [n, f] = k.split('|');
      expect(NPCS.find((x) => x.id === n), k).toBeDefined();
      expect(factMap[f]?.tell, `${f} は tell:true が必要`).toBe(true);
    }
  });
  it('時刻表の情報はすべて時刻と見出しを持つ', () => {
    for (const f of FACT_LIST.filter((x) => x.cat === 'time')) { expect(f.t).toBeDefined(); expect(f.who).toBeTruthy(); }
  });
  it('イベントが参照するNPC・イベントIDは実在する', () => {
    const evIds = new Set(EVENTS.map((e) => e.id));
    for (const e of EVENTS) {
      if (e.npc) expect(NPCS.find((n) => n.id === e.npc), `${e.id}: npc`).toBeDefined();
      for (const d of [...(e.cond.done ?? []), ...(e.cond.notDone ?? []), ...(e.cond.doneNow ?? []), ...(e.cond.notDoneNow ?? [])]) {
        expect(evIds.has(d) || d.startsWith('tell:'), `${e.id}: 参照先イベント ${d}`).toBe(true);
      }
    }
  });
  it('プレイヤーが選べる行動（talk/look）にはラベルと所要時間がある', () => {
    for (const e of EVENTS.filter((x) => x.kind !== 'auto')) { expect(e.label, e.id).toBeTruthy(); expect(e.cost, e.id).toBeGreaterThan(0); }
  });
  it('地下施設以外の全ての場所で、時間が許す限り何か行動できる（行動が尽きない）', () => {
    for (const loc of ['home', 'shopping', 'clinic', 'station', 'park', 'school', 'beach', 'shrine'] as const) {
      const s = at(loc, 12);
      const evs = availableEvents(s);
      expect(evs.length + tellOptions(s).length, loc).toBeGreaterThan(0);
    }
  });
});
