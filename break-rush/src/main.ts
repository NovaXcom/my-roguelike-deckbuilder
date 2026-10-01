import './style.css';
import { Game } from './game/Game';

const root = document.getElementById('app')!;
try {
  const game = new Game(root);
  // the first click anywhere unlocks audio (browser autoplay rules)
  void game;
} catch (e) {
  root.innerHTML = '<div style="color:#fff;font:16px sans-serif;padding:32px">This game needs WebGL. Please enable hardware acceleration or try another browser.</div>';
  console.error(e);
}
