import { BULLET_SIZE } from '../data/waves.js';
import {
  depthFromY,
  scaleFromY,
  spawnWorldX,
  WORLD_HEIGHT,
  grassYMin,
  grassYMax,
  barricadeXAtY,
} from '../systems/DepthView.js';
import { WeaponSystem } from '../systems/WeaponSystem.js';

/** Player sits this many px right of the grass edge (safe zone). */
const PLAYER_SAFE_OFFSET = 32;
/** Pet (turret) offset from player toward the safer side. */
const PET_OFFSET_X = 25;
const PET_OFFSET_Y = -15;
/** Lerp factor per ~16.67ms frame (delta-aware). */
const PET_LERP = 0.16;
/** Player vertical move speed (px/s). */
const PLAYER_MOVE_SPEED = 180;

/**
 * Player + pet behind the barricade.
 * Movement / follow stay here; targeting, fire cadence, splash, pet AOE
 * live in WeaponSystem.
 */
export class DefenderGroup {
  /**
   * @param {Phaser.Scene} scene
   * @param {{}} [opts]
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.bullets = [];
    this.weapons = new WeaponSystem(scene);

    const yMin = grassYMin();
    const yMax = grassYMax();
    const playerY = (yMin + yMax) / 2;
    const playerX = barricadeXAtY(playerY) + PLAYER_SAFE_OFFSET;
    const playerScale = scaleFromY(playerY);

    // PIXELLAB_HOOK: replace with sprite player
    this.player = scene.add.rectangle(playerX, playerY, 22, 28, 0x42a5f5);
    this.player.setStrokeStyle(2, 0x1e88e5);
    this.player.setScale(playerScale);
    this.player.setDepth(depthFromY(playerY));

    const petX = playerX + PET_OFFSET_X;
    const petY = playerY + PET_OFFSET_Y;
    const petScale = scaleFromY(petY);

    // PIXELLAB_HOOK: replace with sprite turret (Pet)
    this.turret = scene.add.rectangle(petX, petY, 24, 24, 0x78909c);
    this.turret.setStrokeStyle(2, 0x546e7a);
    this.turret.setScale(petScale);
    this.turret.setDepth(depthFromY(petY));
    // Small barrel marker
    this.turretBarrel = scene.add
      .rectangle(petX - 16, petY, 14, 6, 0x90a4ae)
      .setScale(petScale)
      .setDepth(depthFromY(petY, 1));

    // W/S + arrow keys for Y-only move
    this.cursors = scene.input.keyboard.createCursorKeys();
    this.keys = scene.input.keyboard.addKeys({
      W: Phaser.Input.Keyboard.KeyCodes.W,
      S: Phaser.Input.Keyboard.KeyCodes.S,
      A: Phaser.Input.Keyboard.KeyCodes.A,
      D: Phaser.Input.Keyboard.KeyCodes.D,
    });
  }

  _clampGrassY(y) {
    return Math.min(grassYMax(), Math.max(grassYMin(), y));
  }

  _syncPlayerTransform() {
    const y = this._clampGrassY(this.player.y);
    this.player.y = y;
    this.player.x = barricadeXAtY(y) + PLAYER_SAFE_OFFSET;
    const s = scaleFromY(y);
    this.player.setScale(s);
    this.player.setDepth(depthFromY(y));
  }

  _syncPetTransform(deltaMs) {
    const targetX = this.player.x + PET_OFFSET_X;
    const targetY = this._clampGrassY(this.player.y + PET_OFFSET_Y);
    // Delta-aware lerp (~PET_LERP per 60fps frame)
    const t = 1 - Math.pow(1 - PET_LERP, deltaMs / (1000 / 60));
    this.turret.x += (targetX - this.turret.x) * t;
    this.turret.y += (targetY - this.turret.y) * t;
    this.turret.y = this._clampGrassY(this.turret.y);

    const s = scaleFromY(this.turret.y);
    this.turret.setScale(s);
    this.turret.setDepth(depthFromY(this.turret.y));

    this.turretBarrel.x = this.turret.x - 16;
    this.turretBarrel.y = this.turret.y;
    this.turretBarrel.setScale(s);
    this.turretBarrel.setDepth(depthFromY(this.turret.y, 1));
  }

  /**
   * @param {number} deltaMs
   * @param {import('./Zombie.js').Zombie[]} zombies
   * @returns {{ gold: number, kills: number }} gold/kills from pet AOE this frame
   */
  update(deltaMs, zombies) {
    // Player Y-only move (W/S or up/down). X always tracks barricade edge.
    const deltaSec = deltaMs / 1000;
    let dy = 0;
    if (this.cursors.up.isDown || this.keys.W.isDown) dy -= 1;
    if (this.cursors.down.isDown || this.keys.S.isDown) dy += 1;
    if (dy !== 0) {
      this.player.y += dy * PLAYER_MOVE_SPEED * deltaSec;
    }
    this._syncPlayerTransform();
    this._syncPetTransform(deltaMs);

    // WeaponSystem owns fire cadence + targeting + pet AOE
    this.weapons.updatePlayerFire(
      deltaMs,
      this.player.x,
      this.player.y,
      zombies,
      this.bullets
    );
    const petResult = this.weapons.updatePetAoe(
      deltaMs,
      this.turret.x,
      this.turret.y,
      zombies
    );

    const leftCull = spawnWorldX() - 50;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.gfx.x += b.vx * deltaSec;
      b.gfx.y += b.vy * deltaSec;
      b.gfx.setDepth(depthFromY(b.gfx.y));
      if (b.gfx.x < leftCull || b.gfx.y < -30 || b.gfx.y > WORLD_HEIGHT + 30) {
        b.gfx.destroy();
        this.bullets.splice(i, 1);
      }
    }

    return petResult;
  }

  /**
   * Resolve bullet ↔ zombie hits (incl. shotgun splash via WeaponSystem).
   * @param {import('./Zombie.js').Zombie[]} zombies
   * @returns {{ gold: number, kills: number }}
   */
  resolveHits(zombies) {
    let gold = 0;
    let kills = 0;
    const half = BULLET_SIZE / 2 + 2; // slight forgiveness

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const bx = b.gfx.x;
      const by = b.gfx.y;
      let hit = false;

      for (const z of zombies) {
        if (!z.alive) continue;
        const bounds = z.getBounds();
        if (
          bx + half >= bounds.left &&
          bx - half <= bounds.right &&
          by + half >= bounds.top &&
          by - half <= bounds.bottom
        ) {
          const killed = z.takeDamage(b.damage);
          if (killed) {
            gold += z.goldValue;
            kills += 1;
          }
          if (b.kind === 'shotgun') {
            const splash = this.weapons.applyShotgunSplash(z, b.vx, b.vy, zombies);
            gold += splash.gold;
            kills += splash.kills;
          }
          hit = true;
          break;
        }
      }

      if (hit) {
        b.gfx.destroy();
        this.bullets.splice(i, 1);
      }
    }

    return { gold, kills };
  }

  destroy() {
    for (const b of this.bullets) b.gfx.destroy();
    this.bullets = [];
    this.player.destroy();
    this.turret.destroy();
    this.turretBarrel.destroy();
  }
}
