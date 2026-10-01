// 追跡・隠れるアクション（既存イベントを「実際に忍び寄る」形に置き換える）
import { flag, sc } from '../engine/dsl';
import type { StealthDef } from '../engine/stealth';

export const STEALTH: StealthDef[] = [
  { // 22:00 神社：町長が石の扉を開ける
    id: 'shr_follow', mode: 'hide', loc: 'shrine', target: 'shiina', start: 306,
    path: [{ x: 276, wait: 1.2 }, { x: 178, wait: 11 }],
    speed: 24, spots: [{ x: 298, w: 22 }, { x: 250, w: 24 }],
    vision: 120, glance: { every: 3.6, dur: 1.4, warn: 0.9 }, goal: { x: 208, r: 12, hold: 2.4, hear: 56 },
    intro: sc('石段の下の暗がり。町長の椎名が、本殿の裏へ向かっていく。', '気づかれないように、石灯籠や鳥居の柱の陰を伝って、扉の近くまで行こう。'),
    failCost: 20,
    caught: sc(['椎名', '「……誰か、いるの？」'], '慌てて物陰から飛び出した。町長はしばらくこちらを見つめて、何も言わずに去っていった。', flag('p:shiina_wary')),
    lost: sc('町長は石の扉の向こうへ消えてしまった。……間に合わなかった。'),
  },
  { // 17:30 海岸：ミナが海に話しかける
    id: 'min_follow', mode: 'hide', loc: 'beach', target: 'mina', start: 306,
    path: [{ x: 240, wait: 0.5 }, { x: 120, wait: 11 }],
    speed: 22, spots: [{ x: 280, w: 20 }, { x: 214, w: 28 }],
    vision: 108, glance: { every: 3.8, dur: 1.4, warn: 0.9 }, goal: { x: 176, r: 12, hold: 2.6, hear: 62 },
    intro: sc('夕方の海岸。ミナが、白い花を手に、波打ち際へ歩いていく。', 'ボートの陰や桟橋の柱に隠れながら、声の聞こえる距離まで近づこう。'),
    failCost: 15,
    caught: sc(['ミナ', '「……ソウ？ いたの？ もう、びっくりした。」'], 'ミナは「散歩だよ」と笑って誤魔化した。花を持つ手を、そっと後ろに隠して。'),
    lost: sc('ミナは波打ち際で立ち止まり、やがて、何事もなかったように歩き去っていった。……聞き逃してしまった。'),
  },
  { // 14:45 駅：町長と黒田の密談
    id: 'st_overhear', mode: 'hide', loc: 'station', target: 'shiina', start: 36,
    path: [{ x: 304, wait: 0.5 }, { x: 206, wait: 11 }],
    speed: 22, spots: [{ x: 92, w: 26 }, { x: 250, w: 24 }],
    vision: 110, glance: { every: 3.8, dur: 1.3, warn: 0.9 }, goal: { x: 134, r: 10, hold: 2.4, hear: 84 },
    intro: sc('改札の方から、町長の足音。黒田と何かを話すつもりらしい。', '柱や自販機の陰を伝って、会話の聞こえる位置まで近づこう。'),
    failCost: 15,
    caught: sc(['椎名', '「……あら、ソウくん。こんなところで。」'], '町長は穏やかに笑って、話を打ち切って去っていった。黒田が、こちらを睨んでいる。'),
    lost: sc('町長は黒田と短く言葉を交わすと、立ち去ってしまった。……何を話していたのかは、聞き取れなかった。'),
  },
  { // 14:50 駅：黒田を尾行して倉庫へ
    id: 'st_tail', mode: 'tail', loc: 'station', target: 'kuroda', start: 118,
    path: [{ x: 176, wait: 0.5 }, { x: 214, wait: 1.5 }, { x: 262, wait: 2.5 }],
    speed: 24, spots: [{ x: 204, w: 26 }, { x: 246, w: 20 }],
    vision: 100, glance: { every: 3.8, dur: 1.2, warn: 0.9 }, tail: { min: 26, max: 92, hold: 1.5 },
    intro: sc('15:00 前。黒田が改札を離れ、ホームの奥へ歩き出した。', '離れすぎず、近づきすぎず。振り返る前に物陰で息を殺せば、気づかれない。'),
    failCost: 15,
    caught: sc(['黒田', '「……何をしてる。ガキは帰れ。」'], '黒田は低く言い捨てて、何事もなかったように改札へ戻っていった。'),
    lost: sc('黒田の姿を見失った。ホームの奥には、もう誰もいない。'),
  },
];

export const STEALTH_IDS = new Set(STEALTH.map((s) => s.id));
export const stealthDef = (id: string) => STEALTH.find((s) => s.id === id);
