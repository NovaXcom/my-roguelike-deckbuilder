import Phaser from 'phaser';
import { BattleScene } from './scenes/BattleScene';
import { ChestScene } from './scenes/ChestScene';
import { GearScene } from './scenes/GearScene';
import { LootScene } from './scenes/LootScene';
import { MapScene } from './scenes/MapScene';
import { PartyScene } from './scenes/PartyScene';
import { RestScene } from './scenes/RestScene';
import { RunEndScene } from './scenes/RunEndScene';
import { ShopScene } from './scenes/ShopScene';
import { TownScene } from './scenes/TownScene';
import { H, TitleScene, W } from './scenes/TitleScene';
import { game } from './game';

const phaser = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#14110f',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [
    TitleScene, TownScene, PartyScene, MapScene, BattleScene, LootScene,
    ChestScene, RestScene, ShopScene, GearScene, RunEndScene,
  ],
});

// ブラウザ自動検証用: URL に ?debug を付けたときだけ内部状態を公開する
if (location.search.includes('debug')) (window as unknown as Record<string, unknown>).__partyrogue = { game, phaser };
