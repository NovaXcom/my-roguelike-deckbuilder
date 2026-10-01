import { Controller, MoveInput } from '../physics/Controller';
import { MOVE } from '../physics/config';
import { Waypoint } from '../level/Generator';

/**
 * Follows a level's intended route. Used by the tests (to prove generated courses are completable) and by
 * the headless smoke tests. It is deliberately a simple, human-like player: it never does anything the
 * route does not call for.
 */
export class AutoPilot {
  index = 0;
  private jumpedForWp = -1;
  private dashedForWp = -1;
  private walljumpDone = -1;
  private afterWallJump = false;
  private lastJumpHeld = false;
  constructor(private route: Waypoint[]) {}

  get done(): boolean {
    return this.index >= this.route.length;
  }

  input(c: Controller): MoveInput {
    const inp: MoveInput = { moveX: 0, moveZ: 0, jumpPressed: false, jumpHeld: false, slideHeld: false, dashPressed: false };
    // skip waypoints we've already passed on the path
    while (this.index < this.route.length - 1) {
      const w = this.route[this.index];
      const passed = w.act === 'run' && c.x > w.x - 0.3;
      if (!passed) break;
      this.index++;
    }
    const w = this.route[this.index];
    if (!w) return inp;
    // previous action waypoint keeps influencing us until we pass the next one
    const prev = this.index > 0 ? this.route[this.index - 1] : null;
    if (prev && prev.act === 'slide' && c.x < w.x - 0.2) inp.slideHeld = true;
    if (prev && prev.act === 'slide') inp.slideHeld = c.x < w.x;

    // jump points only trigger the jump; we steer toward whatever comes after them
    const steer = (w.act === 'jump' || w.act === 'jumpdash') && this.route[this.index + 1] ? this.route[this.index + 1] : w;
    let dx = steer.x - c.x;
    let dz = steer.z - c.z;
    // after wallrun begins, keep pressing into the wall until the wall jump
    const hw = MOVE.halfWidth;
    switch (w.act) {
      case 'run':
        break;
      case 'jump':
      case 'jumpdash':
        if (c.onGround && c.x + hw >= w.x - 0.05 && this.jumpedForWp !== this.index) {
          this.jumpedForWp = this.index;
          inp.jumpPressed = true;
        }
        if (this.jumpedForWp === this.index) {
          inp.jumpHeld = c.vy > 0;
          if (w.act === 'jumpdash' && this.dashedForWp !== this.index && !c.onGround && c.vy < 1.5 && c.state === 'air') {
            this.dashedForWp = this.index;
            inp.dashPressed = true;
          }
          if (c.onGround && c.vy <= 0 && c.x > w.x + 1) this.index++;
        }
        break;
      case 'slide':
        if (c.x + hw >= w.x) {
          inp.slideHeld = true;
          if (c.x >= (this.route[this.index + 1]?.x ?? w.x)) this.index++;
        }
        break;
      case 'wallrun': {
        // like a human: jump off the edge toward the wall
        if (c.onGround && c.x + hw >= w.x - 0.05 && this.jumpedForWp !== this.index) {
          this.jumpedForWp = this.index;
          inp.jumpPressed = true;
        }
        if (this.jumpedForWp === this.index) {
          inp.jumpHeld = true;
          if (c.state === 'wallrun') this.index++;
        }
        dz = 1;
        break;
      }
      case 'walljump': {
        dz = 1;
        if (c.state === 'wallrun' && c.x >= w.x && this.walljumpDone !== this.index) {
          this.walljumpDone = this.index;
          this.afterWallJump = true;
          inp.jumpPressed = true;
          this.index++;
        } else if (c.state !== 'wallrun' && c.onGround) {
          this.index++;
        }
        inp.jumpHeld = true;
        break;
      }
    }
    // after a wall jump, steer back toward the next waypoint (away from the wall)
    if (c.onGround) this.afterWallJump = false;
    if (this.afterWallJump) {
      const n = this.route[this.index];
      dx = n.x - c.x;
      dz = n.z - c.z;
    }
    const l = Math.hypot(dx, dz) || 1;
    inp.moveX = dx / l;
    inp.moveZ = dz / l;
    // be gentle sideways so we don't snake: hold straight when almost aligned
    if (Math.abs(dz) < 0.25 && w.act !== 'wallrun' && w.act !== 'walljump') {
      inp.moveX = 1;
      inp.moveZ = 0;
    }
    this.lastJumpHeld = inp.jumpHeld;
    return inp;
  }
}
