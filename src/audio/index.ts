/**
 * サウンド管理。`src/assets/audio/` の音声ファイル(wav/mp3)を優先して再生し、
 * ファイルが無い/読み込み前の音は WebAudio の合成音(synth.ts)にフォールバックする。
 *
 * - AudioContext は最初のユーザー操作(pointerdown/keydown/touchend)まで生成しない（Autoplay制限対策）。
 * - 解錠後にファイルを非同期で読み込み・デコード。BGMは読み込み完了を待って再生開始。
 * - バス構成: SE → SEバス → コンプレッサー → マスター / BGM(ファイル or 合成) → BGMバス → コンプレッサー
 * - 音量は scripts/measure-audio.cjs が実測して trims.json に書き出す補正値で揃える。
 */
import { SOUNDS, collectAudioUrls, fileKeys, type ManifestId } from './ids';
import {
  BGM_TARGET_DB, SFX_KINDS, SFX_TARGET_DB, createBgm, makeNoise, measureBgm, measureSfx, synthSfx, type BgmMood, type SfxKind,
} from './synth';
import trimsJson from './trims.json';

export { BGM_TARGET_DB, SFX_KINDS, SFX_TARGET_DB, measureBgm, measureSfx };
export type { SfxKind, ManifestId };
export type SoundId = SfxKind | ManifestId;
export type AudioStatus = 'locked' | 'running' | 'suspended';

const TRIMS = trimsJson as Record<string, number>;
const URLS = collectAudioUrls(
  import.meta.glob<string>('../assets/audio/*.{mp3,wav}', { eager: true, query: '?url', import: 'default' }),
);

const MASTER_GAIN = 0.85;

/** 音声ファイルが無いときに鳴らす合成音（全マニフェストIDに用意） */
export const FALLBACK: Record<ManifestId, SfxKind | null> = {
  bgm_town: null, bgm_map: null, bgm_battle: null, bgm_boss: null,
  jg_win: 'win', jg_clear: 'clear', jg_lose: 'lose', jg_legendary: 'loot',
  atk_slash: 'slash', atk_bash: 'bash', atk_heavy: 'skill',
  mag_cast_fire: 'castFire', mag_cast_ice: 'castIce', mag_cast_thunder: 'castThunder',
  mag_hit_fire: 'hitFire', mag_hit_ice: 'hitIce', mag_hit_thunder: 'hitThunder',
  sup_guard: 'block', sup_heal: 'heal', sup_taunt: 'turn',
  hit_enemy: 'enemyHit', hit_weak: 'enemyHit', hit_resist: 'enemyHit',
  hit_party_s: 'hit', hit_party_l: 'hit', hit_blocked: 'block',
  fx_break: 'break', fx_chain: 'chain',
  en_slime: 'squelch', en_skeleton: 'clatter', en_golem: 'stomp', en_dragon_claw: 'bash', en_dragon_breath: 'breath',
  die_large: 'die', die_boss: 'dieBoss', party_down: 'die',
  deny: 'deny', ui_click: 'click', ui_select: 'select', ui_cancel: 'click',
  map_battle: 'turn', chest_open: 'loot', coin: 'coin',
};

const isSfxKind = (id: string): id is SfxKind => (SFX_KINDS as string[]).includes(id);

/** 読み込みの優先順位: 最初に鳴る BGM → UI/戦闘SE → その他 */
function loadPriority(key: string): number {
  if (key === 'bgm_town') return 0;
  if (key.startsWith('bgm_')) return 3;
  if (key.startsWith('jg_')) return 2;
  return 1;
}

interface Playing {
  id: string;
  src: AudioBufferSourceNode | null;
  gain: GainNode | null;
}

class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private bgmBus: GainNode | null = null;
  private synthBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private synth: ReturnType<typeof createBgm> | null = null;
  private synthOn = false;
  private timer: number | undefined;
  private buffers = new Map<string, AudioBuffer>();
  private loadDone = false;
  private last = new Map<string, string>();
  private wantedBgm: string | null = null;
  private bgm: Playing | null = null;
  private mood: BgmMood = 'calm';
  muted = false;

  constructor() {
    try { this.muted = localStorage.getItem('partyrogue.mute') === '1'; } catch { /* 保存不可 */ }
  }

  status(): AudioStatus {
    if (!this.ctx) return 'locked';
    return this.ctx.state === 'running' ? 'running' : 'suspended';
  }

  /** 読み込み状況（デバッグ/検証用） */
  loadInfo(): { loaded: number; total: number; done: boolean; bgm: string | null } {
    return { loaded: this.buffers.size, total: Object.keys(URLS).length, done: this.loadDone, bgm: this.bgm?.id ?? null };
  }

  hasFile(id: string): boolean {
    const def = SOUNDS.find((s) => s.id === id);
    return (def ? fileKeys(def) : [id]).some((k) => this.buffers.has(k));
  }

  /**
   * 最初のユーザー操作でグローバルに解錠する。タイトルの「クリックでスタート」以外
   * （キー入力・タッチ・別ボタン）が最初の操作でも確実に AudioContext を開放する。
   */
  installGestureUnlock(target: Window = window): void {
    const events = ['pointerdown', 'keydown', 'touchend', 'mousedown'] as const;
    const handler = () => {
      this.unlock();
      if (this.ctx?.state === 'running') events.forEach((e) => target.removeEventListener(e, handler, true));
    };
    events.forEach((e) => target.addEventListener(e, handler, true));
    // タブ復帰時に suspended/interrupted なら再開
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.ctx && this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
    });
  }

  /** 最初のユーザー操作から呼ぶ。以降は何度呼んでも安全。 */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER_GAIN;
      // ピークの重なり(チェイン+BGM等)で歪まないようマスター前にコンプレッサー
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 10;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      comp.connect(this.master).connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(comp);
      this.bgmBus = ctx.createGain();
      this.bgmBus.connect(comp);
      this.noise = makeNoise(ctx);
      this.timer = window.setInterval(() => {
        if (this.ctx && this.ctx.state === 'running' && this.synthOn) this.synth?.tick(this.ctx.currentTime);
      }, 200);
      void this.loadFiles(ctx);
    }
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
    this.applyBgm(0.4);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : MASTER_GAIN, this.ctx.currentTime, 0.02);
    try { localStorage.setItem('partyrogue.mute', this.muted ? '1' : '0'); } catch { /* 保存不可 */ }
    return this.muted;
  }

  // ---------------------------------------------------------------- ファイル読み込み
  private async loadFiles(ctx: AudioContext): Promise<void> {
    const queue = Object.keys(URLS).sort((a, b) => loadPriority(a) - loadPriority(b));
    const worker = async () => {
      for (let key = queue.shift(); key; key = queue.shift()) {
        try {
          const res = await fetch(URLS[key]);
          const data = await res.arrayBuffer();
          // 古い Safari は Promise 形式の decodeAudioData 非対応のためコールバック形式で包む
          const buf = await new Promise<AudioBuffer>((ok, ng) => { ctx.decodeAudioData(data, ok, ng); });
          this.buffers.set(key, buf);
          if (key === this.wantedBgm) this.applyBgm();
        } catch (e) {
          console.warn(`[audio] ${key} の読み込みに失敗（合成音で代替）`, e);
        }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    this.loadDone = true;
    this.applyBgm();
  }

  // ---------------------------------------------------------------- 効果音・ジングル
  private pickKey(id: string): string | null {
    const def = SOUNDS.find((s) => s.id === id);
    if (!def) return null;
    const keys = fileKeys(def).filter((k) => this.buffers.has(k));
    if (!keys.length) return null;
    const pool = keys.length > 1 ? keys.filter((k) => k !== this.last.get(id)) : keys;
    const key = pool[Math.floor(Math.random() * pool.length)];
    this.last.set(id, key);
    return key;
  }

  /**
   * 効果音/ジングルを再生。音声ファイルがあればそれを、無ければ合成音を鳴らす。
   * バリエーション(`_1.._n`)は直前と重複しないよう選ぶ。ジングル再生中はBGMを下げる。
   */
  play(id: SoundId, opts: { rate?: number; volume?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.noise) return;
    if (ctx.state === 'suspended') {
      // 解錠直後(resume完了前)の最初の音も取りこぼさない
      void ctx.resume().then(() => this.play(id, opts)).catch(() => undefined);
      return;
    }
    if (ctx.state !== 'running') return;
    try {
      const key = this.pickKey(id);
      if (key) {
        const buf = this.buffers.get(key)!;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = opts.rate ?? 1;
        const g = ctx.createGain();
        g.gain.value = (TRIMS[key] ?? 1) * (opts.volume ?? 1);
        src.connect(g).connect(this.sfxBus);
        src.start();
        if (SOUNDS.find((s) => s.id === id)?.type === 'jingle') this.duck(0.2, buf.duration / (opts.rate ?? 1) + 0.3);
        return;
      }
      const kind: SfxKind | null | undefined = isSfxKind(id) ? id : FALLBACK[id as ManifestId];
      if (kind) synthSfx(ctx, this.sfxBus, this.noise, kind);
    } catch (e) {
      console.warn(`[audio] ${id} の再生に失敗`, e);
    }
  }

  /** BGMを一時的に下げる（ジングル・チェインのカットイン中など）。seconds後に元へ戻す。 */
  duck(level: number, seconds: number): void {
    if (!this.ctx || !this.bgmBus) return;
    const t = this.ctx.currentTime;
    const p = this.bgmBus.gain;
    p.cancelScheduledValues(t);
    p.setTargetAtTime(level, t, 0.05);
    p.setTargetAtTime(1, t + seconds, 0.3);
  }

  // ---------------------------------------------------------------- BGM
  /** 場面のBGMを切り替える（クロスフェード）。null で停止。解錠前に呼んでも解錠後に再生される。 */
  playBgm(id: string | null, fade = 0.8): void {
    this.wantedBgm = id;
    if (this.ctx) this.applyBgm(fade);
  }

  private applyBgm(fade = 0.8): void {
    const ctx = this.ctx;
    if (!ctx || !this.bgmBus) return;
    const id = this.wantedBgm;
    if (!id) { this.fadeOutBgm(fade); this.setSynth(false); return; }
    if (this.bgm?.id === id) return;
    const buf = this.buffers.get(id);
    if (buf) {
      this.fadeOutBgm(fade);
      this.setSynth(false);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      const now = ctx.currentTime;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(TRIMS[id] ?? 1, now + fade);
      src.connect(g).connect(this.bgmBus);
      src.start();
      this.bgm = { id, src, gain: g };
    } else if (this.loadDone) {
      // 音声ファイルが無い場合は合成BGM（ドローン+鐘+戦闘の鼓動）
      this.fadeOutBgm(fade);
      this.mood = id === 'bgm_battle' || id === 'bgm_boss' ? 'battle' : 'calm';
      this.setSynth(true);
      this.bgm = { id, src: null, gain: null };
    }
    // それ以外は読み込み完了を待つ（完了時に再度 applyBgm）
  }

  private fadeOutBgm(fade: number): void {
    const cur = this.bgm;
    this.bgm = null;
    if (!cur?.gain || !cur.src || !this.ctx) return;
    const t = this.ctx.currentTime;
    cur.gain.gain.cancelScheduledValues(t);
    cur.gain.gain.setTargetAtTime(0, t, Math.max(0.05, fade / 3));
    cur.src.stop(t + fade + 0.2);
  }

  private setSynth(on: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.bgmBus || !this.noise) return;
    if (on && !this.synth) {
      this.synthBus = ctx.createGain();
      this.synthBus.gain.value = 0;
      this.synthBus.connect(this.bgmBus);
      this.synth = createBgm(ctx, this.synthBus, this.noise);
    }
    this.synthOn = on;
    this.synthBus?.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.3);
    if (on) this.synth?.setMood(this.mood);
  }

  dispose(): void {
    if (this.timer) window.clearInterval(this.timer);
  }
}

export const audio = new AudioManager();
