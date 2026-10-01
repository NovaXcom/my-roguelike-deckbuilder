import './style.css';
import { Game } from './game/Game';

const root = document.getElementById('app');
if (root) new Game(root);
