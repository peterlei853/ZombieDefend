import { WaveManager } from '../systems/WaveManager.js';
import { Barricade } from '../entities/Barricade.js';
import { Zombie } from '../entities/Zombie.js';
import { DefenderGroup } from '../entities/Defender.js';
import {
  BARRICADE_MAX_HP,
  GAME_WIDTH,
  GAME_HEIGHT,
  STAGE_DURATION,
} from '../data/waves.js';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  HORIZON_Y,
  HUD_DEPTH,
  depthBands,
  spawnWorldX,
  cameraScrollX,
  laneCenters,
  takeEvenLaneY,
  grassYMin,
  grassYMax,
  barricadeXAtY,
  groundEdgesAtY,
} from '../systems/DepthView.js';
import { DAMAGE_COLORS, showDamageText } from '../ui/damageText.js';

/**
 * Stage combat vertical slice — 2.5D side strip.
 *
 * Camera scrolls X only; Y is the depth/lane axis (DepthView).
 * Barricade follows the slanted grass right edge; player Y-moves in safe zone.
 *
 * Win:  timer ≥ 90s AND no zombies remain → ShopScene
 * Lose: barricade HP ≤ 0 → Game Over overlay (retry)
 */
export default class StageScene extends Phaser.Scene {
  constructor() {
    super('StageScene');
  }

  init(data) {
    this.stage = data?.stage ?? this.registry.get('stage') ?? 1;
    this.gold = data?.gold ?? this.registry.get('gold') ?? 0;
    this.characterId = data?.characterId ?? this.registry.get('characterId') ?? 'default';

    this.registry.set('stage', this.stage);
    this.registry.set('gold', this.gold);
    this.registry.set('characterId', this.characterId);

    this.ended = false;
    /** @type {Zombie[]} */
    this.zombies = [];
    /** Shuffled lane cycle so spawns spread across every guide before repeating. */
    this._laneCycle = { order: [] };
  }

  create() {
    this._drawWorld();

    // Frame camera on slanted barricade at mid-grass Y (shared DepthView helpers)
    const midY = (grassYMin() + grassYMax()) / 2;
    const barricadeFocusX = barricadeXAtY(midY);
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    cam.setScroll(cameraScrollX(barricadeFocusX), 0);

    this.barricade = new Barricade(this, {
      maxHp: BARRICADE_MAX_HP,
    });

    this.defenders = new DefenderGroup(this, {});

    this.waveManager = new WaveManager();

    this._buildHud();

    // SPACE toggles Handgun ↔ Shotgun (once per press); combat math stays in WeaponSystem
    this._spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this._spaceKey.on('down', () => {
      this.defenders.weapons.toggleWeapon();
      this.hudWeapon.setText(this.defenders.weapons.getWeaponLabel());
    });
  }

  _drawWorld() {
    // Sky / atmosphere above the horizon
    this.add.rectangle(WORLD_WIDTH / 2, HORIZON_Y / 2, WORLD_WIDTH, HORIZON_Y, 0x152238);
    // Soft horizon glow
    this.add
      .rectangle(WORLD_WIDTH / 2, HORIZON_Y, WORLD_WIDTH, 6, 0x3a5a78, 0.55)
      .setDepth(0);

    // Backdrop under the ground plane (fills side wedges outside trapezoids)
    this.add
      .rectangle(
        WORLD_WIDTH / 2,
        HORIZON_Y + (WORLD_HEIGHT - HORIZON_Y) / 2,
        WORLD_WIDTH,
        WORLD_HEIGHT - HORIZON_Y,
        0x1a2a20
      )
      .setDepth(0);

    // Perspective depth bands (far = higher / narrower)
    const g = this.add.graphics().setDepth(1);
    for (const band of depthBands()) {
      g.fillStyle(band.color, 1);
      g.beginPath();
      g.moveTo(band.e0.left, band.y0);
      g.lineTo(band.e0.right, band.y0);
      g.lineTo(band.e1.right, band.y1);
      g.lineTo(band.e1.left, band.y1);
      g.closePath();
      g.fillPath();
    }

    // Dark lane guides — one per lane center, clipped to the grass trapezoid.
    const guides = this.add.graphics().setDepth(2);
    guides.lineStyle(2, 0x070d0a, 0.88);
    for (const y of laneCenters()) {
      const edge = groundEdgesAtY(y);
      const xEnd = Math.min(edge.right, barricadeXAtY(y));
      if (xEnd <= edge.left) continue;
      guides.beginPath();
      guides.moveTo(edge.left, y);
      guides.lineTo(xEnd, y);
      guides.strokePath();
    }
  }

  _buildHud() {
    const style = {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      color: '#e8eef5',
    };
    const d = HUD_DEPTH;

    this.hudBg = this.add
      .rectangle(GAME_WIDTH / 2, 16, GAME_WIDTH, 32, 0x0a1018, 0.85)
      .setScrollFactor(0)
      .setDepth(d);

    this.hudTime = this.add.text(12, 8, 'Time: 0s', style).setScrollFactor(0).setDepth(d + 1);
    this.hudWave = this.add.text(120, 8, 'Wave: 1', style).setScrollFactor(0).setDepth(d + 1);
    this.hudEnemies = this.add
      .text(210, 8, 'Enemies: 0', style)
      .setScrollFactor(0)
      .setDepth(d + 1);
    this.hudBarricade = this.add
      .text(360, 8, `Barricade: ${BARRICADE_MAX_HP}`, style)
      .setScrollFactor(0)
      .setDepth(d + 1);
    this.hudGold = this.add
      .text(520, 8, `Gold: ${this.gold}`, { ...style, color: '#ffd54f' })
      .setScrollFactor(0)
      .setDepth(d + 1);
    this.hudWeapon = this.add
      .text(620, 8, this.defenders.weapons.getWeaponLabel(), {
        ...style,
        color: '#90caf9',
      })
      .setScrollFactor(0)
      .setDepth(d + 1);
    this.hudStage = this.add
      .text(GAME_WIDTH - 12, 8, `Stage ${this.stage}`, { ...style, color: '#8fa3b8' })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(d + 1);

    // Tiny move / weapon hint
    this.hudHint = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 10, 'W/S move · SPACE switch weapon', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        color: '#6a7a8a',
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(d + 1);
  }

  _refreshHud() {
    const t = Math.min(STAGE_DURATION, Math.floor(this.waveManager.getElapsed()));
    const alive = this.zombies.filter((z) => z.alive).length;
    const remaining = alive + this.waveManager.getRemainingToSpawn();

    this.hudTime.setText(`Time: ${t}s`);
    this.hudWave.setText(`Wave: ${this.waveManager.getCurrentWave()}`);
    this.hudEnemies.setText(`Enemies: ${remaining}`);
    this.hudBarricade.setText(`Barricade: ${Math.ceil(this.barricade.hp)}`);
    this.hudGold.setText(`Gold: ${this.gold}`);
    this.hudWeapon.setText(this.defenders.weapons.getWeaponLabel());
  }

  update(_time, delta) {
    if (this.ended) return;

    // Enforce X-only scroll (no Y drift)
    const cam = this.cameras.main;
    if (cam.scrollY !== 0) cam.setScroll(cam.scrollX, 0);

    const deltaMs = Math.min(delta, 50);
    const deltaSec = deltaMs / 1000;

    // Spawns
    const due = this.waveManager.update(deltaSec);
    for (const intent of due) {
      this._spawnZombie(intent);
    }

    // Zombies move / contact DPS — per-zombie contactXAt(y) matches slanted posts.
    // Damage totals still apply every frame; floating numbers pop on the ~1s bite.
    let barricadeDmg = 0;
    /** @type {Zombie[]} */
    const attackBeats = [];
    for (const z of this.zombies) {
      if (!z.alive) continue;
      z.update(deltaSec, this.barricade.contactXAt(z.y));
      const dealt = z.contactDamage(deltaSec);
      barricadeDmg += dealt;
      z.addBarricadeDmg(dealt);
      if (z.consumeAttackBeat()) attackBeats.push(z);
    }
    let destroyed = false;
    if (barricadeDmg > 0) {
      destroyed = this.barricade.applyDamage(barricadeDmg);
    }
    for (const z of attackBeats) {
      this._onBarricadeAttack(z);
    }
    if (destroyed) {
      this._onLose();
      return;
    }

    // Defenders fire + hits (WeaponSystem cadence / splash / pet AOE)
    const petGain = this.defenders.update(deltaMs, this.zombies);
    const hitGain = this.defenders.resolveHits(this.zombies);
    const gold = (petGain?.gold || 0) + (hitGain?.gold || 0);
    if (gold > 0) {
      this.gold += gold;
      this.registry.set('gold', this.gold);
    }

    // Prune dead refs occasionally
    if (this.zombies.length > 40) {
      this.zombies = this.zombies.filter((z) => z.alive);
    }

    this._refreshHud();

    // Win check
    if (this.waveManager.isTimeUp()) {
      const anyAlive = this.zombies.some((z) => z.alive);
      const anyQueued = this.waveManager.getRemainingToSpawn() > 0;
      if (!anyAlive && !anyQueued) {
        this._onWin();
      }
    }
  }

  /**
   * One bite: punch already played on the zombie. Flash the wall, claw mark,
   * and a red integer for the HP chewed since the previous bite.
   * @param {Zombie} z
   */
  _onBarricadeAttack(z) {
    if (!z) return;
    const y = z.y;
    const x = this.barricade.contactXAt(y);
    this.barricade.flashAtY(y);
    this.barricade.spawnImpact(x, y);
    const shown = z.popBarricadeDmgInt();
    if (shown >= 1) {
      showDamageText(this, x - 10, y - 18, shown, DAMAGE_COLORS.barricade);
    }
  }

  _spawnZombie(intent) {
    const y = takeEvenLaneY(this._laneCycle);
    const arch = intent.archetype;
    const z = new Zombie(this, {
      x: spawnWorldX(),
      y,
      hp: arch.hp,
      speed: arch.speed,
      dps: arch.dps,
      wave: intent.wave,
    });
    this.zombies.push(z);
  }

  _pinOverlay(go) {
    go.setScrollFactor(0);
    return go;
  }

  _onWin() {
    if (this.ended) return;
    this.ended = true;
    this.registry.set('gold', this.gold);

    const d = HUD_DEPTH + 100;
    const overlay = this._pinOverlay(
      this.add
        .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55)
        .setDepth(d)
    );

    this._pinOverlay(
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.38, 'Stage Clear!', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '36px',
          color: '#81c784',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(d + 1)
    );

    this._pinOverlay(
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.5, `Gold: ${this.gold}`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '18px',
          color: '#ffd54f',
        })
        .setOrigin(0.5)
        .setDepth(d + 1)
    );

    this.time.delayedCall(900, () => {
      overlay.destroy();
      this.scene.start('ShopScene', {
        stage: this.stage,
        gold: this.gold,
        characterId: this.characterId,
      });
    });
  }

  _onLose() {
    if (this.ended) return;
    this.ended = true;
    this.registry.set('gold', this.gold);

    const d = HUD_DEPTH + 100;

    this._pinOverlay(
      this.add
        .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x1a0000, 0.7)
        .setDepth(d)
    );

    this._pinOverlay(
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.32, 'Game Over', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '40px',
          color: '#ef5350',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(d + 1)
    );

    this._pinOverlay(
      this.add
        .text(
          GAME_WIDTH / 2,
          GAME_HEIGHT * 0.46,
          `Survived ${Math.floor(this.waveManager.getElapsed())}s · Gold ${this.gold}`,
          {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '16px',
            color: '#cfd8dc',
          }
        )
        .setOrigin(0.5)
        .setDepth(d + 1)
    );

    const btn = this._pinOverlay(
      this.add
        .rectangle(GAME_WIDTH / 2, GAME_HEIGHT * 0.62, 180, 44, 0x455a64)
        .setInteractive({ useHandCursor: true })
        .setDepth(d + 1)
    );
    this._pinOverlay(
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.62, 'Retry', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '18px',
          color: '#ffffff',
        })
        .setOrigin(0.5)
        .setDepth(d + 2)
    );

    btn.on('pointerover', () => btn.setFillStyle(0x546e7a));
    btn.on('pointerout', () => btn.setFillStyle(0x455a64));
    btn.on('pointerup', () => {
      // Retry same stage; keep earned gold this run (Architect may change)
      this.scene.start('StageScene', {
        stage: this.stage,
        gold: this.gold,
        characterId: this.characterId,
      });
    });
  }
}
