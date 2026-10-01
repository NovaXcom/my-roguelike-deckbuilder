import './ui/style.css';
import { Game } from './ui/game';

const root = document.getElementById('app')!;
(window as unknown as { game: Game }).game = new Game(root);
