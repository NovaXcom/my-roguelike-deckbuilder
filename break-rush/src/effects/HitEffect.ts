import Phaser from 'phaser';

/** Particle burst using a real emitter (additive sparks, gravity, shrinking). */
export function burst(scene: Phaser.Scene, x: number, y: number, color: number, count = 10, power = 120): void {
  const em = scene.add.particles(x, y, 'spark', {
    speed: { min: power * 0.3, max: power * 1.6 },
    angle: { min: 0, max: 360 },
    lifespan: { min: 250, max: 550 },
    scale: { start: 1.2, end: 0 },
    gravityY: 350,
    tint: color,
    blendMode: 'ADD',
    emitting: false,
  });
  em.setDepth(40);
  em.explode(count);
  scene.time.delayedCall(700, () => em.destroy());
}

export function deathEffect(scene: Phaser.Scene, x: number, y: number): void {
  burst(scene, x, y, 0xff5566, 26, 200);
  burst(scene, x, y, 0xffffff, 8, 120);
  ring(scene, x, y, 0xff5566, 70);
}

/** Expanding shockwave ring. */
export function ring(scene: Phaser.Scene, x: number, y: number, color: number, radius = 60): void {
  const c = scene.add.circle(x, y, 10).setStrokeStyle(4, color, 1).setDepth(35);
  scene.tweens.add({
    targets: c,
    scale: radius / 10,
    alpha: 0,
    duration: 280,
    ease: 'Cubic.easeOut',
    onComplete: () => c.destroy(),
  });
}

/** Short bright slash line across the impact point. */
export function slashFx(scene: Phaser.Scene, x: number, y: number, color: number, length = 70): void {
  const l = scene.add.rectangle(x, y, length, 4, color).setDepth(41).setAngle(Phaser.Math.Between(-60, 60));
  scene.tweens.add({ targets: l, scaleX: 1.8, scaleY: 0.2, alpha: 0, duration: 120, onComplete: () => l.destroy() });
}

/** Fading ghost rectangle used for dodge / RUSH trails. */
export function afterImage(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color: number): void {
  const g = scene.add.rectangle(x, y, w, h, color, 0.45).setDepth(20);
  scene.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
}

/** Camera punch-in that eases back. */
export function punchZoom(scene: Phaser.Scene, amount = 0.06, ms = 220): void {
  const cam = scene.cameras.main;
  scene.tweens.killTweensOf(cam);
  cam.setZoom(1 + amount);
  scene.tweens.add({ targets: cam, zoom: 1, duration: ms, ease: 'Cubic.easeOut' });
}

/** Small puff at the feet (landing, dodge, running). */
export function dust(scene: Phaser.Scene, x: number, y: number, count = 5): void {
  const em = scene.add.particles(x, y, 'spark', {
    speed: { min: 20, max: 90 },
    angle: { min: 195, max: 345 },
    lifespan: { min: 220, max: 420 },
    scale: { start: 0.9, end: 0 },
    alpha: { start: 0.6, end: 0 },
    tint: 0xb8b0d0,
    emitting: false,
  });
  em.setDepth(15);
  em.explode(count);
  scene.time.delayedCall(500, () => em.destroy());
}

/** Sparks thrown in a cone along `facing` (the direction the hit travels). */
export function directionalBurst(scene: Phaser.Scene, x: number, y: number, color: number, count: number, power: number, facing: 1 | -1): void {
  const em = scene.add.particles(x, y, 'spark', {
    speed: { min: power * 0.5, max: power * 1.8 },
    angle: facing === 1 ? { min: -55, max: 55 } : { min: 125, max: 235 },
    lifespan: { min: 180, max: 420 },
    scale: { start: 1.3, end: 0 },
    gravityY: 300,
    tint: color,
    blendMode: 'ADD',
    emitting: false,
  });
  em.setDepth(42);
  em.explode(count);
  scene.time.delayedCall(500, () => em.destroy());
}

/**
 * Crescent slash drawn for one attack. step 0 sweeps down, step 1 sweeps back up,
 * step 2 (finisher) is a wide double ring.
 */
export function slashArc(scene: Phaser.Scene, x: number, y: number, facing: 1 | -1, radius: number, step: number, color: number): void {
  const g = scene.add.graphics({ x, y }).setDepth(44);
  g.setScale(facing, 1);
  const rad = Phaser.Math.DegToRad;
  const draw = (r: number, w: number, c: number, a0: number, a1: number, anti: boolean, alpha: number) => {
    g.lineStyle(w, c, alpha);
    g.beginPath();
    g.arc(0, 0, r, rad(a0), rad(a1), anti);
    g.strokePath();
  };
  if (step === 0) {
    draw(radius, 12, color, -75, 55, false, 0.9);
    draw(radius - 8, 4, 0xffffff, -70, 50, false, 1);
  } else if (step === 1) {
    draw(radius, 12, color, 65, -60, true, 0.9);
    draw(radius - 8, 4, 0xffffff, 60, -55, true, 1);
  } else {
    draw(radius, 18, color, -115, 115, false, 0.9);
    draw(radius * 0.72, 8, 0xffffff, -100, 100, false, 1);
  }
  scene.tweens.add({
    targets: g,
    alpha: 0,
    scaleX: facing * (step === 2 ? 1.35 : 1.18),
    scaleY: step === 2 ? 1.35 : 1.1,
    duration: step === 2 ? 240 : 150,
    ease: 'Cubic.easeOut',
    onComplete: () => g.destroy(),
  });
}
