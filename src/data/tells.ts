// 「誰に何を伝えたか」への反応。キーは "npc|fact"。
// 伝えた内容は永続フラグ(p:told:...)になり、次の周回以降の町の動きにも影響する。
import { fact, flag, rel, sc } from '../engine/dsl';
import type { Node } from '../engine/types';
import { SHARED } from './events_town_a';

export const TELLS: Record<string, Node[]> = {
  'mina|station_3pm': sc(
    ['ミナ', '「え、駅が3時に？ ふうん……なんでだろ。ちょっと、確かめてこようかな。」'],
    '好奇心の強いミナの目が、きらりと光った。——何かが、動き出した気がする。', rel('mina', 1)),
  'mina|loop_confirmed': sc(
    ['ミナ', '「……やっぱり。やっぱりそうなんだ。」'],
    ['ミナ', '「ありがとう、言ってくれて。ひとりで抱えてるの、きつかったでしょ。」'],
    fact('mina_deja_vu'), rel('mina', 2)),
  'mina|town_is_memory': sc(
    ['ミナ', '「…………」'], ['ミナ', '「そっか。ソウは、そこまで辿り着いたんだ。」'],
    'ミナは、泣きそうな顔で、笑った。', rel('mina', 1)),
  'yu|girl_2340': sc(
    ['ユウ', '「うん。知ってる。あの子、ずっと待ってるんだよ。」'],
    ['ユウ', '「ぼく、夜になったら、あの子のところへ行くことにしてる。」'],
    flag('p:yu_knows_girl'), fact('yu_girl_friend'), rel('yu', 1)),
  'yu|loop_confirmed': sc(
    ['ユウ', '「……やっと、気づいたんだ。ずっと待ってたよ。」'], fact('yu_aware'), rel('yu', 1)),
  'saeki|loop_confirmed': sc(
    ['佐伯', '「……ふむ。私はね、時間が戻っているのではなく、記憶が戻っているのだと思う。」'],
    ['佐伯', '「世界は、同じ記憶を再生しているだけなのかもしれない。」'],
    fact('saeki_theory'), rel('saeki', 1)),
  'saeki|saeki_empty_patient': sc(
    ['佐伯', '「見ていたのか。……恥ずかしいところを見せたね。」'],
    ['佐伯', '「あの椅子は、いつも空けておく決まりなんだ。」'], rel('saeki', 1)),
  'tadokoro|blackout_2347': sc(
    ['田所', '「23時47分に停電？ ははっ、何それ。……でも、一応ロウソク、仕入れとくかな。」'],
    '田所は半信半疑で、棚の裏からロウソクの箱を出した。', rel('tadokoro', 1)),
  'tadokoro|loop_confirmed': sc(
    ['田所', '「あー……やっぱ、そう思います？ 毎日、同じお客さんが同じ順番で来るんすよ。」'], fact('tad_cans'), rel('tadokoro', 1)),
  'asagiri|every_year_817': SHARED.fire,
  'asagiri|town_replays': SHARED.fire,
  'shinohara|every_year_817': SHARED.names,
  'shinohara|town_replays': SHARED.names,
  'gen|light_2350': sc(
    ['源さん', '「ほう。あの光を、知っとるのか。」'], ['源さん', '「ちょっと、話してやろうか。昔のことをな。」'],
    fact('gen_light'), rel('gen', 1)),
  'hanako|mina_kei': sc(
    ['ひなこ', '「……ケイくんの名前、ミナちゃんから聞いたの？」'],
    ['ひなこ', '「弟さんよ。あの白い花は、その子のため。」'], fact('kei_brother'), rel('hanako', 1)),
  'hanako|mina_flower': sc(['ひなこ', '「ええ、毎日買っていくのよ。大切な人に、あげるんですって。」'], rel('hanako', 1)),
  'kuroda|warehouse_empty': SHARED.hatch,
  'kuroda|kuroda_shiina_talk': SHARED.hatch,
  'shiina|town_is_memory': sc(
    ['椎名', '「…………」'], ['椎名', '「……少し、お話ししましょう。あなたには、もう隠せないものね。」'],
    fact('shiina_role'), flag('p:shiina_open')),
  'shiina|capsules': sc(
    ['椎名', '「あの広間まで。……そう。」'], ['椎名', '「あれを知ったからには、もう戻れないわよ。」'], flag('p:shiina_wary')),
  'kubo|truth_self': sc(
    ['久保さん', '「まあ。思い出したのね、管理人さん。……お帰りなさい。」'], fact('ooya_kanrinin'), rel('kubo', 2)),
  'shiori|girl_2340': sc(['少女', '「うん。毎回、ここで待ってる。」']),
  'shiori|truth_girl': sc(['少女', '「……全部、知ったんだね。」'], rel('shiori', 1)),
};
