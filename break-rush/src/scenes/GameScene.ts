import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, GROUND_Y, PLAYER, WORLD_WIDTH, GRUNT } from '../config';
import { Player } from '../player/Player';
import { HUD } from '../ui/HUD';
import { EnemySpawner } from '../systems/EnemySpawner';
import { rectsOverlap } from '../combat/DamageSystem';
import { spawnDamageNumber } from '../effects/DamageNumber';
import { burst, deathEffect } from '../effects/HitEffect';

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private hud!: HUD;
  private spawner!: EnemySpawner;
  private gameOverShown = false;

  constructor() {
    super('Game');
  }

  create(): void {
    this.gameOverShown = false;
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, GAME_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, GAME_HEIGHT);
    this.cameras.main.setBackgroundColor(0x12121f);

    // Ground (static physics body)
    this.add.tileSprite(WORLD_WIDTH / 2, GROUND_Y + (GAME_HEIGHT - GROUND_Y) / 2, WORLD_WIDTH, GAME_HEIGHT - GROUND_Y, 'ground');
    const ground = this.add.rectangle(WORLD_WIDTH / 2, GROUND_Y + 30, WORLD_WIDTH, 60, 0x000000, 0);
    this.physics.add.existing(ground, true);

    this.player = new Player(this, 300, GROUND_Y - 60);
    this.spawner = new EnemySpawner(this, this.player);
    this.hud = new HUD(this, this.player);

    this.physics.add.collider(this.player, ground);
    this.physics.add.collider(this.spawner.group, ground);

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.add
      .text(GAME_WIDTH / 2, 20, 'A/D or ←/→: Move   Space: Jump   J: Attack', { fontFamily: 'monospace', fontSize: '14px', color: '#aab' })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(100);
  }

  update(): void {
    this.player.update();
    this.spawner.update();
    const now = this.time.now;

    for (const e of this.spawner.enemies) {
      if (!e.active || e.dead) continue;
      e.tick(this.player);

      // Player attack -> enemy
      if (this.player.attacking && !this.player.attack.hitIds.has(e)) {
        const b = e.body as Phaser.Physics.Arcade.Body;
        if (rectsOverlap(this.player.hitbox, { x: b.x, y: b.y, w: b.width, h: b.height })) {
          this.player.attack.hitIds.add(e);
          const dealt = e.takeHit(PLAYER.attackDamage, this.player.facing * GRUNT.knockback);
          spawnDamageNumber(this, e.x, e.y - 30, dealt, '#ffee88');
          burst(this, e.x, e.y, 0xffee88, 6, 60);
          if (e.dead) {
            deathEffect(this, e.x, e.y);
            e.destroy();
            continue;
          }
        }
      }

      // Enemy contact -> player
      if (now >= e.nextContactAt && this.physics.overlap(this.player, e)) {
        if (this.player.takeDamage(e.contactDamage, e.x)) {
          e.nextContactAt = now + e.contactCooldown;
          spawnDamageNumber(this, this.player.x, this.player.y - 40, e.contactDamage, '#ff6666');
          this.cameras.main.shake(100, 0.004);
        }
      }
    }

    this.hud.update();

    if (this.player.dead && !this.gameOverShown) this.showGameOver();
  }

  private showGameOver(): void {
    this.gameOverShown = true;
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, 'GAME OVER', { fontFamily: 'monospace', fontSize: '64px', fontStyle: 'bold', color: '#ff4466', stroke: '#000', strokeThickness: 8 })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, 'Press R to restart', { fontFamily: 'monospace', fontSize: '20px', color: '#fff' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200);
    this.input.keyboard!.once('keydown-R', () => this.scene.restart());
  }
}
