import Phaser from 'phaser';
import { BootScene } from './scenes/boot';
import { TitleScene } from './scenes/title';
import { BaseScene } from './scenes/base';
import { BattleScene } from './scenes/battle';
import { CutinScene } from './scenes/cutin';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#1e1b18',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, TitleScene, BaseScene, BattleScene, CutinScene],
});
