/** Keyboard + on-screen touch controls, unified into one move vector and edge-triggered buttons. */
export class Input {
  /** Move direction on the ground plane (x = right, z = down the screen). Length <= 1. */
  moveX = 0;
  moveZ = 0;
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private joyId: number | null = null;
  private joyOriginX = 0;
  private joyOriginY = 0;
  private joyX = 0;
  private joyY = 0;
  readonly touch: boolean;
  private knob: HTMLElement | null = null;
  private base: HTMLElement | null = null;

  constructor(private root: HTMLElement) {
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    if (this.touch) this.buildTouchUi();
  }

  /** True once per key press (consumes it). */
  tap(...codes: string[]): boolean {
    let hit = false;
    for (const c of codes) if (this.pressed.delete(c)) hit = true;
    return hit;
  }

  /** Programmatic press (touch buttons). */
  press(code: string): void {
    this.pressed.add(code);
  }

  clearTaps(): void {
    this.pressed.clear();
  }

  update(): void {
    let x = 0;
    let z = 0;
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) z -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) z += 1;
    x += this.joyX;
    z += this.joyY;
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    this.moveX = x;
    this.moveZ = z;
  }

  private buildTouchUi(): void {
    const zone = document.createElement('div');
    zone.className = 'joyzone';
    zone.innerHTML = '<div class="joybase"><div class="joyknob"></div></div>';
    this.root.appendChild(zone);
    this.base = zone.querySelector('.joybase');
    this.knob = zone.querySelector('.joyknob');
    const R = 55;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== this.joyId) return;
      let dx = e.clientX - this.joyOriginX;
      let dy = e.clientY - this.joyOriginY;
      const l = Math.hypot(dx, dy);
      if (l > R) {
        dx = (dx / l) * R;
        dy = (dy / l) * R;
      }
      this.joyX = dx / R;
      this.joyY = dy / R;
      if (this.knob) this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    zone.addEventListener('pointerdown', (e) => {
      if (this.joyId !== null) return;
      this.joyId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      this.joyOriginX = e.clientX;
      this.joyOriginY = e.clientY;
      if (this.base) {
        this.base.style.display = 'block';
        this.base.style.left = `${e.clientX - 70}px`;
        this.base.style.top = `${e.clientY - 70}px`;
      }
      move(e);
    });
    zone.addEventListener('pointermove', move);
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null;
      this.joyX = 0;
      this.joyY = 0;
      if (this.base) this.base.style.display = 'none';
      if (this.knob) this.knob.style.transform = '';
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }
}
