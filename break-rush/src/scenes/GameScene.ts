import Phaser from 'phaser';
import { ATTACK_STEPS, BOSS, DODGE, ENEMY_STATS, GAME_HEIGHT, GAME_WIDTH, GROUND_Y, RUSH } from '../config';
import { Player } from '../player/Player';
import { RpgHud } from '../ui/RpgHud';
import { ComboDisplay } from '../ui/ComboDisplay';
import { EnemyBars } from '../ui/EnemyBars';
import { RushMarker } from '../ui/RushMarker';
import { BossBar } from '../ui/BossBar';
import { EnemySpawner } from '../systems/EnemySpawner';
import { Enemy } from '../enemies/Enemy';
import { IronBeast } from '../enemies/IronBeast';
import { MeleeEnemy } from '../enemies/MeleeEnemy';
import { calcDamage, rectsOverlap } from '../combat/DamageSystem';
import { ComboSystem, milestoneCrossed } from '../combat/ComboSystem';
import { MassKillTracker } from '../combat/MassKill';
import { SlowMo } from '../combat/SlowMo';
import { HitStop } from '../combat/HitStop';
import { RushSystem, pickNearest } from '../combat/RushSystem';
import { POINTS, ScoreSystem } from '../systems/ScoreSystem';
import { BASE_MAX_HP, RunState, RunSummary, newRun } from '../systems/RunState';
import { DIFFICULTIES, DifficultyDef } from '../systems/Difficulty';
import { SaveData, loadSave, recordRun, writeSave } from '../systems/SaveSystem';
import { evaluateUnlocks, unlockedUpgrades } from '../systems/Unlocks';
import { BASE_UPGRADE_IDS, PlayerStats, UPGRADES, UpgradeId, activeSynergies, completesSynergy, rollChoices, statsFrom } from '../systems/UpgradeSystem';
import { RELICS, RelicId, applyRelics, hasRelic, rollRelics } from '../systems/Relics';
import { LevelState, addXp, xpToNext } from '../systems/Leveling';
import { Drop, EnemyTier, crateDrops, dropsFor } from '../systems/Loot';
import { PickupManager } from '../systems/Pickups';
import { Crate, Station } from '../systems/Props';
import { Cooldown, ULT_GAIN, UltGauge } from '../systems/Skills';
import { ROOM_INFO, ROOMS_PER_ZONE, RoomType, ZONES, depthMods, doorChoices, isBossRoom, isFinalBoss, nextProgress, roomsClearedBefore } from '../systems/RunMap';
import { RoomPlan, SpawnGroup, encounterRegion, planRoom } from '../systems/RoomPlan';
import { shardsEarned } from '../systems/Meta';
import { audio, SfxName } from '../audio/AudioSystem';
import { spawnDamageNumber } from '../effects/DamageNumber';
import { burst, deathEffect, directionalBurst, dust, lightning, punchZoom, ring, shockwave, slashArc, slashFx } from '../effects/HitEffect';
import { ChoiceData, ChoiceOption } from './ChoiceScene';

interface HitOptions {
  baseDamage: number;
  breakDamage: number;
  knockback: number;
  hitStopMs: number;
  shake: number;
  counter?: boolean;
  rush?: boolean;
  /** Chain step (0-2) for light/heavy distinction; 99 = cannot be blocked. */
  step?: number;
  /** Heavy launch: spins the enemy into the air with a screen flash. */
  launch?: boolean;
  /** Part of the ultimate: does not charge it. */
  ultHit?: boolean;
  color: number;
  sfx: SfxName;
}

interface Missile {
  obj: Phaser.GameObjects.Rectangle;
  vx: number;
  vy: number;
  expireAt: number;
}

/** explore: walking/fodder, locked: screen-locked fight, cleared: portal open, busy: transitions, over: run ended. */
type RoomState = 'explore' | 'locked' | 'cleared' | 'busy' | 'over';

const BOSS_NAMES = ['IRON BEAST', 'IRON BEAST MK-II', 'OMEGA BEAST'];
const ZONE_TINT = [
  { sky: 0xffffff, far: 0xffffff, near: 0xffffff, name: 'NEON CITY' },
  { sky: 0x88ffd0, far: 0xaaffdd, near: 0x99ffcc, name: 'TOXIC FACTORY' },
  { sky: 0xff8899, far: 0xffaaaa, near: 0xff99aa, name: 'CRIMSON VOID' },
];
const BOSS_TRIGGER_X = 480;
const LEVEL_HP = 3;
const LEVEL_DMG = 0.02;

export class GameScene extends Phaser.Scene {
  private run!: RunState;
  private stats!: PlayerStats;
  private diff!: DifficultyDef;
  private save!: SaveData;
  private plan!: RoomPlan;
  private hpMult = 1;
  private dmgMult = 1;
  private player!: Player;
  private hud!: RpgHud;
  private comboDisplay!: ComboDisplay;
  private enemyBars!: EnemyBars;
  private rushMarker!: RushMarker;
  private bossBar!: BossBar;
  private shadows!: Phaser.GameObjects.Graphics;
  private bgFar!: Phaser.GameObjects.TileSprite;
  private bgNear!: Phaser.GameObjects.TileSprite;
  private goArrow!: Phaser.GameObjects.Text;
  private portal!: Phaser.GameObjects.Image;
  private portalHint!: Phaser.GameObjects.Text;
  private spawner!: EnemySpawner;
  private pickups!: PickupManager;
  private crates: Crate[] = [];
  private station: Station | null = null;
  private combo = new ComboSystem();
  private score = new ScoreSystem();
  private hitStop = new HitStop();
  private rush = new RushSystem<Enemy>();
  private slowmo = new SlowMo();
  private kills = new MassKillTracker();
  private skillCd = new Cooldown(4500);
  private ult = new UltGauge();
  private levelState: LevelState = { level: 1, xp: 0 };
  private missiles: Missile[] = [];
  private boss: IronBeast | null = null;
  private bossEnraged = false;
  private state: RoomState = 'explore';
  private nextEncounter = 0;
  private skillHit = new Set<unknown>();
  private ultActive = false;
  private pendingLevelUps = 0;
  private pendingRelicReward = false;
  private overlayOpen = false;
  private roomKills = 0;
  private explosionDepth = 0;
  private shopStock: Array<{ id: string; cost: number; sold: boolean }> = [];
  private physicsFrozen = false;
  private timeScale = 1;
  private runEnded = false;

  constructor() {
    super('Game');
  }

  init(data: { run?: RunState }): void {
    this.run = data?.run ?? this.devRun();
  }

  /** Builds a run from URL params so a specific room can be loaded directly while testing. */
  private devRun(): RunState {
    const q = new URLSearchParams(location.search);
    const save = loadSave();
    const run = newRun(save.difficulty, save.meta);
    const type = q.get('start') as RoomType | null;
    const zone = Number(q.get('zone') ?? 1) || 1;
    if (type === 'boss') run.progress = { zone, room: ROOMS_PER_ZONE - 1 };
    else if (zone > 1 || (type && type !== 'combat')) run.progress = { zone, room: type ? 1 : 0 };
    if (type && ['combat', 'elite', 'treasure', 'rest', 'shop', 'boss'].includes(type)) run.roomType = type;
    if (q.has('gold')) run.gold = Number(q.get('gold'));
    if (q.has('level')) {
      run.level = Number(q.get('level'));
      run.hp = BASE_MAX_HP + run.meta.maxHp + LEVEL_HP * (run.level - 1);
    }
    return run;
  }

  // ---- Setup ------------------------------------------------------------

  create(): void {
    this.save = loadSave();
    this.diff = DIFFICULTIES[this.run.difficulty];
    this.levelState = { level: this.run.level, xp: this.run.xp };
    this.combo = new ComboSystem();
    this.score = new ScoreSystem(this.diff.scoreMult);
    this.hitStop = new HitStop();
    this.rush = new RushSystem<Enemy>();
    this.slowmo = new SlowMo();
    this.kills = new MassKillTracker();
    this.skillCd = new Cooldown(4500);
    this.ult = new UltGauge(this.run.ult);
    this.missiles = [];
    this.crates = [];
    this.station = null;
    this.boss = null;
    this.bossEnraged = false;
    this.nextEncounter = 0;
    this.ultActive = false;
    this.pendingLevelUps = 0;
    this.pendingRelicReward = false;
    this.overlayOpen = false;
    this.roomKills = 0;
    this.physicsFrozen = false;
    this.timeScale = 1;
    this.runEnded = false;
    this.physics.world.timeScale = 1;
    this.tweens.timeScale = 1;

    const { progress } = this.run;
    const mods = depthMods(progress);
    this.hpMult = this.diff.enemyHpMult * mods.hp;
    this.dmgMult = this.diff.enemyDmgMult * mods.dmg;
    this.plan = planRoom(this.run.roomType, roomsClearedBefore(progress), Math.random);
    this.refreshStats();

    const len = this.plan.length;
    this.physics.world.setBounds(0, 0, len, GAME_HEIGHT);
    this.cameras.main.setBounds(0, 0, len, GAME_HEIGHT);
    this.cameras.main.setBackgroundColor(0x0b0820);
    this.buildBackdrop(len);

    const ground = this.add.rectangle(len / 2, GROUND_Y + 30, len, 60, 0x000000, 0);
    this.physics.add.existing(ground, true);

    this.player = new Player(this, this.plan.start, GROUND_Y - 60);
    this.player.stats = this.stats;
    this.player.maxHp = this.maxHp();
    this.player.hp = Math.min(this.run.hp, this.player.maxHp);
    this.player.clampX = { min: 20, max: len - 20 };
    this.spawner = new EnemySpawner(this);
    this.spawner.onSpawn = (e) => this.wireEnemy(e);
    this.player.targets = () => this.spawner.enemies.filter((e) => e.active && !e.dead);
    this.pickups = new PickupManager(
      this,
      () => ({ x: this.player.x, y: this.player.y }),
      (d) => this.onCollect(d),
      () => this.player.hp < this.player.maxHp,
    );

    this.physics.add.collider(this.player, ground);
    this.physics.add.collider(this.spawner.group, ground);
    // Look ahead to the right so you can see what's coming
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1, -140, 20);

    this.buildRoomContents();

    this.hud = new RpgHud(this);
    this.comboDisplay = new ComboDisplay(this, 78);
    this.enemyBars = new EnemyBars(this);
    this.rushMarker = new RushMarker(this);
    this.bossBar = new BossBar(this, BOSS_NAMES[Math.min(progress.zone, ZONES) - 1]);
    this.goArrow = this.add
      .text(GAME_WIDTH - 40, GAME_HEIGHT / 2 - 40, 'GO ▶', { fontFamily: 'monospace', fontSize: '34px', fontStyle: 'bold', color: '#ffffff', stroke: '#000', strokeThickness: 6 })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(110)
      .setVisible(false);

    // Browsers only allow audio after a user gesture: unlock on input.
    const unlock = () => audio.unlock();
    this.input.keyboard!.on('keydown', unlock);
    this.input.on('pointerdown', unlock);
    this.input.keyboard!.on('keydown-M', () => {
      audio.muted = !audio.muted;
      this.save.settings.muted = audio.muted;
      writeSave(this.save);
      spawnDamageNumber(this, this.player.x, this.player.y - 70, audio.muted ? 'SOUND OFF' : 'SOUND ON', '#aab', 16);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', unlock);
      this.setTimeScale(1);
    });
    this.player.on('attack', (step: number, counter: boolean) => {
      audio.play('swing', counter ? 0.8 : 1 + step * 0.1);
      const f = this.player.facing;
      slashArc(this, this.player.x + f * 6, this.player.y - 2, f, ATTACK_STEPS[step].range * 0.78, step, counter ? 0xff8844 : step === ATTACK_STEPS.length - 1 ? 0xffffff : 0xffee88);
    });

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 8, 'A/D Move  Space Jump  J Attack  L Skill  I Ultimate  Shift Dodge  E Interact', { fontFamily: 'monospace', fontSize: '12px', color: '#7f7ba8' })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(100);

    this.state = this.plan.encounters.length === 0 && this.run.roomType !== 'boss' ? 'cleared' : 'explore';
    if (this.state === 'cleared') this.openPortal(false);
    const z = Math.min(progress.zone, ZONES);
    this.banner(`${z}-${progress.room + 1}  ${ROOM_INFO[this.run.roomType].name}`, this.run.roomType === 'elite' ? '#ff9933' : this.run.roomType === 'boss' ? '#ff3344' : '#44ffee', 1400);
  }

  private buildBackdrop(len: number): void {
    const t = ZONE_TINT[Math.min(this.run.progress.zone, ZONES) - 1];
    this.add.image(0, 0, 'bg_sky').setOrigin(0, 0).setScrollFactor(0).setDepth(-30).setTint(t.sky);
    this.bgFar = this.add.tileSprite(0, GROUND_Y, GAME_WIDTH, 300, 'bg_far').setOrigin(0, 1).setScrollFactor(0).setDepth(-20).setTint(t.far);
    this.bgNear = this.add.tileSprite(0, GROUND_Y, GAME_WIDTH, 340, 'bg_near').setOrigin(0, 1).setScrollFactor(0).setDepth(-10).setTint(t.near);
    this.add
      .particles(0, 0, 'spark', {
        x: { min: 0, max: GAME_WIDTH },
        y: { min: 120, max: GROUND_Y },
        lifespan: 4500,
        speedY: { min: -14, max: -4 },
        speedX: { min: -8, max: 8 },
        scale: { start: 0.7, end: 0 },
        alpha: { start: 0.6, end: 0 },
        tint: [0xff7acb, 0x7af0ff, 0xffd27a],
        frequency: 180,
        blendMode: 'ADD',
      })
      .setScrollFactor(0)
      .setDepth(-5);
    this.add.tileSprite(len / 2, GROUND_Y + (GAME_HEIGHT - GROUND_Y) / 2, len, GAME_HEIGHT - GROUND_Y, 'ground').setDepth(-4);
    this.shadows = this.add.graphics().setDepth(-1);
  }

  private buildRoomContents(): void {
    const plan = this.plan;
    this.crates = plan.crates.map((x) => new Crate(this, x));
    if (plan.station) {
      this.station = new Station(this, plan.station.kind, plan.station.x);
      if (plan.station.kind === 'merchant') this.shopStock = this.makeShopStock();
    }
    // Weak mobs standing around between fights
    for (const f of plan.fodder) {
      this.spawner.spawnGroups(f.groups, (i) => f.x + (i - 3) * 38 + Phaser.Math.Between(-10, 10), { hpMult: this.hpMult, dmgMult: this.dmgMult, aggroRange: 560 });
    }
    // Exit portal at the end of every room
    this.portal = this.add.image(plan.exitX, GROUND_Y - 75, 'portal').setDepth(1).setAlpha(0.18);
    this.portalHint = this.add
      .text(plan.exitX, GROUND_Y - 170, 'NEXT ▶', { fontFamily: 'monospace', fontSize: '16px', fontStyle: 'bold', color: '#7af0ff', stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(60)
      .setVisible(false);
    this.tweens.add({ targets: this.portal, scaleX: 1.08, scaleY: 1.04, duration: 700, yoyo: true, repeat: -1 });
  }

  // ---- Stats ------------------------------------------------------------

  private refreshStats(): void {
    const st = applyRelics(statsFrom(this.run.owned), this.run.relics);
    st.damageMult *= this.run.meta.damageMult;
    st.xpMult *= this.run.meta.xpMult;
    this.stats = st;
    this.combo.windowBonusMs = st.comboBonusMs + this.diff.comboWindowDelta;
    if (this.player) {
      this.player.stats = st;
      this.player.maxHp = this.maxHp();
    }
  }

  private maxHp(): number {
    return BASE_MAX_HP + this.run.meta.maxHp + this.stats.maxHpBonus + LEVEL_HP * (this.levelState.level - 1);
  }

  // ---- Frame loop -------------------------------------------------------

  update(_time: number, delta: number): void {
    const now = this.time.now;
    this.setTimeScale(this.slowmo.scale(now));

    // Hit stop: freeze simulation. Key presses stay buffered (JustDown persists until read).
    if (this.hitStop.active(now)) {
      if (!this.physicsFrozen) {
        this.physics.world.pause();
        this.physicsFrozen = true;
      }
      this.updateUI(now);
      return;
    }
    if (this.physicsFrozen) {
      this.physics.world.resume();
      this.physicsFrozen = false;
    }
    if (this.runEnded) {
      this.updateUI(now);
      return;
    }
    if (this.state === 'explore' || this.state === 'locked') this.run.timeMs += delta;

    this.handleInput(now);
    this.player.update();

    for (const e of this.spawner.enemies) {
      if (!e.active || e.dead) continue;
      e.tick(this.player);

      if (this.player.attacking && !this.player.attack.hitIds.has(e)) {
        const b = e.body as Phaser.Physics.Arcade.Body;
        if (rectsOverlap(this.player.hitbox, { x: b.x, y: b.y, w: b.width, h: b.height })) {
          this.player.attack.hitIds.add(e);
          this.onPlayerAttackHit(e);
          if (!e.active) continue;
        }
      }
      if (this.player.skillDashing) this.skillStrike(e);

      // Telegraphed melee strikes: one chance to hurt the player per attack
      if (e instanceof MeleeEnemy && this.state !== 'over') {
        const box = e.attackBox;
        const pb = this.player.body as Phaser.Physics.Arcade.Body;
        if (box && rectsOverlap(box, { x: pb.x, y: pb.y, w: pb.width, h: pb.height })) {
          e.hitConnected = true;
          this.damagePlayer(e.attackDamage, e.x);
        }
      }
      // The boss still hurts on contact
      if (e.contactDamage > 0 && this.state !== 'over' && !e.disabled && now >= e.nextContactAt && this.physics.overlap(this.player, e)) {
        if (this.damagePlayer(Math.round(e.contactDamage * this.dmgMult), e.x)) e.nextContactAt = now + e.contactCooldown;
      }
    }

    this.breakCrates();
    this.updateMissiles(now, (delta / 1000) * this.timeScale);
    this.updateBossState();
    this.pickups.update((delta / 1000) * this.timeScale, now, 190 * this.stats.magnetMult);
    this.updateRoomFlow(now);
    this.updateOverlays();
    this.updateUI(now);
    if (this.player.dead && !this.runEnded) this.onPlayerDeath();
  }

  private handleInput(now: number): void {
    const p = this.player;
    if (p.dead || this.ultActive || this.state === 'busy' || this.state === 'over') return;
    if (!p.rushing && !p.skillDashing && p.dashPressed()) this.handleDash(now);
    if (!p.rushing && !p.skillDashing && p.skillPressed() && this.skillCd.ready(now)) this.castSkill(now);
    if (p.ultPressed() && this.ult.ready) this.castUltimate();
    if (p.interactPressed()) this.interact();
  }

  // ---- Room flow --------------------------------------------------------

  private updateRoomFlow(now: number): void {
    const p = this.player;
    if (this.state === 'explore') {
      if (this.run.roomType === 'boss') {
        if (!this.boss && p.x >= BOSS_TRIGGER_X) this.startBossFight();
      } else if (this.nextEncounter < this.plan.encounters.length && p.x >= this.plan.encounters[this.nextEncounter].x) {
        this.startEncounter(this.plan.encounters[this.nextEncounter]);
      }
    } else if (this.state === 'locked') {
      if (this.run.roomType !== 'boss' && this.spawner.encounterAlive() === 0) this.endEncounter();
    } else if (this.state === 'cleared') {
      if (!this.overlayOpen && this.pendingLevelUps === 0 && !this.pendingRelicReward && Math.abs(p.x - this.plan.exitX) < 55) this.leaveRoom();
    }

    // "GO" arrow whenever the way is open and nothing is nearby
    const nearby = this.spawner.enemies.some((e) => e.active && !e.dead && Math.abs(e.x - p.x) < 520);
    const open = (this.state === 'explore' || this.state === 'cleared') && !nearby && p.x < this.plan.exitX - 120;
    this.goArrow.setVisible(open && this.run.roomType !== 'boss').setX(GAME_WIDTH - 40 + Math.sin(now / 140) * 8);
    this.portalHint.setVisible(this.state === 'cleared').setY(GROUND_Y - 170 + Math.sin(now / 160) * 4);
  }

  private startEncounter(enc: RoomPlan['encounters'][number]): void {
    const region = encounterRegion(enc);
    const min = Math.max(0, region.min);
    const max = Math.min(this.plan.length, region.max);
    this.lockScreen(min, max);
    this.state = 'locked';
    this.nextEncounter++;
    this.banner(enc.label ?? 'FIGHT!', enc.label ? '#ff9933' : '#ff5566', 900);
    audio.play('horde');
    this.spawnWave(enc.spawns, min, max);
  }

  private lockScreen(min: number, max: number): void {
    this.player.clampX = { min: min + 20, max: max - 20 };
    this.cameras.main.setBounds(min, 0, max - min, GAME_HEIGHT);
  }

  private unlockScreen(): void {
    this.player.clampX = { min: 20, max: this.plan.length - 20 };
    this.cameras.main.setBounds(0, 0, this.plan.length, GAME_HEIGHT);
  }

  /** Enemies march in from both screen edges. */
  private spawnWave(groups: SpawnGroup[], min: number, max: number): void {
    const scaled = groups.map((g) => ({ ...g, count: Math.max(1, Math.round(g.count * this.diff.countMult)) }));
    this.spawner.spawnGroups(
      scaled,
      (i) => (i % 2 === 0 ? min + 70 + Math.floor(i / 2) * 36 : max - 70 - Math.floor(i / 2) * 36),
      { hpMult: this.hpMult, dmgMult: this.dmgMult, inEncounter: true },
    );
  }

  private endEncounter(): void {
    this.unlockScreen();
    if (this.nextEncounter >= this.plan.encounters.length) this.roomCleared();
    else {
      this.state = 'explore';
      this.banner('CLEAR!', '#7af0ff', 700);
      this.pickups.vacuum = true;
      this.time.delayedCall(1100, () => (this.pickups.vacuum = false));
    }
  }

  private startBossFight(): void {
    this.banner('WARNING', '#ff3344', 1400);
    audio.play('horde');
    this.lockScreen(0, this.plan.length);
    this.state = 'locked';
    this.boss = new IronBeast(this, this.plan.length - 260, GROUND_Y - 55, (1 + 0.7 * (this.run.progress.zone - 1)) * this.diff.enemyHpMult);
    this.spawner.add(this.boss);
    this.wireBoss(this.boss);
  }

  private roomCleared(): void {
    this.state = 'cleared';
    this.banner('ROOM CLEAR!', '#ffdd44', 1300);
    audio.play('milestone');
    const bonus = Math.round(10 * (1 + 0.35 * (this.run.progress.zone - 1)) * this.stats.goldMult);
    this.run.gold += bonus;
    spawnDamageNumber(this, this.player.x, this.player.y - 70, `+${bonus} G`, '#ffd633', 22);
    // Suck every loose pickup to the player
    this.pickups.vacuum = true;
    this.time.delayedCall(2500, () => (this.pickups.vacuum = false));
    this.openPortal(true);
    if (this.run.roomType === 'elite' || this.run.roomType === 'boss') this.pendingRelicReward = true;
  }

  private openPortal(fanfare: boolean): void {
    this.tweens.add({ targets: this.portal, alpha: 0.95, duration: 500 });
    if (fanfare) ring(this, this.plan.exitX, GROUND_Y - 70, 0x7af0ff, 120);
  }

  /** Walks into the portal: save run state, then pick the next room (or end the run). */
  private leaveRoom(): void {
    this.state = 'busy';
    this.syncRun();
    const { progress } = this.run;
    if (isFinalBoss(progress)) {
      this.endRun(true);
      return;
    }
    if (isBossRoom(progress)) {
      // Zone cleared: a breather and a stronger foe in the next zone
      this.run.progress = nextProgress(progress);
      this.run.roomType = 'combat';
      this.run.hp = Math.min(this.maxHp(), this.run.hp + Math.round(this.maxHp() * 0.35));
      this.banner('ZONE CLEAR!', '#ffdd44', 1200);
      this.time.delayedCall(1100, () => this.scene.restart({ run: this.run }));
      return;
    }
    const opts = doorChoices(progress, Math.random);
    if (opts.length === 1) {
      this.run.progress = nextProgress(progress);
      this.run.roomType = opts[0];
      this.banner('BOSS AHEAD', '#ff3344', 900);
      this.time.delayedCall(800, () => this.scene.restart({ run: this.run }));
      return;
    }
    const left = ROOMS_PER_ZONE - 1 - (progress.room + 1);
    this.openChoice(
      {
        title: 'CHOOSE YOUR PATH',
        subtitle: `${left} room${left === 1 ? '' : 's'} until the boss`,
        event: 'door-picked',
        options: opts.map((t) => ({
          id: t,
          name: ROOM_INFO[t].name,
          desc: ROOM_INFO[t].desc,
          color: t === 'elite' ? 0xff9933 : t === 'combat' ? 0xff5566 : t === 'shop' ? 0xffd633 : t === 'rest' ? 0x44dd88 : 0xb06cff,
        })),
      },
      (id) => {
        this.run.progress = nextProgress(progress);
        this.run.roomType = id as RoomType;
        this.scene.restart({ run: this.run });
      },
    );
  }

  /** Copies live state back into the run so it survives the room change. */
  private syncRun(): void {
    const r = this.run;
    r.hp = this.player.hp;
    r.level = this.levelState.level;
    r.xp = this.levelState.xp;
    r.ult = this.ult.value;
    r.maxCombo = Math.max(r.maxCombo, this.combo.max);
    r.score += this.score.total;
    this.score = new ScoreSystem(this.diff.scoreMult);
  }

  // ---- Overlays (level-ups, relics, shop...) ---------------------------

  private updateOverlays(): void {
    if (this.overlayOpen || this.ultActive || this.runEnded || this.state === 'busy' || this.state === 'over') return;
    if (this.pendingLevelUps > 0) {
      this.pendingLevelUps--;
      this.openPerkChoice('LEVEL UP!', `Level ${this.levelState.level}`);
    } else if (this.pendingRelicReward && this.state === 'cleared') {
      this.pendingRelicReward = false;
      this.openRelicChoice(this.run.roomType === 'boss' ? 'BOSS REWARD' : 'ELITE REWARD');
    }
  }

  /** Pauses the game and shows a card picker; `cb` runs after the game resumes. */
  private openChoice(data: ChoiceData, cb: (id: string) => void): void {
    this.overlayOpen = true;
    this.game.events.once(data.event, (id: string) => {
      this.overlayOpen = false;
      this.scene.resume();
      this.time.delayedCall(40, () => cb(id));
    });
    this.scene.launch('Choice', data);
    this.scene.pause();
  }

  private openPerkChoice(title: string, subtitle: string, onDone?: () => void): void {
    const pool = [...BASE_UPGRADE_IDS, ...unlockedUpgrades(this.save)];
    const choices = rollChoices(Math.random, 3, pool, this.run.lastOffered);
    this.run.lastOffered = choices;
    const options: ChoiceOption[] = choices.map((id) => {
      const owned = this.run.owned.filter((o) => o === id).length;
      const syn = completesSynergy(this.run.owned, id);
      return {
        id,
        name: UPGRADES[id].name,
        desc: UPGRADES[id].desc,
        tag: syn ? `★ SYNERGY: ${syn.name}\n${syn.desc}` : owned > 0 ? `owned x${owned}` : 'NEW',
        tagColor: syn ? '#ffdd44' : owned > 0 ? '#88ddff' : '#88ff88',
        color: 0x44aaff,
      };
    });
    audio.play('levelup');
    this.openChoice({ title, subtitle, options, event: 'perk-picked' }, (id) => {
      this.applyPerk(id as UpgradeId);
      onDone?.();
    });
  }

  private applyPerk(id: UpgradeId): void {
    this.run.owned.push(id);
    this.refreshStats();
    if (id === 'vitality') this.player.heal(20);
    spawnDamageNumber(this, this.player.x, this.player.y - 60, `${UPGRADES[id].name} UP!`, '#ffdd44', 24);
    const syn = activeSynergies(this.run.owned).find((s) => s.needs.includes(id) && s.needs.every((n) => this.run.owned.includes(n)));
    if (syn && completesSynergy(this.run.owned.slice(0, -1), id)?.id === syn.id) this.banner(`SYNERGY: ${syn.name}`, '#ffdd44', 1400);
  }

  private openRelicChoice(title: string, onDone?: () => void): void {
    const relics = rollRelics(Math.random, this.run.relics, 3);
    if (relics.length === 0) {
      this.run.gold += 100;
      spawnDamageNumber(this, this.player.x, this.player.y - 60, '+100 G', '#ffd633', 22);
      onDone?.();
      return;
    }
    audio.play('chest');
    this.openChoice(
      {
        title,
        subtitle: 'Choose a relic',
        event: 'relic-picked',
        titleColor: '#ff9933',
        options: relics.map((r) => ({ id: r, name: RELICS[r].name, desc: RELICS[r].desc, color: RELICS[r].color, tag: 'RELIC', tagColor: '#ff9933' })),
      },
      (id) => {
        this.applyRelic(id as RelicId);
        onDone?.();
      },
    );
  }

  private applyRelic(id: RelicId): void {
    this.run.relics.push(id);
    this.refreshStats();
    this.banner(RELICS[id].name, '#ff9933', 1300);
    ring(this, this.player.x, this.player.y, RELICS[id].color, 120);
  }

  // ---- Stations ---------------------------------------------------------

  private interact(): void {
    const st = this.station;
    if (!st || !st.near(this.player.x) || this.overlayOpen) return;
    if (st.kind === 'chest' && !st.used) {
      st.markUsed();
      burst(this, st.x, GROUND_Y - 30, 0xffd633, 24, 220);
      this.openRelicChoice('TREASURE');
    } else if (st.kind === 'campfire' && !st.used) {
      this.openChoice(
        {
          title: 'CAMPFIRE',
          subtitle: 'Warm your hands...',
          event: 'camp-picked',
          options: [
            { id: 'rest', name: 'REST', desc: `Recover 50% of your max HP`, color: 0x44dd88 },
            { id: 'train', name: 'TRAIN', desc: 'Pick a free perk', color: 0x44aaff },
          ],
        },
        (id) => {
          st.markUsed();
          if (id === 'rest') {
            const healed = this.player.heal(Math.round(this.maxHp() * 0.5));
            audio.play('heal');
            spawnDamageNumber(this, this.player.x, this.player.y - 60, `+${healed} HP`, '#44dd66', 24);
          } else this.openPerkChoice('TRAINING', 'Choose a perk');
        },
      );
    } else if (st.kind === 'merchant') this.openShop();
  }

  private makeShopStock(): Array<{ id: string; cost: number; sold: boolean }> {
    const z = 1 + 0.2 * (this.run.progress.zone - 1);
    return [
      { id: 'potion', cost: Math.round(40 * z), sold: false },
      { id: 'perk', cost: Math.round(75 * z), sold: false },
      { id: 'relic', cost: Math.round(140 * z), sold: false },
    ];
  }

  private openShop(): void {
    const names: Record<string, { name: string; desc: string; color: number }> = {
      potion: { name: 'HEALING DRAUGHT', desc: 'Recover 40% of your max HP', color: 0x44dd88 },
      perk: { name: 'RANDOM PERK', desc: 'A perk of the merchant\'s choosing', color: 0x44aaff },
      relic: { name: 'MYSTERY RELIC', desc: 'A random relic you do not own', color: 0xff9933 },
    };
    const relicsLeft = rollRelics(Math.random, this.run.relics, 1).length > 0;
    const options: ChoiceOption[] = this.shopStock.map((s) => ({
      id: s.id,
      name: names[s.id].name,
      desc: s.sold ? 'SOLD OUT' : names[s.id].desc,
      cost: s.cost,
      color: names[s.id].color,
      disabled: s.sold || this.run.gold < s.cost || (s.id === 'relic' && !relicsLeft),
    }));
    options.push({ id: 'leave', name: 'LEAVE', desc: 'Done shopping', color: 0x777799 });
    this.openChoice({ title: 'MERCHANT', subtitle: `You have ${this.run.gold} G`, options, event: 'shop-picked', escapeId: 'leave' }, (id) => {
      if (id === 'leave') return;
      const item = this.shopStock.find((s) => s.id === id)!;
      this.run.gold -= item.cost;
      item.sold = true;
      if (id === 'potion') {
        this.player.heal(Math.round(this.maxHp() * 0.4));
        audio.play('heal');
      } else if (id === 'perk') {
        const pool = [...BASE_UPGRADE_IDS, ...unlockedUpgrades(this.save)];
        this.applyPerk(rollChoices(Math.random, 1, pool)[0]);
      } else {
        const r = rollRelics(Math.random, this.run.relics, 1)[0];
        if (r) this.applyRelic(r);
      }
      this.time.delayedCall(250, () => this.openShop());
    });
  }

  // ---- Skills -----------------------------------------------------------

  private castSkill(now: number): void {
    const p = this.player;
    const target = pickNearest(p, this.spawner.enemies.filter((e) => e.active && !e.dead), 480);
    const dir: 1 | -1 = target ? (target.x >= p.x ? 1 : -1) : p.facing;
    this.skillCd.use(now, this.stats.cooldownMult);
    this.skillHit.clear();
    audio.play('skill');
    p.startSkillDash(dir, 250);
    dust(this, p.x, p.y + 24, 8);
  }

  /** While RUSH SLASH is active, anything the player touches is cut. */
  private skillStrike(e: Enemy): void {
    if (this.skillHit.has(e)) return;
    const pb = this.player.body as Phaser.Physics.Arcade.Body;
    const eb = e.body as Phaser.Physics.Arcade.Body;
    if (!rectsOverlap({ x: pb.x - 24, y: pb.y - 10, w: pb.width + 48, h: pb.height + 20 }, { x: eb.x, y: eb.y, w: eb.width, h: eb.height })) return;
    this.skillHit.add(e);
    this.hitEnemy(e, { baseDamage: 36, breakDamage: 26, knockback: 440, hitStopMs: 45, shake: 0.006, launch: true, step: 99, color: 0x7affff, sfx: 'hitHeavy' });
  }

  private castUltimate(): void {
    if (!this.ult.consume()) return;
    const now = this.time.now;
    const p = this.player;
    this.ultActive = true;
    p.grantInvuln(3200);
    audio.play('ult');
    this.hitStop.trigger(now, 500);
    punchZoom(this, 0.14, 1000);

    const dark = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000010, 0.6).setScrollFactor(0).setDepth(90);
    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, 'OVER BREAK', { fontFamily: 'monospace', fontSize: '84px', fontStyle: 'bold', color: '#ffe066', stroke: '#ff2266', strokeThickness: 10 })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(121)
      .setScale(0.3);
    this.tweens.add({ targets: title, scale: 1.1, duration: 280, ease: 'Back.easeOut' });

    this.time.delayedCall(520, () => {
      this.cameras.main.flash(120, 255, 255, 255);
      const view = this.cameras.main.worldView;
      const targets = this.spawner.enemies
        .filter((e) => e.active && !e.dead && e.x > view.x - 60 && e.x < view.right + 60)
        .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))
        .slice(0, 16);
      targets.forEach((e, i) => {
        this.time.delayedCall(i * 75, () => {
          if (!e.active || e.dead) return;
          lightning(this, p.x, p.y - 40, e.x, e.y - 10, 0xffe066);
          this.hitEnemy(e, { baseDamage: 80, breakDamage: 70, knockback: 620, hitStopMs: 30, shake: 0.008, launch: true, ultHit: true, step: 99, color: 0xffe066, sfx: 'hitHeavy' });
          slashFx(this, e.x, e.y, 0xffffff, 120);
        });
      });
      this.time.delayedCall(targets.length * 75 + 350, () => {
        shockwave(this, p.x, p.y, 380, 0xffe066);
        audio.play('boom');
        this.cameras.main.shake(500, 0.014);
        this.cameras.main.flash(200, 255, 255, 255);
        dark.destroy();
        title.destroy();
        this.ultActive = false;
      });
    });
    // Safety: never leave the player stuck in the cutscene
    this.time.delayedCall(5000, () => {
      if (this.ultActive) {
        this.ultActive = false;
        dark.destroy();
        title.destroy();
      }
    });
  }

  // ---- Boss -------------------------------------------------------------

  private wireBoss(boss: IronBeast): void {
    boss.on('windup', (attack: string, ms: number) => {
      spawnDamageNumber(this, boss.x, boss.y - 80, '!', '#ff3344', 40);
      if (attack === 'slam') {
        const zone = this.add.circle(boss.x, GROUND_Y - 4, BOSS.slamRadius, 0xff3344, 0.12).setStrokeStyle(3, 0xff3344, 0.8).setDepth(5);
        this.tweens.add({ targets: zone, alpha: 0.4, duration: 120, yoyo: true, repeat: Math.floor(ms / 240) });
        this.time.delayedCall(ms, () => zone.destroy());
      }
    });
    boss.on('attack', (attack: string) => {
      if (attack === 'slam') this.onBossSlam(boss);
      else if (attack === 'missile') this.fireMissiles(boss);
      else audio.play('rush', 0.6);
    });
  }

  private onBossSlam(boss: IronBeast): void {
    audio.play('hitHeavy', 0.6);
    ring(this, boss.x, GROUND_Y - 6, 0xff8844, BOSS.slamRadius);
    burst(this, boss.x, GROUND_Y - 10, 0xff8844, 24, 220);
    this.cameras.main.shake(250, 0.012);
    const grounded = this.player.y > GROUND_Y - 110;
    if (grounded && Math.abs(this.player.x - boss.x) < BOSS.slamRadius) this.damagePlayer(Math.round(BOSS.slamDamage * this.dmgMult), boss.x);
  }

  private fireMissiles(boss: IronBeast): void {
    audio.play('rush', 1.4);
    const base = Math.atan2(this.player.y - boss.y, this.player.x - boss.x);
    for (const off of [-0.25, 0, 0.25]) {
      const a = base + off;
      const obj = this.add.rectangle(boss.x, boss.y - 30, 18, 8, 0xff8844).setDepth(30).setRotation(a);
      this.missiles.push({ obj, vx: Math.cos(a) * BOSS.missileSpeed, vy: Math.sin(a) * BOSS.missileSpeed, expireAt: this.time.now + 2500 });
    }
  }

  private updateMissiles(now: number, dt: number): void {
    const b = this.player.body as Phaser.Physics.Arcade.Body;
    const pr = { x: b.x, y: b.y, w: b.width, h: b.height };
    this.missiles = this.missiles.filter((m) => {
      m.obj.x += m.vx * dt;
      m.obj.y += m.vy * dt;
      const hit = !this.player.dead && rectsOverlap({ x: m.obj.x - 9, y: m.obj.y - 4, w: 18, h: 8 }, pr);
      const dead = now >= m.expireAt || m.obj.y > GROUND_Y || (hit && this.damagePlayer(Math.round(BOSS.missileDamage * this.dmgMult), m.obj.x - Math.sign(m.vx)));
      if (dead) {
        burst(this, m.obj.x, m.obj.y, 0xff8844, 6, 60);
        m.obj.destroy();
      }
      return !dead;
    });
  }

  private updateBossState(): void {
    const boss = this.boss;
    if (!boss || !boss.active || this.bossEnraged || !boss.enraged) return;
    this.bossEnraged = true;
    this.banner('ENRAGED!', '#ff3344');
    audio.play('horde');
    this.cameras.main.shake(300, 0.01);
    this.spawner.spawnGroups([{ kind: 'grunt', count: 4, tier: 'fodder' }], (i) => (i % 2 ? 80 : this.plan.length - 80) + (i % 2 ? i * 30 : -i * 30), { hpMult: this.hpMult, dmgMult: this.dmgMult });
  }

  private onBossDefeated(boss: IronBeast): void {
    const now = this.time.now;
    this.boss = null;
    const { x, y } = boss;
    boss.destroy();
    this.score.add(POINTS.boss, this.combo.current(now));
    if (this.run.damageTaken === 0) this.score.addFlat(POINTS.noDamageBonus);
    this.run.kills++;

    // Wipe the adds, then a chain of explosions and a mountain of loot
    for (const e of this.spawner.enemies) {
      if (e.active) {
        deathEffect(this, e.x, e.y);
        e.destroy();
      }
    }
    this.missiles.forEach((m) => m.obj.destroy());
    this.missiles = [];
    this.pickups.spawnAll(dropsFor('boss', 'normal', this.run.progress.zone, Math.random, this.stats.goldMult), x, y - 30);

    this.hitStop.trigger(now, 250);
    this.slowmo.trigger(now, 2200, 0.25);
    this.cameras.main.flash(300, 255, 255, 255);
    this.cameras.main.shake(1500, 0.012);
    punchZoom(this, 0.12, 600);
    audio.play('multikill');
    for (let i = 0; i < 9; i++) {
      this.time.delayedCall(250 + i * 170, () => {
        const ex = x + Phaser.Math.Between(-60, 60);
        const ey = y + Phaser.Math.Between(-60, 40);
        burst(this, ex, ey, i % 2 ? 0xff8844 : 0xffdd44, 30, 260);
        ring(this, ex, ey, 0xffffff, 90);
        audio.play('kill', 0.6 + (i % 3) * 0.2);
      });
    }
    this.banner('BOSS DEFEATED', '#ffdd44', 2400);
    this.time.delayedCall(2200, () => {
      this.unlockScreen();
      this.roomCleared();
    });
  }

  // ---- Combat -----------------------------------------------------------

  /** Central place for the player taking damage. Returns true if it landed. */
  private damagePlayer(amount: number, fromX: number): boolean {
    if (this.state === 'over' || this.ultActive) return false;
    const dmg = Math.max(1, Math.round(amount * this.stats.damageTakenMult));
    if (!this.player.takeDamage(dmg, fromX)) return false;
    this.run.damageTaken += dmg;
    this.ult.gain(ULT_GAIN.hurt, this.stats.ultGainMult);
    audio.play('hurt');
    spawnDamageNumber(this, this.player.x, this.player.y - 40, dmg, '#ff6666');
    this.cameras.main.shake(100, 0.004 + dmg * 0.0002);
    if (hasRelic(this.run.relics, 'thorns')) this.aoeDamage(this.player.x, this.player.y, 150, 45, 40, 0xcccccc);
    return true;
  }

  private handleDash(now: number): void {
    const target = this.rush.available(now) ? this.rush.target : null;
    if (target && target.active && !target.dead) {
      this.rush.clear();
      spawnDamageNumber(this, this.player.x, this.player.y - 50, 'RUSH!', '#44ffee', 26);
      audio.play('rush');
      this.player.startRush(target, () => this.onRushArrive(target));
    } else if (this.player.tryDodge()) {
      audio.play('dodge');
      if (hasRelic(this.run.relics, 'quake')) this.aoeDamage(this.player.x, this.player.y, 130, 30, 30, 0xd9a066);
    }
  }

  private onPlayerAttackHit(e: Enemy): void {
    const step = ATTACK_STEPS[this.player.attack.step];
    const counter = this.player.attack.counter;
    if (counter) spawnDamageNumber(this, this.player.x, this.player.y - 50, 'COUNTER!', '#ff8844', 26);
    this.hitEnemy(e, {
      baseDamage: step.damage,
      breakDamage: counter ? DODGE.counterBreakDamage : step.breakDamage,
      knockback: counter ? DODGE.counterKnockback : step.knockback,
      hitStopMs: counter ? DODGE.counterHitStopMs : step.hitStopMs,
      shake: counter ? 0.007 : step.shake,
      counter,
      color: counter ? 0xff8844 : 0xffee88,
      step: this.player.attack.step,
      launch: counter || this.player.attack.step === ATTACK_STEPS.length - 1,
      sfx: counter ? 'counter' : step.hitStopMs >= 80 ? 'hitHeavy' : 'hit',
    });
  }

  private onRushArrive(e: Enemy): void {
    if (!e.active || e.dead) return;
    this.score.add(POINTS.rush, this.combo.current(this.time.now));
    this.hitEnemy(e, {
      baseDamage: RUSH.damage,
      breakDamage: RUSH.breakDamage,
      knockback: RUSH.knockback,
      hitStopMs: RUSH.hitStopMs,
      shake: 0.008,
      rush: true,
      color: 0x44ffee,
      sfx: 'rushHit',
    });
  }

  /** Shared hit pipeline: damage calc, perks, combo, score, feedback, break and kill handling. */
  private hitEnemy(e: Enemy, o: HitOptions): void {
    const now = this.time.now;
    if (e.blocksLightHit(this.player.x, o.step ?? 99, !!o.counter, !!o.rush)) {
      this.onBlocked(e);
      return;
    }
    const st = this.stats;
    const crit = Math.random() < st.critChance;
    const levelMult = 1 + LEVEL_DMG * (this.levelState.level - 1);
    const base = o.baseDamage * st.damageMult * levelMult * (o.rush ? st.rushMult : 1);
    let dmg = calcDamage(base, { comboHits: this.combo.current(now), broken: e.broken, counter: !!o.counter });
    if (crit) dmg *= 2;
    if (e.broken) dmg = Math.round(dmg * st.brokenDamageMult);
    const res = e.takeHit({ damage: dmg, breakDamage: o.breakDamage * st.breakMult, knockbackX: this.player.facing * o.knockback, knockbackY: o.launch ? -300 : undefined });
    const prevCombo = this.combo.current(now);
    const nextCombo = this.combo.add(now);
    this.score.add(POINTS.hit, nextCombo);
    if (!o.ultHit) this.ult.gain(ULT_GAIN.hit, st.ultGainMult);

    spawnDamageNumber(this, e.x, e.y - 30, res.dealt, crit ? '#ff4455' : e.broken || res.justBroken ? '#ff9933' : '#ffee88', Math.min(44, (crit ? 26 : 18) + res.dealt * 0.4));
    if (crit) spawnDamageNumber(this, e.x, e.y - 60, 'CRITICAL!!', '#ff4455', 22);
    directionalBurst(this, e.x, e.y, o.color, 8 + Math.round(o.hitStopMs / 5), 110 + o.hitStopMs, this.player.facing);
    if (o.launch) {
      this.cameras.main.flash(70, 255, 255, 255);
      punchZoom(this, 0.025, 180);
    }
    this.hitStop.trigger(now, o.hitStopMs);
    this.cameras.main.shake(80, o.shake);
    audio.play(o.sfx, 1 + Math.min(nextCombo, 50) * 0.01);
    slashFx(this, e.x, e.y, 0xffffff, 50 + o.hitStopMs);
    if (o.hitStopMs >= 80) ring(this, e.x, e.y, o.color, 50);

    const milestone = milestoneCrossed(prevCombo, nextCombo);
    if (milestone) {
      this.comboDisplay.milestone(milestone);
      audio.play('milestone');
      this.cameras.main.shake(160, 0.006);
      if (milestone >= 25) punchZoom(this, 0.04, 200);
    }

    if (res.justBroken) {
      spawnDamageNumber(this, e.x, e.y - 70, 'BREAK!!', '#ffcc00', 30);
      burst(this, e.x, e.y, 0xffcc00, 16, 140);
      this.hitStop.trigger(now, 100);
      this.cameras.main.shake(150, 0.008);
      audio.play('break');
      ring(this, e.x, e.y, 0xffcc00, 90);
      this.score.add(POINTS.break, nextCombo);
    }
    if (crit && hasRelic(this.run.relics, 'storm')) this.stormStrike(e);
    if (e.dead) this.killEnemy(e, now);
  }

  /** Damage that skips combo / block logic: used by relics. */
  private directHit(e: Enemy, dmg: number, breakDmg: number, dir: number): void {
    if (!e.active || e.dead) return;
    const res = e.takeHit({ damage: dmg, breakDamage: breakDmg, knockbackX: dir * 240, knockbackY: -200 });
    spawnDamageNumber(this, e.x, e.y - 30, res.dealt, '#9fe0ff', 20);
    if (res.justBroken) spawnDamageNumber(this, e.x, e.y - 60, 'BREAK!!', '#ffcc00', 24);
    if (e.dead) this.killEnemy(e, this.time.now);
  }

  private aoeDamage(x: number, y: number, radius: number, dmg: number, breakDmg: number, color: number): void {
    shockwave(this, x, y, radius, color);
    audio.play('boom');
    for (const e of [...this.spawner.enemies]) {
      if (!e.active || e.dead) continue;
      if (Math.hypot(e.x - x, e.y - y) <= radius + 20) this.directHit(e, dmg, breakDmg, e.x >= x ? 1 : -1);
    }
  }

  private stormStrike(from: Enemy): void {
    const others = this.spawner.enemies
      .filter((o) => o !== from && o.active && !o.dead && Math.abs(o.x - from.x) < 420)
      .sort((a, b) => Math.abs(a.x - from.x) - Math.abs(b.x - from.x))
      .slice(0, 2);
    let px = from.x;
    let py = from.y;
    for (const o of others) {
      lightning(this, px, py - 10, o.x, o.y - 10);
      this.directHit(o, 35, 20, o.x >= px ? 1 : -1);
      px = o.x;
      py = o.y;
    }
    if (others.length) audio.play('skill', 1.6);
  }

  private breakCrates(): void {
    if (this.crates.length === 0) return;
    const hitting = this.player.attacking || this.player.skillDashing;
    if (!hitting) return;
    const box = this.player.skillDashing ? { x: this.player.x - 50, y: this.player.y - 40, w: 100, h: 80 } : this.player.hitbox;
    for (const c of this.crates) {
      if (c.broken || !rectsOverlap(box, c.rect)) continue;
      c.break();
      burst(this, c.x, GROUND_Y - 18, 0xd09a55, 12, 150);
      audio.play('hit', 0.8);
      this.cameras.main.shake(50, 0.002);
      this.pickups.spawnAll(crateDrops(this.run.progress.zone, Math.random, this.stats.goldMult), c.x, GROUND_Y - 24);
    }
    this.crates = this.crates.filter((c) => !c.broken);
  }

  /** Light hit bounced off a guard's shield: no damage, no combo, but a satisfying clang. */
  private onBlocked(e: Enemy): void {
    const f = this.player.facing;
    const sx = e.x + e.facing * 16;
    directionalBurst(this, sx, e.y, 0x9fd0ff, 10, 150, (e.facing * -1) as 1 | -1);
    ring(this, sx, e.y, 0x9fd0ff, 36);
    spawnDamageNumber(this, e.x, e.y - 40, 'BLOCKED', '#9fd0ff', 16);
    audio.play('hit', 0.55);
    this.hitStop.trigger(this.time.now, 40);
    this.cameras.main.shake(70, 0.003);
    e.setVelocityX(f * 110);
    this.player.recoil(-f * 220);
  }

  /** Warning effects for an enemy's wind-up so attacks can be read and dodged. */
  private wireEnemy(e: Enemy): void {
    dust(this, e.x, GROUND_Y, 5);
    e.on('windup', (kind: string, ms: number, dir: number) => {
      spawnDamageNumber(this, e.x, e.y - 46, '!', '#ff3344', 32);
      audio.play('warn');
      if (kind !== 'rusher') return;
      const st = ENEMY_STATS.rusher;
      const len = (st.lungeSpeed * st.activeMs) / 1000;
      const lane = this.add.rectangle(e.x + (dir * len) / 2, GROUND_Y - 22, len, 44, 0xff2233, 0.2).setDepth(4);
      this.tweens.add({ targets: lane, alpha: 0.5, duration: 110, yoyo: true, repeat: Math.floor(ms / 220) });
      this.time.delayedCall(ms, () => lane.destroy());
    });
  }

  private killEnemy(e: Enemy, now: number): void {
    if (e instanceof IronBeast) {
      this.onBossDefeated(e);
      return;
    }
    const me = e as MeleeEnemy;
    const tier: EnemyTier = me.tier ?? 'normal';
    deathEffect(this, e.x, e.y);
    audio.play('kill');
    this.hitStop.trigger(now, tier === 'elite' ? 130 : tier === 'fodder' ? 20 : 60);
    if (tier === 'elite') {
      this.cameras.main.shake(300, 0.01);
      ring(this, e.x, e.y, 0xffd633, 140);
    }
    this.run.kills++;
    this.roomKills++;
    const gained = this.score.add(e.points, this.combo.current(now));
    if (tier !== 'fodder') spawnDamageNumber(this, e.x, e.y - 50, `+${gained}`, '#88ff88', 18);
    this.ult.gain(tier === 'fodder' ? ULT_GAIN.kill * 0.3 : ULT_GAIN.kill, this.stats.ultGainMult);

    // Loot shower
    const kind = me.kind ?? 'grunt';
    this.pickups.spawnAll(dropsFor(kind, tier, this.run.progress.zone, Math.random, this.stats.goldMult), e.x, e.y - 10);

    const mk = this.kills.record(now);
    if (mk.tierUp) this.onMultiKill(mk.count, mk.tier);
    const others = this.spawner.enemies.filter((o) => o !== e && o.active && !o.dead);
    const next = pickNearest(this.player, others, RUSH.range);
    if (next) this.rush.offer(next, now, RUSH.windowMs + this.stats.rushWindowBonusMs);
    if (this.stats.killHeal > 0 && this.player.hp < this.player.maxHp) {
      const healed = this.player.heal(this.stats.killHeal);
      if (healed > 0) spawnDamageNumber(this, this.player.x, this.player.y - 60, `+${healed} HP`, '#44dd66', 16);
    }
    const x = e.x;
    const y = e.y;
    e.destroy();
    if (hasRelic(this.run.relics, 'blast') && this.explosionDepth < 3) {
      this.explosionDepth++;
      this.aoeDamage(x, y, 130, 45, 25, 0xff7a33);
      this.explosionDepth--;
    }
  }

  /** Mass-kill payoff: slow motion, flash, zoom punch, banner and a gold shower. */
  private onMultiKill(count: number, tier: number): void {
    const now = this.time.now;
    this.slowmo.trigger(now, 400 + tier * 250, tier >= 3 ? 0.25 : 0.4);
    this.hitStop.trigger(now, 60 + tier * 30);
    this.cameras.main.flash(180, 255, 255, 255);
    this.cameras.main.shake(300 + tier * 100, 0.008 + tier * 0.004);
    punchZoom(this, 0.05 + tier * 0.03, 350);
    audio.play('multikill');
    const colors = ['#ffdd44', '#ff9933', '#ff4455'];
    const t = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, `${count} KILLS!`, {
        fontFamily: 'monospace', fontStyle: 'bold', fontSize: `${56 + tier * 12}px`, color: colors[tier - 1], stroke: '#000', strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(120)
      .setScale(0.4);
    this.tweens.add({ targets: t, scale: 1.1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, delay: 900, duration: 400, onComplete: () => t.destroy() });
    burst(this, this.player.x, this.player.y - 20, 0xffdd44, 30 + tier * 20, 320);
    ring(this, this.player.x, this.player.y, 0xffdd44, 160 + tier * 40);
  }

  // ---- Loot / XP --------------------------------------------------------

  private onCollect(d: Drop): void {
    if (d.type === 'gold') this.run.gold += d.value;
    else if (d.type === 'xp') this.gainXp(d.value);
    else {
      const healed = this.player.heal(d.value);
      if (healed > 0) spawnDamageNumber(this, this.player.x, this.player.y - 56, `+${healed}`, '#44dd66', 18);
    }
  }

  private gainXp(amount: number): void {
    const levels = addXp(this.levelState, amount * this.stats.xpMult);
    if (levels <= 0) return;
    this.pendingLevelUps += levels;
    this.player.maxHp = this.maxHp();
    this.player.heal(Math.round(this.player.maxHp * 0.08) + LEVEL_HP * levels);
    ring(this, this.player.x, this.player.y, 0x7af0ff, 150);
    burst(this, this.player.x, this.player.y, 0x7af0ff, 24, 260);
    spawnDamageNumber(this, this.player.x, this.player.y - 70, 'LEVEL UP!', '#7af0ff', 30);
  }

  // ---- Death / end of run ----------------------------------------------

  private onPlayerDeath(): void {
    if (hasRelic(this.run.relics, 'phoenix') && !this.run.phoenixUsed) {
      this.run.phoenixUsed = true;
      this.player.hp = Math.round(this.maxHp() * 0.5);
      this.player.grantInvuln(2500);
      this.aoeDamage(this.player.x, this.player.y, 260, 80, 60, 0xff5566);
      this.banner('PHOENIX!', '#ff5566', 1400);
      audio.play('levelup');
      this.cameras.main.flash(300, 255, 120, 120);
      return;
    }
    this.syncRun();
    this.endRun(false);
  }

  private endRun(victory: boolean): void {
    if (this.runEnded) return;
    this.runEnded = true;
    this.state = 'over';
    const r = this.run;
    const roomsCleared = victory ? ZONES * ROOMS_PER_ZONE : roomsClearedBefore(r.progress);
    const zonesCleared = victory ? ZONES : r.progress.zone - 1;
    const shards = shardsEarned({ roomsCleared, zonesCleared, kills: r.kills, victory });

    const rec = recordRun(this.save, { difficulty: r.difficulty, runScore: r.score, maxCombo: r.maxCombo, clearedStage: zonesCleared });
    const ev = evaluateUnlocks(rec.save);
    this.save = ev.save;
    this.save.shards += shards;
    writeSave(this.save);

    const summary: RunSummary = {
      victory,
      zone: r.progress.zone,
      room: r.progress.room,
      level: this.levelState.level,
      kills: r.kills,
      gold: r.gold,
      maxCombo: r.maxCombo,
      score: r.score,
      timeSec: Math.round(r.timeMs / 1000),
      shards,
      bestBefore: rec.bestBefore,
      newRecord: rec.newRecord,
      unlocked: ev.newly.map((u) => u.label),
      relics: r.relics,
      rooms: roomsCleared,
    };
    if (!victory) {
      this.slowmo.trigger(this.time.now, 1500, 0.3);
      this.banner('YOU FELL', '#ff4466', 1400);
    }
    this.time.delayedCall(victory ? 600 : 1700, () => this.scene.start('RunEnd', { summary, difficulty: r.difficulty }));
  }

  // ---- UI ---------------------------------------------------------------

  private banner(text: string, color: string, holdMs = 1200): void {
    const t = this.add
      .text(GAME_WIDTH / 2, 150, text, { fontFamily: 'monospace', fontStyle: 'bold', fontSize: '48px', color, stroke: '#000', strokeThickness: 8 })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(120)
      .setScale(0.5);
    this.tweens.add({ targets: t, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, delay: holdMs, duration: 400, onComplete: () => t.destroy() });
  }

  /** scale < 1 = slow motion. Arcade's timeScale is inverted (2 = half speed). */
  private setTimeScale(scale: number): void {
    if (scale === this.timeScale) return;
    this.timeScale = scale;
    this.physics.world.timeScale = 1 / scale;
    this.tweens.timeScale = scale;
  }

  private updateUI(now: number): void {
    const cam = this.cameras.main;
    this.bgFar.tilePositionX = cam.scrollX * 0.12;
    this.bgNear.tilePositionX = cam.scrollX * 0.3;
    this.shadows.clear();
    for (const a of [this.player, ...this.spawner.enemies]) {
      if (!a.active) continue;
      const feetY = a.y + a.displayHeight / 2;
      const lift = Phaser.Math.Clamp((GROUND_Y - feetY) / 220, 0, 1);
      this.shadows.fillStyle(0x000000, 0.4 * (1 - lift * 0.6)).fillEllipse(a.x, GROUND_Y + 4, a.displayWidth * (1.1 - lift * 0.5), 9);
    }

    const st = this.station;
    if (st) {
      const label = st.kind === 'chest' ? '[E] OPEN' : st.kind === 'campfire' ? '[E] REST' : '[E] SHOP';
      st.setPrompt(!st.used && st.near(this.player.x) ? label : st.kind === 'merchant' && st.near(this.player.x) ? label : null, now);
    }

    const z = Math.min(this.run.progress.zone, ZONES);
    this.hud.update(
      {
        hp: this.player.hp,
        maxHp: this.player.maxHp,
        level: this.levelState.level,
        xp: this.levelState.xp,
        xpNeed: xpToNext(this.levelState.level),
        gold: this.run.gold,
        zone: z,
        roomLabel: `ZONE ${z}-${this.run.progress.room + 1}  ${ZONE_TINT[z - 1].name}`,
        score: this.run.score + this.score.total,
        skillProgress: this.skillCd.progress(now, this.stats.cooldownMult),
        skillReady: this.skillCd.ready(now),
        ult: this.ult.value,
        ultMax: this.ult.max,
        relics: this.run.relics,
      },
      now,
    );
    this.comboDisplay.update(this.combo.current(now), this.combo.remainingRatio(now));
    this.enemyBars.update(this.spawner.enemies.filter((e) => e !== this.boss), now);
    this.bossBar.update(this.boss && this.boss.active ? this.boss : null, now);
    const t = this.rush.available(now) && this.rush.target?.active ? this.rush.target : null;
    this.rushMarker.update(t, now);
  }
}
