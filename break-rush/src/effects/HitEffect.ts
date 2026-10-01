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
