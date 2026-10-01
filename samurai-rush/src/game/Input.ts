import { Cmd } from '../samurai/World';

/** One frame of player intent, merged from keyboard, mouse and gamepad. */
export interface Intent {
  moveX: number;
  moveY: number;
  jump: boolean;
  jumpHeld: boolean;
  slash: boolean;
  parry: boolean;
  parryHeld: boolean;
  dash: boolean;
  iai: boolean;
  confirm: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  digit: number;
  pause: boolean;
}

const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private mouseDown = new Set<number>();
  private mousePressed = new Set<number>();
  private padPrev: boolean[] = [];
  private padAxisPrev = 0;
  padActive = false;

  constructor(canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouseDown.clear();
    });
    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown.add(e.button);
      this.mousePressed.add(e.button);
    });
    window.addEventListener('mouseup', (e) => this.mouseDown.delete(e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Call once per rendered frame. */
  poll(): Intent {
    const k = (c: string) => this.down.has(c);
    const kp = (c: string) => this.pressed.has(c);
    let mx = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
    let my = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
    let jump = kp('Space');
    let jumpHeld = k('Space');
    let slash = this.mousePressed.has(0) || kp('KeyJ') || kp('KeyZ');
    let parry = this.mousePressed.has(2) || kp('KeyK') || kp('KeyX');
    let parryHeld = this.mouseDown.has(2) || k('KeyK') || k('KeyX');
    let dash = kp('ShiftLeft') || kp('ShiftRight') || kp('KeyL') || kp('KeyC');
    let iai = kp('KeyI') || kp('KeyE') || kp('KeyV');
    let confirm = kp('Enter') || kp('Space') || kp('KeyJ');
    let back = kp('Escape') || kp('Backspace');
    let left = kp('ArrowLeft') || kp('KeyA');
    let right = kp('ArrowRight') || kp('KeyD');
    const digit = kp('Digit1') ? 1 : kp('Digit2') ? 2 : kp('Digit3') ? 3 : 0;
    let pause = kp('Escape') || kp('KeyP');

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const dz = (v: number) => (Math.abs(v) < 0.22 ? 0 : (v - Math.sign(v) * 0.22) / 0.78);
      const lx = dz(p.axes[0] ?? 0), ly = dz(p.axes[1] ?? 0);
      const b = (i: number) => !!p.buttons[i]?.pressed;
      const edge = (i: number) => b(i) && !this.padPrev[i];
      if (lx || ly || p.buttons.some((x) => x.pressed)) this.padActive = true;
      mx += lx + (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
      my += -ly + (b(12) ? 1 : 0) - (b(13) ? 1 : 0);
      jump ||= edge(0);
      jumpHeld ||= b(0);
      slash ||= edge(2);
      parry ||= edge(1);
      parryHeld ||= b(1);
      dash ||= edge(5) || edge(7) || edge(4);
      iai ||= edge(3);
      confirm ||= edge(0);
      back ||= edge(1);
      pause ||= edge(9);
      const ax = Math.abs(lx) > 0.6 ? Math.sign(lx) : 0;
      if (ax !== 0 && ax !== this.padAxisPrev) { left ||= ax < 0; right ||= ax > 0; }
      this.padAxisPrev = ax;
      this.padPrev = p.buttons.map((x) => x.pressed);
      break;
    }

    mx = Math.max(-1, Math.min(1, mx));
    my = Math.max(-1, Math.min(1, my));
    const out: Intent = { moveX: mx, moveY: my, jump, jumpHeld, slash, parry, parryHeld, dash, iai, confirm, back, left, right, digit, pause };
    this.pressed.clear();
    this.mousePressed.clear();
    return out;
  }
}

/** Latches button edges between rendered frames so that no press is lost to the fixed step. */
export class CmdLatch {
  private edges = { jump: false, slash: false, parry: false, dash: false, iai: false };
  held: Pick<Cmd, 'moveX' | 'moveY' | 'jumpHeld' | 'parryHeld'> = { moveX: 0, moveY: 0, jumpHeld: false, parryHeld: false };

  feed(i: Intent): void {
    this.edges.jump ||= i.jump;
    this.edges.slash ||= i.slash;
    this.edges.parry ||= i.parry;
    this.edges.dash ||= i.dash;
    this.edges.iai ||= i.iai;
    this.held = { moveX: i.moveX, moveY: i.moveY, jumpHeld: i.jumpHeld, parryHeld: i.parryHeld };
  }

  /** Edges are consumed by the first fixed step that follows. */
  take(): Cmd {
    const c: Cmd = { ...this.held, ...this.edges };
    this.edges = { jump: false, slash: false, parry: false, dash: false, iai: false };
    return c;
  }
}
