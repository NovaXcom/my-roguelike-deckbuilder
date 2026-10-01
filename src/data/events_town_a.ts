// 自宅 / 商店街 / 学校 / 公園
import { choice, fact, flag, hm, ifc, opt, rel, sc } from '../engine/dsl';
import type { GameEvent, Node } from '../engine/types';

/** 「伝える」でも、通常の会話でも使う共通シーン */
export const SHARED: Record<string, Node[]> = {
  names: sc(
    ['篠原先生', '「……どうして、その日付に気づいた。」'],
    ['篠原先生', '「資料室の奥に、100年前の児童名簿がある。……鍵を貸そう。誰にも言わないでくれ。」'],
    '名簿を開く。黄ばんだ紙に、見慣れた名前が並んでいた。',
    '——ミナ。ユウ。黒田。佐伯。田所。朝霧。……そして、僕の名前の一つ手前に、「凛」。',
    '現在この町に住んでいる人の名前が、すべて載っている。100年前の、犠牲者として。',
    fact('names_match'), rel('shinohara', 1)),
  fire: sc(
    ['朝霧', '「……それを知る者が、また現れたか。社務所の奥へ来なさい。」'],
    '古文書には、墨で一行だけ記されていた。',
    '『八月十七日、夜。町、炎に包まれ、ほぼ全ての者、帰らず。』',
    ['朝霧', '「公式には『原因不明の自然災害』とされている。だが、焼けたのは、本当に炎だけだったのかな。」',
      ],
    fact('fire_100', 'okuribi'), rel('asagiri', 1)),
  hatch: sc(
    ['黒田', '「……あんた、倉庫を見たのか。」'],
    ['黒田', '「床の継ぎ目だ。あれは扉だ。鍵がなけりゃ開かない。……鍵は、俺が持ってる。」'],
    ['黒田', '「だが、渡す気はない。——今のところはな。」'],
    fact('hatch_known'), rel('kuroda', 1)),
};

export const TOWN_A: GameEvent[] = [
  // ───── 自宅アパート ─────
  { id: 'home_phone', kind: 'look', label: 'スマートフォンを見る', cost: 5, cond: { at: 'home' }, script: sc(
    'カレンダーアプリを開く。「8月17日（日）」。',
    '……年が、どこにも表示されていない。設定を開いても、年の欄は空白のままだ。',
    fact('phone_year'))},
  { id: 'home_storeroom', kind: 'look', label: '隣の部屋の扉を調べる', cost: 10, cond: { at: 'home' }, script: sc(
    '隣の「物置」の扉の前に立つ。',
    ifc({ has: ['truth_sister'] },
      sc('ポケットの中の鍵が、扉の錠にぴたりと合った。', '——開く。', '小さな部屋だった。窓際の机、日に焼けたカーテン、そして、机の上に一通の手紙。',
        ['手紙', '「お兄ちゃんへ。ずっと、ありがとう。わたし、お兄ちゃんの妹で、しあわせでした。」'],
        '涙が、勝手に零れていた。', fact('sister_letter')),
      sc('扉には、剥がされた名札の跡がある。薄く、「り」の字の一部が読める。',
        '僕は、この部屋を開けたことがない。——なぜか、そう思い込んでいた。', fact('storeroom_odd'))))},
  { id: 'kubo_hello', kind: 'talk', npc: 'kubo', label: '大家の久保さんと話す', cost: 10, cond: {}, script: sc(
    ['久保さん', '「あら、ソウ君。おはよう。今日も暑くなりそうねえ。」'],
    ifc({ loop: [4], rel: { kubo: 2 }, not: ['ooya_kanrinin'] },
      sc(['久保さん', '「今日もお疲れさま。……管理人さん。」'], ['ソウ', '「え？」'],
        ['久保さん', '「あら、いやだ。年を取ると、言い間違いが増えるわねえ。」'], fact('ooya_kanrinin')),
      sc(['久保さん', '「家賃のことは気にしなくていいのよ。あなたは、ずっとここにいてくれるだけで。」'])),
    rel('kubo', 1))},
  { id: 'kubo_rec', kind: 'talk', npc: 'kubo', label: '久保さんに台帳のことを聞く', cost: 20, once: 'ever',
    cond: { has: ['ooya_kanrinin', 'truth_self'], rel: { kubo: 3 } }, script: sc(
    ['ソウ', '「久保さん。……僕が、管理人なんですね。」'],
    ['久保さん', '「ええ。あなたが忘れても、私は覚えているのよ。この町の台帳をつけるのが、私の役目だから。」'],
    '久保さんが差し出した台帳には、全住民の名前と誕生日、好きな食べ物までが、几帳面な字で綴られていた。',
    ['久保さん', '「誰かが覚えていてあげないと、人はいなくなってしまうでしょう？」'],
    fact('rec_kubo'), rel('kubo', 1))},

  // ───── 商店街 ─────
  { id: 'tad_hello', kind: 'talk', npc: 'tadokoro', label: 'コンビニに入る', cost: 10, cond: { at: 'shopping' }, script: sc(
    ['田所', '「いらっしゃい。」'],
    ifc({ loop: [1, 1] },
      sc('ペットボトルの水を買う。レジの音が、いつも通り鳴る。', ['田所', '「ありがとうございましたー。」']),
      sc('一字一句、昨日と同じ。レジの前の客の並び順も、レシートの数字も、同じだ。',
        '——これは、偶然じゃない。', fact('loop_confirmed'),
        ifc({ loop: [3], not: ['tad_cans'] },
          sc(['田所', '「あ、これ。最後の一本、あんたにあげるよ。」'], '缶コーヒーを渡された。ぬるい。', fact('tad_cans'))))),
    rel('tadokoro', 1))},
  { id: 'tad_gossip', kind: 'talk', npc: 'tadokoro', label: '田所に、最近の噂を聞く', cost: 10, once: 'ever', cond: { at: 'shopping' }, script: sc(
    ['ソウ', '「最近、何か変わった話、ない？」'],
    ['田所', '「あー、そういや。さっき来た客が言ってたんすけど、駅、今日は3時で閉まるらしいっすよ。貼り紙が出てたとか。」'],
    ['田所', '「あの駅、昼間は誰も使わないから、別にいいんすけどね。」'],
    '……あの駅員が、そんなことを？ 本当かどうか、後で確かめてみようか。',
    fact('station_rumor'), rel('tadokoro', 1))},
  { id: 'tad_shelf', kind: 'look', label: 'コンビニの棚を調べる', cost: 15, cond: { at: 'shopping', has: ['loop_confirmed'] }, script: sc(
    '棚の商品を、片っ端から裏返してみる。',
    '賞味期限の欄。弁当も、パンも、牛乳も、ペットボトルも。',
    '——すべて、「8/17」。',
    fact('expiry_817'))},
  { id: 'tad_candle', kind: 'talk', npc: 'tadokoro', label: '田所を訪ねる（停電の店）', cost: 15,
    cond: { at: 'shopping', t: [hm(23, 47), hm(24)], flag: ['p:told:tadokoro|blackout_2347'] }, script: sc(
    '停電の町で、その店だけが、蝋燭の灯りで開いていた。',
    ['田所', '「来ると思った。あんたが言ったとおり、本当に消えたな。」'],
    ['田所', '「どうせ最後なら、店は開けとこうと思ってさ。」'],
    ifc({ rel: { tadokoro: 3 }, has: ['tad_cans'] },
      sc(['田所', '「俺ね、100年前も、店を継いだ前の晩だった気がするんだ。笑うだろ。」'],
        ['田所', '「あの夜、最後に売れたのが、缶コーヒー一本。……それ、誰に売ったか思い出せなくてさ。」'],
        '蝋燭の火が揺れた。田所は、少しだけ笑った。', fact('rec_tadokoro')),
      sc(['田所', '「ま、コーヒーでも飲んでけよ。」'])),
    rel('tadokoro', 1))},

  { id: 'han_hello', kind: 'talk', npc: 'hanako', label: '花屋のひなこさんと話す', cost: 10, cond: { at: 'shopping' }, script: sc(
    ['ひなこ', '「あら、ソウくん。いらっしゃい。」'],
    '店先には、白い花が一輪ずつ、小さな瓶に挿してある。',
    ['ひなこ', '「ミナちゃんね、毎日この白い花を一輪だけ買っていくのよ。何に使うのかしらね。」'],
    fact('mina_flower'), rel('hanako', 1))},
  { id: 'han_rec', kind: 'talk', npc: 'hanako', label: 'ひなこさんに白い花のことを尋ねる', cost: 20, once: 'ever',
    cond: { has: ['kei_brother'], rel: { hanako: 3 } }, script: sc(
    ['ひなこ', '「……ケイくんのこと、聞いたのね。」'],
    ['ひなこ', '「あの夜も、売れ残った白い花がたくさんあってね。私、一輪ずつ海へ流したの。」'],
    ['ひなこ', '「花は、死んだ人のためだけのものじゃないって、思いたかったのよ。」'],
    fact('rec_hanako'), rel('hanako', 1))},

  { id: 'shi_hello', kind: 'talk', npc: 'shiina', label: '椎名町長と話す', cost: 10, cond: { at: 'shopping' }, script: sc(
    ['椎名', '「ソウくん、おはよう。今日も町は平和ね。」'],
    ifc({ loop: [3] },
      sc(['椎名', '「最近、変わったことはない？」'],
        choice(
          opt('「いえ、特には」', sc(['椎名', '「そう。……ならいいの。」'])),
          opt('「同じ一日を繰り返している気がします」', sc(['椎名', '「…………」'], '町長の笑顔が、一瞬だけ、止まった。', flag('p:shiina_wary'))))),
      sc(['椎名', '「祭りの準備も、順調よ。」'])))},
  { id: 'shi_rec', kind: 'talk', npc: 'shiina', label: '椎名町長に真実を問う', cost: 30, once: 'ever',
    cond: { has: ['capsules', 'town_is_memory'] }, script: sc(
    ['ソウ', '「町長。この町は、死者の記憶でできている。あなたは知っていた。」'],
    ['椎名', '「……ええ。私は、この町を壊さないための番人。あなたが何度忘れても、私は、あなたに嘘をつき続けた。」'],
    ['椎名', '「あなたを憎んだ日もあるわ。でも、あなたが一番、この町を愛していたから。」'],
    '町長は、古い日記帳を差し出した。1ページ目には、100年前の日付と、短い言葉。',
    ['椎名', '『今日も、町は平和でした。』'],
    fact('shiina_role', 'rec_shiina'), rel('shiina', 2))},

  // ───── 学校 ─────
  { id: 'sin_hello', kind: 'talk', npc: 'shinohara', label: '篠原先生と話す', cost: 10, cond: { at: 'school' }, script: sc(
    ['篠原先生', '「夏休みなのに、ご苦労だね。」'],
    ifc({ loop: [1, 1] },
      sc(['篠原先生', '「資料室なら自由に見ていいよ。古い新聞が、山ほどある。」']),
      sc(['篠原先生', '「おや、また来たのか。……いや、初めてだったかな。変だな、見覚えがある。」'])),
    rel('shinohara', 1))},
  { id: 'sch_archive', kind: 'look', label: '資料室で古い新聞を調べる', cost: 35, cond: { at: 'school', t: [hm(9), hm(17)] }, script: sc(
    '埃っぽい資料室。山積みの新聞を一部ずつ繰る。',
    '一番古い一部。上半分に、見出しの活字。下半分は、焼け焦げて読めない。',
    '日付だけは、はっきりと読めた。「八月十七日」。',
    fact('date_school'))},
  { id: 'sin_names', kind: 'talk', npc: 'shinohara', label: '篠原先生に古い記録のことを話す', cost: 25, once: 'ever',
    cond: { at: 'school', any: [{ has: ['every_year_817'] }, { has: ['town_replays'] }] }, script: SHARED.names },
  { id: 'sin_rec', kind: 'talk', npc: 'shinohara', label: '篠原先生に名簿のことを尋ねる', cost: 25, once: 'ever',
    cond: { has: ['names_match'], rel: { shinohara: 3 } }, script: sc(
    ['篠原先生', '「……君には、隠せないな。」'],
    ['篠原先生', '「あの日、私は出席簿を最後まで読み上げたんだ。教室には、半分も子どもが残っていなかったのに。」'],
    ['篠原先生', '「全員の名前を呼べば、全員が戻ってくる気がした。……戻ってきたよ。こうして、毎年。」'],
    fact('rec_shinohara'), rel('shinohara', 1))},

  // ───── 公園 ─────
  { id: 'yu_hello', kind: 'talk', npc: 'yu', label: 'ユウに話しかける', cost: 10, cond: { at: 'park' }, script: sc(
    ['ユウ', '「あ。今日も来たんだね。」'],
    ['ソウ', '「……今日も？」'],
    ['ユウ', '「ううん、なんでもない。ねえ、ブランコ押してよ。」'],
    '少年は、僕を見て笑った。昨日の続きみたいな顔で。',
    fact('yu_line'), rel('yu', 1))},
  { id: 'yu_aware_talk', kind: 'talk', npc: 'yu', label: 'ユウに「今日」のことを尋ねる', cost: 15, once: 'ever',
    cond: { has: ['loop_confirmed', 'yu_line'] }, script: sc(
    ['ソウ', '「ユウ。今日も来たんだね、って、どういう意味だ？」'],
    ['ユウ', '「……お兄ちゃん、気づいたんだ。」'],
    ['ユウ', '「ぼくね、この日、何度も見たことがあるんだ。空にひびが入るのも、全部。」'],
    '少年は砂場の棒で、地面に大きな円を描いた。',
    ['ユウ', '「ぐるぐる回ってるの。ずーっと。」'],
    fact('yu_aware'), rel('yu', 1))},
  { id: 'yu_sketch', kind: 'look', label: 'ユウのスケッチブックを見る', cost: 20, cond: { at: 'park', has: ['yu_aware'] }, script: sc(
    'ベンチの上のスケッチブックを、ユウが「いいよ」と言って見せてくれた。',
    'すべてのページに、同じ夜空。ひび割れの形が、ページごとに少しずつ違う。',
    '余白には、鉛筆の「正」の字が、びっしりと数えきれないほど並んでいた。',
    ['ユウ', '「数えるの、途中でやめちゃった。たくさんになりすぎて。」'],
    fact('yu_tally'), rel('yu', 1))},
  { id: 'yu_girl_talk', kind: 'talk', npc: 'yu', label: 'ユウに23:40の少女の話をする', cost: 15, once: 'ever',
    cond: { has: ['girl_2340'] }, script: sc(
    ['ソウ', '「23:40に、神社の石段に、白い服の女の子が立つんだ。」'],
    ['ユウ', '「うん。知ってる。あの子、ずっと待ってるんだよ。」'],
    ['ユウ', '「ぼく、夜になったら、あの子のところへ行くことにしてる。ひとりじゃ、さみしいでしょ。」'],
    flag('p:yu_knows_girl'), fact('yu_girl_friend'), rel('yu', 1))},
  { id: 'yu_play', kind: 'talk', npc: 'yu', label: 'ユウと遊ぶ', cost: 30, cond: { at: 'park', has: ['yu_tally'], rel: { yu: 2 } }, script: sc(
    'ユウと、砂場でお城を作った。波のかたちの堀を掘って、貝殻を並べる。',
    ['ユウ', '「ねえ、お兄ちゃん。夜明けって、本当にあるの？」'],
    ['ユウ', '「ぼく、見たことないんだ。いつも、空が割れて、真っ白になっちゃうから。」'],
    ['ソウ', '「……必ず見せる。約束する。」'],
    ['ユウ', '「うん。約束ね。」'],
    fact('yu_dawn_wish'), rel('yu', 1))},
  { id: 'yu_rec', kind: 'talk', npc: 'yu', label: 'ユウに、夜明けの話をする', cost: 25, once: 'ever',
    cond: { has: ['yu_dawn_wish', 'yu_girl_friend'], rel: { yu: 4 } }, script: sc(
    ['ユウ', '「ぼくね、最初に見た夜明けの色を、ずっと探してるんだ。」'],
    ['ユウ', '「オレンジと、ピンクと、ちょっと緑。……あれ、もう一回見たいな。」'],
    ['ソウ', '「見られるさ。きっと、いつか。」'],
    ['ユウ', '「お兄ちゃんが言うなら、そうかも。……ありがとう。」'],
    fact('rec_yu'), rel('yu', 1))},
];
