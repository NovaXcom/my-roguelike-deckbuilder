import Phaser from 'phaser';
import { BattleScene } from './scenes/BattleScene';
import { ChestScene } from './scenes/ChestScene';
import { GearScene } from './scenes/GearScene';
import { LootScene } from './scenes/LootScene';
import { MapScene } from './scenes/MapScene';
import { PartyScene } from './scenes/PartyScene';
import { PreloadScene } from './scenes/PreloadScene';
import { RestScene } from './scenes/RestScene';
import { RunEndScene } from './scenes/RunEndScene';
import { ShopScene } from './scenes/ShopScene';
import { TownScene } from './scenes/TownScene';
import { H, TitleScene, W } from './scenes/TitleScene';
import { audio, measureBgm, measureSfx, SFX_KINDS } from './audio';
import { bgmForScene } from './audio/cues';
import { game } from './game';
import { addSystemButtons } from './ui/widgets';

const phaser = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#14110f',
  disableContextMenu: true, // 長押しメニューを出さない
  input: { activePointers: 3, touch: { capture: true } },
  render: { powerPreference: 'high-performance', antialias: true },
  fps: { target: 60 },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [
    PreloadScene, TitleScene, TownScene, PartyScene, MapScene, BattleScene, LootScene,
    ChestScene, RestScene, ShopScene, GearScene, RunEndScene,
  ],
});

// 最初のユーザー操作（クリック/キー/タッチ）で AudioContext を確実に開放する
audio.installGestureUnlock();

// シーン遷移をなめらかに（各シーン生成時にフェードイン）
phaser.events.once('ready', () => {
  phaser.scene.scenes.filter((s) => s.scene.key !== 'Preload').forEach((s) => s.events.on('create', () => {
    s.cameras.main.fadeIn(180, 0, 0, 0);
    addSystemButtons(s);
    // 場面ごとのBGM（戦闘は BattleScene 側でボス判定して切替）
    const key = s.scene.key;
    if (key === 'RunEnd') audio.playBgm(null, 0.4);
    else if (key !== 'Battle') audio.playBgm(bgmForScene(key));
  }));
});

// ブラウザ自動検証用: URL に ?debug を付けたときだけ内部状態を公開する
if (location.search.includes('debug')) (window as unknown as Record<string, unknown>).__partyrogue = { game, phaser, audio, audioTools: { measureSfx, measureBgm, SFX_KINDS } };
