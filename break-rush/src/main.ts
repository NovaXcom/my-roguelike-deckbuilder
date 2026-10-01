import { Game } from './game/Game';

const root = document.getElementById('app')!;
try {
  new Game(root);
} catch (e) {
  root.innerHTML = '<div style="color:#fff;padding:24px;font:16px sans-serif">This game needs WebGL, which your browser could not start.</div>';
  console.error(e);
}
