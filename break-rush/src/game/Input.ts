/** One frame of player intent, merged from keyboard, mouse and gamepad. */
export interface Intent {
  /** Stick-style movement: +y forward, +x right. */
  moveX: number;
  moveY: number;
  light: boolean;
  heavy: boolean;
  dodge: boolean;
  counter: boolean;
  grab: boolean;
  pickup: boolean;
  rush: boolean;
  pausePressed: boolean;
  /** Camera turn this frame, in radians (already scaled). */
  lookYaw: number;
  lookPitch: number;
}

const KEYS_PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private mouseDown = new Set<number>();
  private mousePressed = new Set<number>();
  private dx = 0;
  private dy = 0;
  private padPrev: boolean[] = [];
  locked = false;
  sens = 1;
  /** Becomes true the first time a gamepad is used, so the UI can show pad prompts. */
  padActive = false;

  constructor(private canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (KEYS_PREVENT.has(e.code)) e.preventDefault();
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
    window.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.dx += e.movementX;
        this.dy += e.movementY;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
  }

  requestLock(): void {
    try {
      const r = this.canvas.requestPointerLock?.() as unknown;
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => undefined);
    } catch {
      /* pointer lock unavailable: keyboard/gamepad look still works */
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Call once per rendered frame. */
  poll(dt: number): Intent {
    const k = (c: string) => this.down.has(c);
    const kp = (c: string) => this.pressed.has(c);
    let mx = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
    let my = (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0);
    let light = this.mousePressed.has(0) || kp('KeyJ');
    let counter = this.mousePressed.has(2) || kp('KeyK') || kp('ShiftLeft');
    let heavy = kp('KeyE') || this.mousePressed.has(1);
    let dodge = kp('Space');
    let grab = kp('KeyF');
    let pickup = kp('KeyQ');
    let rush = kp('KeyR');
    let pausePressed = kp('Escape') || kp('KeyP');
    const mouseScale = 0.0022 * this.sens;
    let lookYaw = this.dx * mouseScale;
    let lookPitch = -this.dy * mouseScale;
    const keyLook = 2.4 * dt * this.sens;
    lookYaw += ((k('ArrowRight') ? 1 : 0) - (k('ArrowLeft') ? 1 : 0)) * keyLook;
    lookPitch += ((k('ArrowUp') ? 1 : 0) - (k('ArrowDown') ? 1 : 0)) * keyLook;

    // ---- gamepad -----------------------------------------------------------
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
      const lx = dz(p.axes[0] ?? 0), ly = dz(p.axes[1] ?? 0), rx = dz(p.axes[2] ?? 0), ry = dz(p.axes[3] ?? 0);
      const b = (i: number) => !!p.buttons[i]?.pressed;
      const edge = (i: number) => b(i) && !this.padPrev[i];
      if (lx || ly || rx || ry || p.buttons.some((x) => x.pressed)) this.padActive = true;
      mx += lx;
      my += -ly;
      dodge ||= edge(0);
      counter ||= edge(1);
      light ||= edge(2);
      heavy ||= edge(3);
      pickup ||= edge(4);
      grab ||= edge(5);
      rush ||= edge(7) || edge(6);
      pausePressed ||= edge(9);
      lookYaw += rx * 2.9 * dt * this.sens;
      lookPitch += -ry * 2.2 * dt * this.sens;
      this.padPrev = p.buttons.map((x) => x.pressed);
      break;
    }

    const l = Math.hypot(mx, my);
    if (l > 1) {
      mx /= l;
      my /= l;
    }
    const out: Intent = { moveX: mx, moveY: my, light, heavy, dodge, counter, grab, pickup, rush, pausePressed, lookYaw, lookPitch };
    this.pressed.clear();
    this.mousePressed.clear();
    this.dx = this.dy = 0;
    return out;
  }
}
