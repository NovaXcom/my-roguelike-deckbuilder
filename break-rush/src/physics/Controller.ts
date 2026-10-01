import { MOVE } from './config';

export interface Box {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  /** Surfaces you can run along. */
  wall?: boolean;
  /** Touching this kills (lasers, spikes). */
  hazard?: boolean;
  /** Decoration only: no collision. */
  ghost?: boolean;
  /** Rendering hint only. */
  /** Launches whoever lands on it. */
  pad?: boolean;
  /** Falls away shortly after being stood on (see Crumbler). */
  crumble?: boolean;
  tag?: 'floor' | 'cover' | 'ceiling' | 'pillar' | 'pad' | 'crumble' | 'gate';
}

export interface MoveInput {
  /** Desired direction on the ground plane, already relative to the camera. Length <= 1. */
  moveX: number;
  moveZ: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
  slideHeld: boolean;
  dashPressed: boolean;
}

export type MoveState = 'ground' | 'air' | 'slide' | 'wallrun' | 'dash';

export interface MoveEvents {
  jumped: boolean;
  landed: boolean;
  landSpeed: number;
  wallJumped: boolean;
  dashed: boolean;
  slideStarted: boolean;
  wallRunStarted: boolean;
  hitHazard: boolean;
  fell: boolean;
  padded: boolean;
}

const noEvents = (): MoveEvents => ({ jumped: false, landed: false, landSpeed: 0, wallJumped: false, dashed: false, slideStarted: false, wallRunStarted: false, hitHazard: false, fell: false, padded: false });

/**
 * First-principles platforming controller: AABB vs boxes, with coyote time, jump buffering, variable
 * jump height, slide, air dash and wall-run / wall-jump. Pure maths, so the whole feel is unit-testable.
 */
export class Controller {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  state: MoveState = 'air';
  onGround = false;
  height: number = MOVE.height;
  /** Yaw the character faces (radians, 0 = +x, increasing toward +z). */
  yaw = 0;
  dashCharges: number = MOVE.dashCharges;
  /** Wall normal while wall-running (points away from the wall). */
  /** The box we are standing on, if any. */
  groundBox: Box | null = null;
  wallNx = 0;
  wallNz = 0;
  wallRunTime = 0;
  slideTime = 0;
  dashTimeLeft = 0;
  /** When set, the current dash also carries this vertical speed (used for aimed lunges). */
  dashVy: number | null = null;
  private dashDirX = 0;
  private dashDirZ = 0;
  private dashCd = 0;
  private coyoteLeft = 0;
  private bufferLeft = 0;
  private reattachCd = 0;
  private lastWallBox: Box | null = null;
  private spentWall: Box | null = null;
  private noCut = false;
  private wallDir = 1;

  constructor(public boxes: Box[]) {}

  reset(x: number, y: number, z: number, yaw = 0): void {
    this.x = x; this.y = y; this.z = z;
    this.vx = this.vy = this.vz = 0;
    this.state = 'air';
    this.onGround = false;
    this.height = MOVE.height;
    this.yaw = yaw;
    this.dashCharges = MOVE.dashCharges;
    this.wallRunTime = 0;
    this.slideTime = 0;
    this.dashTimeLeft = 0;
    this.dashCd = 0;
    this.coyoteLeft = 0;
    this.bufferLeft = 0;
    this.reattachCd = 0;
    this.lastWallBox = null;
    this.spentWall = null;
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  /** An aimed lunge (sword attack): a dash in any direction that does not use up the air dash charge. */
  lunge(dx: number, dy: number, dz: number, speed: number, time: number): void {
    const h = Math.hypot(dx, dz) || 1;
    this.dashDirX = dx / h;
    this.dashDirZ = dz / h;
    this.dashVy = dy;
    this.dashTimeLeft = time;
    this.dashCd = 0;
    this.setStanding();
    this.state = 'dash';
    this.onGround = false;
    void speed;
  }

  /** Hard knock-back (e.g. bouncing off a shield): cancels dashes and lunges. */
  knock(vx: number, vy: number, vz: number): void {
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.dashTimeLeft = 0;
    this.dashVy = null;
    this.onGround = false;
    this.state = 'air';
    this.airCap = Math.max(MOVE.runSpeed, Math.hypot(vx, vz));
  }

  step(dt: number, inp: MoveInput): MoveEvents {
    const ev = noEvents();
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.reattachCd = Math.max(0, this.reattachCd - dt);
    this.coyoteLeft = Math.max(0, this.coyoteLeft - dt);
    this.bufferLeft = Math.max(0, this.bufferLeft - dt);
    if (inp.jumpPressed) this.bufferLeft = MOVE.jumpBuffer;

    // ---- dash ---------------------------------------------------------
    if (inp.dashPressed && this.dashCd <= 0 && this.dashTimeLeft <= 0 && (this.onGround || this.dashCharges > 0)) {
      let dx = inp.moveX;
      let dz = inp.moveZ;
      if (Math.hypot(dx, dz) < 0.1) {
        dx = Math.cos(this.yaw);
        dz = Math.sin(this.yaw);
      }
      const l = Math.hypot(dx, dz) || 1;
      this.dashDirX = dx / l;
      this.dashDirZ = dz / l;
      this.dashTimeLeft = MOVE.dashTime;
      this.dashCd = MOVE.dashCooldown;
      if (!this.onGround) this.dashCharges--;
      this.setStanding();
      this.state = 'dash';
      ev.dashed = true;
    }

    if (this.state === 'dash') {
      this.dashTimeLeft -= dt;
      this.vx = this.dashDirX * MOVE.dashSpeed;
      this.vz = this.dashDirZ * MOVE.dashSpeed;
      this.vy = this.dashVy !== null ? this.dashVy : this.onGround ? 0 : Math.max(this.vy, 0) * 0.5;
      if (this.dashTimeLeft <= 0) {
        this.dashVy = null;
        // keep most of the momentum, drop back to normal control
        this.vx *= 0.45;
        this.vz *= 0.45;
        this.state = this.onGround ? 'ground' : 'air';
      }
    } else {
      this.updateHorizontal(dt, inp, ev);
    }

    // ---- jumping --------------------------------------------------------
    if (this.bufferLeft > 0) {
      if (this.state === 'wallrun') {
        this.vx = this.wallNx * MOVE.wallJumpAway + this.alongX() * MOVE.wallJumpAlong;
        this.vz = this.wallNz * MOVE.wallJumpAway + this.alongZ() * MOVE.wallJumpAlong;
        this.vy = MOVE.wallJumpUp;
        this.state = 'air';
        this.reattachCd = MOVE.wallReattach;
        this.bufferLeft = 0;
        this.coyoteLeft = 0;
        ev.wallJumped = ev.jumped = true;
        this.yaw = Math.atan2(this.vz, this.vx);
      } else if (this.onGround || this.coyoteLeft > 0) {
        this.vy = MOVE.jumpSpeed;
        this.noCut = false;
        this.onGround = false;
        this.coyoteLeft = 0;
        this.bufferLeft = 0;
        if (this.state === 'slide') {
          this.vx *= 1.05;
          this.vz *= 1.05;
        }
        this.setStanding();
        this.state = 'air';
        ev.jumped = true;
      }
    }
    if (this.onGround) this.noCut = false;
    if (!inp.jumpHeld && this.vy > 0 && this.state === 'air' && !this.noCut) this.vy *= Math.pow(MOVE.jumpCut, dt * 14);

    // ---- gravity --------------------------------------------------------
    if (this.state === 'wallrun') this.vy -= MOVE.wallRunGravity * dt;
    else if (this.state !== 'dash') this.vy -= MOVE.gravity * dt;
    if (this.vy < -45) this.vy = -45;

    // ---- move & collide ------------------------------------------------
    const wasGround = this.onGround;
    const impact = this.vy;
    this.moveAndCollide(dt, ev);
    if (this.onGround && this.groundBox?.pad && this.state !== 'dash') {
      this.vy = MOVE.padSpeed;
      this.onGround = false;
      this.state = 'air';
      this.coyoteLeft = 0;
      this.dashCharges = MOVE.dashCharges;
      ev.padded = true;
      this.noCut = true;
      this.y += 0.02;
    }
    if (this.onGround && !wasGround) {
      ev.landed = true;
      ev.landSpeed = -impact;
      this.dashCharges = MOVE.dashCharges;
      this.spentWall = null;
      if (this.state === 'air' || this.state === 'wallrun') this.state = 'ground';
    }
    if (this.onGround) this.coyoteLeft = MOVE.coyote;
    if (!this.onGround && wasGround && this.state === 'ground') this.state = 'air';

    this.updateWall(dt, inp, ev);

    if (this.speed > 0.5 && this.state !== 'wallrun') this.yaw = Math.atan2(this.vz, this.vx);
    if (this.y < MOVE.killY) ev.fell = true;
    return ev;
  }

  // ---- internals ---------------------------------------------------------

  private alongX(): number {
    return -this.wallNz * this.wallDir;
  }
  private alongZ(): number {
    return this.wallNx * this.wallDir;
  }

  private setStanding(): void {
    if (this.height === MOVE.height) return;
    // only stand up if there is headroom
    const old = this.height;
    this.height = MOVE.height;
    if (this.overlaps(this.x, this.y, this.z)) this.height = old;
    else this.slideTime = 0;
  }

  private updateHorizontal(dt: number, inp: MoveInput, ev: MoveEvents): void {
    const want = MOVE.runSpeed;
    const tx = inp.moveX * want;
    const tz = inp.moveZ * want;
    const hasInput = Math.hypot(inp.moveX, inp.moveZ) > 0.05;

    if (this.state === 'slide') {
      this.slideTime += dt;
      const sp = this.speed;
      const nsp = Math.max(0, sp - MOVE.slideDecay * dt);
      if (sp > 0.001) {
        this.vx *= nsp / sp;
        this.vz *= nsp / sp;
      }
      // a little steering while sliding
      this.vx += inp.moveX * 8 * dt;
      this.vz += inp.moveZ * 8 * dt;
      if (!inp.slideHeld || nsp < MOVE.slideMinSpeed || !this.onGround) {
        this.endSlide();
      }
      return;
    }

    if (this.state === 'wallrun') {
      this.wallRunTime += dt;
      const sp = Math.max(this.speed, MOVE.wallRunSpeed);
      this.vx = this.alongX() * sp - this.wallNx * 0.6;
      this.vz = this.alongZ() * sp - this.wallNz * 0.6;
      return;
    }

    if (this.onGround) {
      if (inp.slideHeld && this.speed > 5 && this.state !== 'dash') {
        this.beginSlide(ev);
        return;
      }
      // accelerate toward the wish velocity, brake when there is no input
      const dx = tx - this.vx;
      const dz = tz - this.vz;
      const d = Math.hypot(dx, dz);
      const a = (hasInput ? MOVE.groundAccel : MOVE.groundFriction) * dt;
      if (d <= a || d === 0) {
        this.vx = tx;
        this.vz = tz;
      } else {
        this.vx += (dx / d) * a;
        this.vz += (dz / d) * a;
      }
    } else {
      // air control: steer, but never bleed speed you built up
      if (hasInput) {
        this.vx += inp.moveX * MOVE.airAccel * dt;
        this.vz += inp.moveZ * MOVE.airAccel * dt;
        const sp = this.speed;
        const cap = Math.max(MOVE.runSpeed, this.airCap);
        if (sp > cap) {
          this.vx *= cap / sp;
          this.vz *= cap / sp;
        }
      } else {
        const k = Math.max(0, 1 - MOVE.airDrag * dt);
        this.vx *= k;
        this.vz *= k;
      }
    }
  }

  /** Speed ceiling in the air: whatever speed we took off with. */
  private airCap = 0;

  private beginSlide(ev: MoveEvents): void {
    this.state = 'slide';
    this.slideTime = 0;
    this.height = MOVE.slideHeight;
    const sp = this.speed;
    const boost = Math.max(sp, MOVE.slideSpeed);
    if (sp > 0.01) {
      this.vx *= boost / sp;
      this.vz *= boost / sp;
    }
    ev.slideStarted = true;
  }

  private endSlide(): void {
    this.setStanding();
    if (this.height === MOVE.height) this.state = this.onGround ? 'ground' : 'air';
    else {
      // stuck under a low ceiling: keep crawling
      this.state = 'slide';
      const sp = this.speed;
      if (sp < 2.5) {
        const l = sp || 1;
        this.vx = (this.vx / l) * 2.5;
        this.vz = (this.vz / l) * 2.5;
      }
    }
  }

  private updateWall(dt: number, inp: MoveInput, ev: MoveEvents): void {
    void dt;
    if (this.state === 'wallrun') {
      const c = this.wallContact();
      if (!c || this.onGround || this.wallRunTime > MOVE.wallRunMax) {
        // exhausted: this wall is spent until we touch the ground again
        if (c && this.wallRunTime > MOVE.wallRunMax) this.spentWall = c.box;
        this.state = 'air';
        this.reattachCd = MOVE.wallReattach;
        this.airCap = Math.max(this.speed, MOVE.runSpeed);
      } else {
        this.wallNx = c.nx;
        this.wallNz = c.nz;
      }
      return;
    }
    if (this.state !== 'air' || this.reattachCd > 0 || this.vy < -14) return;
    const c = this.wallContact();
    if (!c || !c.box.wall || c.box === this.spentWall) return;
    const movingEnough = this.speed > 4.5 || Math.hypot(inp.moveX, inp.moveZ) > 0.3;
    if (!movingEnough) return;
    // run along the wall in the direction we were already travelling
    const tx = -c.nz;
    const tz = c.nx;
    const dir = this.vx * tx + this.vz * tz >= 0 ? 1 : -1;
    // only stick when we are travelling along or into the wall, not peeling away from it
    if (this.vx * c.nx + this.vz * c.nz > 3) return;
    this.state = 'wallrun';
    this.wallNx = c.nx;
    this.wallNz = c.nz;
    this.wallDir = dir;
    this.wallRunTime = 0;
    this.lastWallBox = c.box;
    this.dashCharges = MOVE.dashCharges;
    this.vy = Math.min(Math.max(this.vy, 0.5), 2.2);
    ev.wallRunStarted = true;
  }

  /** Nearest wall within reach in the 4 axis directions. nx,nz point away from the wall. */
  private wallContact(): { box: Box; nx: number; nz: number } | null {
    const p = MOVE.wallProbe;
    const hw = MOVE.halfWidth;
    const yLo = this.y + 0.35;
    const yHi = this.y + this.height - 0.35;
    let best: { box: Box; nx: number; nz: number } | null = null;
    for (const b of this.boxes) {
      if (b.ghost || !b.wall) continue;
      if (b.maxY < yLo || b.minY > yHi) continue;
      if (this.z + hw > b.minZ && this.z - hw < b.maxZ) {
        if (this.x - hw >= b.maxX - 0.02 && this.x - hw - b.maxX < p) best = { box: b, nx: 1, nz: 0 };
        else if (this.x + hw <= b.minX + 0.02 && b.minX - (this.x + hw) < p) best = { box: b, nx: -1, nz: 0 };
      }
      if (this.x + hw > b.minX && this.x - hw < b.maxX) {
        if (this.z - hw >= b.maxZ - 0.02 && this.z - hw - b.maxZ < p) best = { box: b, nx: 0, nz: 1 };
        else if (this.z + hw <= b.minZ + 0.02 && b.minZ - (this.z + hw) < p) best = { box: b, nx: 0, nz: -1 };
      }
    }
    return best;
  }

  private overlaps(px: number, py: number, pz: number): boolean {
    const hw = MOVE.halfWidth;
    for (const b of this.boxes) {
      if (b.ghost) continue;
      if (px + hw > b.minX + 1e-4 && px - hw < b.maxX - 1e-4 && py + this.height > b.minY + 1e-4 && py < b.maxY - 1e-4 && pz + hw > b.minZ + 1e-4 && pz - hw < b.maxZ - 1e-4) return true;
    }
    return false;
  }

  private hazardTouch(): boolean {
    const hw = MOVE.halfWidth;
    for (const b of this.boxes) {
      if (!b.hazard) continue;
      if (this.x + hw > b.minX && this.x - hw < b.maxX && this.y + this.height > b.minY && this.y < b.maxY && this.z + hw > b.minZ && this.z - hw < b.maxZ) return true;
    }
    return false;
  }

  private moveAndCollide(dt: number, ev: MoveEvents): void {
    const hw = MOVE.halfWidth;
    // X then Z then Y, each resolved against every solid box
    for (const axis of ['x', 'z'] as const) {
      const v = axis === 'x' ? this.vx : this.vz;
      if (v === 0) continue;
      if (axis === 'x') this.x += v * dt;
      else this.z += v * dt;
      for (const b of this.boxes) {
        if (b.ghost || b.hazard) continue;
        if (this.x + hw > b.minX && this.x - hw < b.maxX && this.y + this.height > b.minY && this.y < b.maxY && this.z + hw > b.minZ && this.z - hw < b.maxZ) {
          // small ledges are stepped onto instead of stopping us dead
          const rise = b.maxY - this.y;
          if (rise > 0 && rise <= MOVE.stepUp && (this.onGround || this.state === 'ground') && !this.overlaps(this.x, b.maxY + 0.001, this.z)) {
            this.y = b.maxY;
            continue;
          }
          if (axis === 'x') {
            if (v > 0) this.x = b.minX - hw;
            else this.x = b.maxX + hw;
            this.vx = 0;
          } else {
            if (v > 0) this.z = b.minZ - hw;
            else this.z = b.maxZ + hw;
            this.vz = 0;
          }
        }
      }
    }
    // vertical
    this.y += this.vy * dt;
    let grounded = false;
    let gb: Box | null = null;
    for (const b of this.boxes) {
      if (b.ghost || b.hazard) continue;
      if (this.x + hw > b.minX && this.x - hw < b.maxX && this.y + this.height > b.minY && this.y < b.maxY && this.z + hw > b.minZ && this.z - hw < b.maxZ) {
        if (this.vy <= 0) {
          this.y = b.maxY;
          this.vy = 0;
          grounded = true;
          gb = b;
        } else {
          this.y = b.minY - this.height;
          this.vy = 0;
        }
      }
    }
    // ground probe so standing still keeps us grounded
    if (!grounded && this.vy <= 0) {
      for (const b of this.boxes) {
        if (b.ghost || b.hazard) continue;
        if (this.x + hw > b.minX && this.x - hw < b.maxX && this.z + hw > b.minZ && this.z - hw < b.maxZ && Math.abs(this.y - b.maxY) < 0.02) {
          grounded = true;
          gb = b;
          break;
        }
      }
    }
    this.onGround = grounded;
    this.groundBox = grounded ? gb : null;
    if (grounded) this.airCap = 0;
    else if (this.airCap === 0) this.airCap = Math.max(this.speed, MOVE.runSpeed);
    if (this.hazardTouch()) ev.hitHazard = true;
    void this.lastWallBox;
  }
}
