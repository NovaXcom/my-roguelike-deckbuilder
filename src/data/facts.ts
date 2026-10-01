import { hm } from '../engine/dsl';
import type { Deduction, FactDef, Thread } from '../engine/types';

const F = (id: string, cat: FactDef['cat'], title: string, text: string, extra: Partial<FactDef> = {}): FactDef =>
  ({ id, cat, title, text, ...extra });

export const FACTS: FactDef[] = [
  // ───── 時刻表（8月17日） ─────
  F('news', 'time', '23:59に異常現象', 'テレビのニュース：「本日、午後11時59分頃に大規模な異常現象が発生する可能性があります。」', { t: hm(23, 59), who: 'ニュース' }),
  F('station_3pm', 'time', '駅を閉めて倉庫へ入る', '黒田は15:00になると駅を閉め、一人で倉庫へ入っていく。', { t: hm(15), who: '駅員・黒田', tell: true }),
  F('mina_beach_1730', 'time', '海岸へ行く', 'ミナは毎日17:30になると海岸へ行く。「ちょっと散歩してるだけ」と言う。', { t: hm(17, 30), who: 'ミナ', tell: true }),
  F('saeki_empty_patient', 'time', '誰もいない診察室で診察', '佐伯は19:20、誰もいない診察室で「患者」を診察している。', { t: hm(19, 20), who: '医師・佐伯', tell: true }),
  F('patient_station_2000', 'time', '病衣の男が駅に立つ', '20:00、駅のホームの端に病衣の男が立っている。近づくと消えてしまう。', { t: hm(20), who: '病衣の男', tell: true }),
  F('cert_18', 'time', '患者が18:00に死亡', '診療所の控えに、18:00に死亡した患者の診断書がある。氏名欄は墨で塗りつぶされている。', { t: hm(18), who: '死亡した患者', tell: true }),
  F('shrine_hatch', 'time', '町長が石段の奥へ入る', '22:00頃、町長の椎名が神社の石扉を開けて地下へ降りていく。扉は夜にだけ開く。', { t: hm(22), who: '町長・椎名', tell: true }),
  F('girl_2340', 'time', '少女が石段に現れる', '23:40、神社の石段に白い服の少女が現れる。毎周回、必ず。', { t: hm(23, 40), who: '少女', tell: true }),
  F('blackout_2347', 'time', '町の電気が消える', '23:47、町じゅうの電気が一斉に消える。', { t: hm(23, 47), who: '町', tell: true }),
  F('light_2350', 'time', '海の向こうに光', '23:50、海の向こうに巨大な光が見える。', { t: hm(23, 50), who: '海', tell: true }),
  F('crack_2357', 'time', '空に亀裂', '23:57、空に亀裂が入る。', { t: hm(23, 57), who: '空' }),
  F('crash_2359', 'time', '世界が白くなる', '23:59、謎の少女が現れる。「お願い。今度こそ、間に合わせて。」——そして、世界が真っ白になる。', { t: hm(23, 59), who: '世界' }),

  // ───── 人物 ─────
  F('loop_confirmed', 'truth', '本当にループしている', 'コンビニの店員の台詞も、客の並び順も、昨日とまったく同じだった。僕は本当に、同じ一日を繰り返している。', { tell: true }),
  F('mina_deja_vu', 'person', 'ミナの既視感', 'ミナも「同じ一日を繰り返している気がする」と感じている。', { tell: true }),
  F('yu_line', 'person', '「今日も来たんだね」', '公園の少年ユウは、僕を見るたびに「今日も来たんだね」と言う。'),
  F('yu_aware', 'person', 'ユウはループを知っている', 'ユウは「この日を何度も見たことがある」と言った。ループに気づいている。'),
  F('yu_tally', 'person', 'ユウの数え書き', 'ユウのスケッチブックには空に入る亀裂の絵と、数えきれない「正」の字がある。', { tell: true }),
  F('yu_girl_friend', 'person', 'ユウと少女', 'ユウは少女を知っている。「あの子、ずっと待ってるんだ」。'),
  F('yu_dawn_wish', 'person', 'ユウの願い', 'ユウは「夜明け」を見たことがない。見てみたい、と言った。'),
  F('mina_flower', 'person', 'ミナの白い花', 'ミナは毎日、花屋で白い花を一輪買っている。', { tell: true }),
  F('mina_kei', 'person', '「ケイ」', '海に向かって、ミナは「ケイ」と呼びかけていた。', { tell: true }),
  F('kei_brother', 'person', 'ミナの弟', 'ケイはミナの弟。5年前に亡くなった。', { tell: true }),
  F('kei_accident', 'person', 'ケイの事故', 'ケイは海の事故で亡くなった。その日、僕も一緒にいた。', { tell: true }),
  F('mina_truth', 'person', 'ミナは知っていた', 'ミナは、僕が事故に関わっていたことも、この町の正体も、ずっと前から知っていた。「ソウは悪くないよ」と。'),
  F('station_rumor', 'person', '駅の噂', '田所の話：「駅、今日は3時で閉まるらしいっすよ。貼り紙が出てたとか」。本当だろうか。', { tell: true }),
  F('shiina_night_visit', 'person', '町長の夜のお参り', '朝霧の話：椎名町長は、毎晩22時になると本殿の裏へ「お参り」に来る。誰も入れないよう、鍵まで掛けて。', { tell: true }),
  F('kuroda_lie', 'person', '黒田の嘘', '「駅は今日もいつも通り」と黒田は言った。嘘だ。'),
  F('kuroda_shiina_talk', 'person', '黒田と町長の密談', '黒田と椎名町長が15:00前に密談していた。「地下の件は、今日で最後にしてくれ」。', { tell: true }),
  F('kuroda_daughter', 'person', '黒田の娘', '黒田には娘がいた。ミナと同い年くらいだったという。', { tell: true }),
  F('kuroda_train', 'person', '走れなかった電車', '黒田は「出発できなかった最後の電車」を、今も改札で待っている。'),
  F('saeki_theory', 'person', '佐伯の仮説', '「時間が戻っているのではなく、記憶が戻っているのだと思う」と佐伯は言った。', { tell: true }),
  F('saeki_secret', 'person', '佐伯の告白', '佐伯は、あの夜、誰かを助けられなかった。毎日19:20に診ているのは「その人」だ。'),
  F('ooya_kanrinin', 'person', '「管理人さん」', '大家の久保さんは、僕を「管理人さん」と呼んだ。'),
  F('girl_not_day', 'person', '少女の言葉', '少女は言った。「繰り返しているのは、この一日じゃない」。', { tell: true }),
  F('girl_reason', 'person', '23:40の理由', '少女が23:40に現れるのは、その時刻に装置が「外部記憶」を起動するから。', { tell: true }),
  F('girl_name', 'person', '少女の名前', '少女の名前は「栞（しおり）」。僕が最後に作った、外部記憶。'),
  F('girl_request', 'person', '栞の頼み', '栞は言った。「終わらせる前に、みんなの記憶を、ひとつずつ持ってきて」。'),
  F('shiina_role', 'person', '椎名の役目', '椎名町長は、この町を壊さないための「番人」だった。'),
  F('gen_light', 'person', '源さんの祖父の話', '源さんの祖父も、100年前に「海の向こうの光」を見たと言っていた。', { tell: true }),
  F('tad_cans', 'person', '田所の缶コーヒー', '田所はいつも「最後の一本」を僕に渡してくれる。'),

  // ───── 場所 ─────
  F('warehouse_empty', 'place', '空っぽの倉庫', '駅の倉庫には何もない。床に、不自然な継ぎ目がある。', { tell: true }),
  F('hatch_known', 'place', '倉庫の隠し扉', '倉庫の床の継ぎ目は隠し扉だった。開けるには鍵が要る。'),
  F('key_basement', 'place', '地下への鍵', '黒田が僕に鍵を預けてくれた。倉庫の隠し扉の鍵。'),
  F('tracks_end', 'place', '途切れた線路', 'ホームの先で、線路が途切れている。この駅から電車が出たことは、一度もない。', { tell: true }),
  F('storeroom_odd', 'place', '開かない物置', '隣の部屋は「物置」のはずなのに、扉に小さな名札の跡がある。', { tell: true }),
  F('expiry_817', 'place', '賞味期限は8/17', 'コンビニの商品の賞味期限は、すべて「8/17」と印字されている。', { tell: true }),
  F('phone_year', 'place', '年のない日付', 'スマートフォンのカレンダーには、年が表示されない。', {}),
  F('control_door', 'place', '制御室の扉', '地下の奥の分厚い扉は、六桁のテンキーで閉ざされている。暗証番号が要る。'),
  F('capsules', 'place', '記憶カプセル', '地下の広間に、アステルの住民全員分の記憶カプセルが並んでいた。', { tell: true }),

  // ───── 資料 ─────
  F('date_school', 'doc', '古い新聞の日付', '学校の資料室の古い新聞。見出しの上の日付は「8月17日」。', { tell: true }),
  F('date_shrine', 'doc', '絵馬の日付', '神社の古い絵馬は、どれも「8月17日」の日付だった。', { tell: true }),
  F('date_beach', 'doc', '慰霊碑の日付', '海岸の石碑に刻まれた日付は「8月17日」。', { tell: true }),
  F('okuribi', 'doc', '8月17日の送り火', 'この町では、8月17日に死者を送る「送り火」を行ってきた。'),
  F('fire_100', 'truth', '100年前の大火', '100年前の8月17日、町は大火に包まれ、住民のほぼ全員が亡くなった。公式記録は「原因不明の自然災害」。', { tell: true }),
  F('names_match', 'truth', '同じ名前', '100年前の犠牲者名簿は、現在の住民の名前と、すべて一致する。', { tell: true }),
  F('chart_self', 'doc', '僕のカルテ', '診療所に僕のカルテがある。毎日19:20に診察。経過「変化なし。本人は自覚なし」。氏名欄は空白。', { tell: true }),
  F('exp_purpose', 'doc', '実験の目的', '地下の実験記録：目的は「人間の記憶の保存」。主任研究員の名前は欠けている。', { tell: true }),
  F('door_code', 'truth', '000817', '病衣の僕のリストバンドの番号。どこかの暗証番号かもしれない。'),
  F('sister_letter', 'doc', '妹からの手紙', '開かずの部屋の机に、妹の手紙があった。「お兄ちゃんへ。ずっと、ありがとう」。'),

  // ───── 推理で得られるもの ─────
  F('dates_same', 'deduce', '二つの資料は同じ日', '新聞と絵馬、別々の資料がどちらも8月17日を指している。偶然ではない。'),
  F('every_year_817', 'deduce', '町の「最後の日」', '古い記録のどれもが8月17日で終わっている。この町は、毎年「最後の日」を迎えてきた。', { tell: true }),
  F('town_replays', 'deduce', '町は再生している', '今の町も、昔の記録も、同じ日付で止まっている。この町は「最後の日」を再生しているのだ。', { tell: true }),
  F('patient_paradox', 'deduce', '死者が駅にいる', '18:00に死んだ患者が、20:00に駅に立っている。……その人物を、確かめに行かなければ。'),
  F('self_patient', 'truth', '病衣の男は僕だった', '20:00の駅で、病衣の男の顔を見た。それは僕だった。手首のリストバンドには「000817」。'),
  F('town_is_memory', 'deduce', '町は死者の記憶', '住民の名前は犠牲者名簿と一致し、地下には記憶カプセルがある。この町は、死者の記憶から再構成された世界だ。', { tell: true }),
  F('self_is_copy', 'deduce', '僕もその一人', '町が記憶でできているなら、18:00に死んだ「患者」と同じ顔の僕は、本物の人間なのか。'),

  // ───── 真実（地下・最終章） ─────
  F('loop_count_huge', 'truth', 'LOOP 412907', '制御室のモニターには「LOOP 000001」から「LOOP 412907」までが並んでいた。僕は、もう何十万回もこの一日を繰り返している。', { tell: true }),
  F('truth_sister', 'truth', '妹・凛', '100年前、僕は事故で亡くなった妹・凛を蘇らせるため、記憶保存の実験を始めた。', { tell: true }),
  F('truth_self', 'truth', '僕の正体', '僕は100年前の研究者の「記憶のコピー」。この世界を再生し続ける、管理者だった。', { tell: true }),
  F('truth_girl', 'truth', '少女の正体', '少女は、実験を止めようとした研究者が最後に作った「外部記憶」。「この世界を終わらせたい」という記憶だけを持つ。', { tell: true }),

  // ───── 記録（住民の記憶・END3/TRUE用） ─────
  F('rec_mina', 'record', 'ミナの記憶', '弟ケイと見た、夏の海。「明日も、ここで会おうね」。'),
  F('rec_kuroda', 'record', '黒田の記憶', 'あの夜、娘を乗せて出すはずだった最後の電車。笛を、吹けなかった。'),
  F('rec_saeki', 'record', '佐伯の記憶', '看取れなかった少女の手の温度。白衣のポケットに入れたままの聴診器。'),
  F('rec_yu', 'record', 'ユウの記憶', '最初に見た夜明けの色を、ずっと探している少年の話。'),
  F('rec_tadokoro', 'record', '田所の記憶', '開けたままの店と、最後に売れた一本の缶コーヒー。'),
  F('rec_shinohara', 'record', '篠原先生の記憶', '出席簿を最後まで読み上げた、夏休み前の教室。'),
  F('rec_asagiri', 'record', '朝霧の記憶', '灯せなかった送り火の、手の中の火種。'),
  F('rec_gen', 'record', '源さんの記憶', '帰ってこなかった船と、毎晩見つめた水平線。'),
  F('rec_hanako', 'record', 'ひなこの記憶', '売れ残った白い花を、一輪ずつ海へ流した夜。'),
  F('rec_kubo', 'record', '久保さんの記憶', '町の台帳に書き込まれた、全員分の名前と誕生日。'),
  F('rec_shiina', 'record', '椎名の記憶', '町を守るために、町に嘘をつき続けた人の日記。'),

  // ───── 少女の囁き（その周回で何も得られなかった時の保証） ─────
  F('w1', 'whisper', '囁き(1)', '少女の声：「同じ場所でも、時間が違えば、人は違う顔を見せるよ」。'),
  F('w2', 'whisper', '囁き(2)', '少女の声：「誰かに話したことは、その人の中に残る。……次の日にも」。'),
  F('w3', 'whisper', '囁き(3)', '少女の声：「大人たちは、夜に何かを隠してる」。'),
  F('w4', 'whisper', '囁き(4)', '少女の声：「矛盾を見つけたら、記憶のボードで、ふたつを繋いでみて」。'),
  F('w5', 'whisper', '囁き(5)', '少女の声：「あの子たちの話を、ちゃんと聞いてあげて」。'),
  F('w6', 'whisper', '囁き(6)', '少女の声：「あと少し。あと少しで、思い出せるよ」。'),
];

export const FACT_LIST: FactDef[] = FACTS;
export const factMap: Record<string, FactDef> = Object.fromEntries(FACT_LIST.map((f) => [f.id, f]));
export const WHISPERS = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'];
export const RECORD_IDS = FACT_LIST.filter((f) => f.cat === 'record').map((f) => f.id);

export const DEDUCTIONS: Deduction[] = [
  { a: 'date_school', b: 'date_shrine', result: 'dates_same', msg: '別々の場所の資料が、同じ日付を指している。' },
  { a: 'dates_same', b: 'date_beach', result: 'every_year_817', msg: '三つの資料。どれも8月17日。この町では何かが毎年「終わって」いる。' },
  { a: 'every_year_817', b: 'expiry_817', result: 'town_replays', msg: '昔の記録も、今の商品も、8/17。町が同じ日を再生している。' },
  { a: 'cert_18', b: 'patient_station_2000', result: 'patient_paradox', msg: '18:00に死んだはずの人物が、20:00に駅にいる。……矛盾だ。' },
  { a: 'names_match', b: 'capsules', result: 'town_is_memory', msg: '犠牲者名簿と記憶カプセルの名前が、現在の住民と一致する。' },
  { a: 'town_is_memory', b: 'self_patient', result: 'self_is_copy', msg: '町が記憶なら、死んだ患者と同じ顔の僕は……。' },
  { a: 'tracks_end', b: 'kuroda_daughter', result: 'kuroda_train', msg: '黒田は、出発できなかった電車を、今も待っている。' },
];

/** 周回の初めに選ぶ「今日の焦点」。done が未取得の最初の段階の lead を提示する */
export const THREADS: Thread[] = [
  { id: 'mina', name: 'ミナを追う', steps: [
    { done: 'mina_beach_1730', lead: '17:30、海岸へ。ミナに話しかけてみよう。' },
    { done: 'mina_kei', lead: '17:30過ぎ、海岸の物陰からミナの様子を見てみよう。' },
    { done: 'kei_brother', lead: 'ミナに「ケイ」のことを尋ねてみよう（もう少し親しくなってから）。', req: { has: ['mina_kei'] } },
    { done: 'kei_accident', lead: 'ミナに弟の話をもう一度。話しやすい時間を選んで。', req: { has: ['kei_brother'] } },
    { done: 'mina_truth', lead: '町の真実に近づいてから、ミナと夕方の海へ。', req: { has: ['kei_accident'] } },
    { done: 'rec_mina', lead: 'ミナの記憶を受け取ろう。', req: { has: ['mina_truth'] } },
  ] },
  { id: 'kuroda', name: '駅員・黒田を追う', steps: [
    { done: 'station_rumor', lead: '商店街のコンビニで、田所に最近の噂を聞いてみよう。', req: { not: ['station_3pm'] } },
    { done: 'station_3pm', lead: '「駅が15時で閉まる」という噂を確かめに、14:50までに駅へ。', req: { has: ['station_rumor'] } },
    { done: 'kuroda_shiina_talk', lead: '14:45頃の駅に、もう一度。誰かが来るはず。', req: { has: ['station_3pm'] } },
    { done: 'warehouse_empty', lead: '15:00ちょうど、倉庫に入る黒田を追ってみよう。', req: { has: ['station_3pm'] } },
    { done: 'key_basement', lead: '誰かに「駅は15:00に閉まる」と伝えてみよう。たとえばミナに。', req: { has: ['warehouse_empty'] } },
    { done: 'tracks_end', lead: '15:00前のホームを歩いてみよう。', req: { has: ['warehouse_empty'] } },
    { done: 'rec_kuroda', lead: '黒田の過去に踏み込む準備を。娘のこと、線路のこと。', req: { has: ['tracks_end'] } },
  ] },
  { id: 'saeki', name: '医師・佐伯を調べる', steps: [
    { done: 'saeki_empty_patient', lead: '19:20、診療所の診察室を覗いてみよう。' },
    { done: 'cert_18', lead: '19:45以降、佐伯が出払った診療所を調べよう。', req: { has: ['saeki_empty_patient'] } },
    { done: 'chart_self', lead: '誰もいなくなった診療所で、カルテ棚を調べよう。', req: { has: ['saeki_empty_patient'] } },
    { done: 'patient_station_2000', lead: '佐伯の呟き。「20時には駅へ行くんだね」——20:00の駅のホームを見てみよう。', req: { has: ['saeki_empty_patient'] } },
    { done: 'self_patient', lead: '「18時に死んだ患者」と「20時の駅」。記憶ボードで繋げてから、20:00の駅へ。', req: { has: ['cert_18', 'patient_station_2000'] } },
    { done: 'rec_saeki', lead: '佐伯と話そう。カルテの話を持って。', req: { has: ['chart_self'] } },
  ] },
  { id: 'yu', name: '少年・ユウを追う', steps: [
    { done: 'yu_line', lead: '公園へ。ユウに会ってみよう。' },
    { done: 'yu_aware', lead: 'ユウに「今日」のことを聞いてみよう。', req: { has: ['loop_confirmed'] } },
    { done: 'yu_tally', lead: 'ユウのベンチのスケッチブックを見せてもらおう。', req: { has: ['yu_aware'] } },
    { done: 'yu_girl_friend', lead: 'ユウに「23:40の少女」の話をしてみよう。', req: { has: ['girl_2340'] } },
    { done: 'rec_yu', lead: 'ユウと遊んで、夜明けの話を。', req: { has: ['yu_tally'] } },
  ] },
  { id: 'girl', name: '少女を追う', steps: [
    { done: 'girl_2340', lead: '23:40、神社の石段へ。' },
    { done: 'girl_not_day', lead: '23:40に神社で、少女に話しかけてみよう。', req: { has: ['girl_2340'] } },
    { done: 'girl_reason', lead: '少女に「なぜ23:40なのか」を尋ねよう。', req: { has: ['girl_not_day'] } },
    { done: 'girl_name', lead: '地下で少女の正体を知ってから、23:40に会いにいこう。', req: { has: ['truth_girl'] } },
  ] },
  { id: 'dates', name: '古い記録を調べる', steps: [
    { done: 'date_school', lead: '9時〜17時、学校の資料室へ。' },
    { done: 'date_shrine', lead: '神社の絵馬を調べよう。' },
    { done: 'date_beach', lead: '海岸の石碑を調べよう。' },
    { done: 'expiry_817', lead: 'コンビニの棚を、よく見てみよう。', req: { has: ['loop_confirmed'] } },
    { done: 'town_replays', lead: '記憶ボードで、集めた日付を繋げてみよう。', req: { has: ['date_school', 'date_shrine', 'date_beach', 'expiry_817'] } },
  ] },
  { id: 'under', name: '地下施設へ', steps: [
    { done: 'shrine_hatch', lead: '朝霧の話では、町長は22時に本殿の裏へ行く。神社の石段の陰から見張ってみよう。', req: { has: ['shiina_night_visit'] } },
    { done: 'capsules', lead: '地下への入り口を探そう。「駅の倉庫」か「夜の神社」。', req: { has: ['warehouse_empty'] } },
    { done: 'door_code', lead: '制御室の扉には暗証番号が要る。20:00の駅に立つ、あの病衣の男を確かめよう。', req: { has: ['control_door'] } },
    { done: 'loop_count_huge', lead: '暗証番号を持って、地下の制御室へ。', req: { has: ['door_code'] } },
    { done: 'truth_self', lead: '制御室を、もっと調べよう。', req: { has: ['loop_count_huge'] } },
  ] },
];
