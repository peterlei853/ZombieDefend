import {
  PLAYER_BULLET_DAMAGE,
  BULLET_SPEED,
  BULLET_SIZE,
} from '../data/waves.js';
import { depthFromY } from './DepthView.js';
import { DAMAGE_COLORS, showDamageText } from '../ui/damageText.js';

/** @typedef {'Handgun'|'Shotgun'} WeaponId */

export const WEAPON_HANDGUN = /** @type {WeaponId} */ ('Handgun');
export const WEAPON_SHOTGUN = /** @type {WeaponId} */ ('Shotgun');

/** Handgun: auto-fire every 0.5s, single bullet, damage = PLAYER_BULLET_DAMAGE (30). */
export const HANDGUN_FIRE_MS = 500;
export const HANDGUN_DAMAGE = PLAYER_BULLET_DAMAGE;

/**
 * Shotgun: auto-fire every 2.0s.
 * Direct hit damage 40; on first zombie hit, rearward 90° cone splash
 * (radius 120px, splash damage 22 ≈ 55% of direct).
 */
export const SHOTGUN_FIRE_MS = 2000;
export const SHOTGUN_DAMAGE = 40;
export const SHOTGUN_SPLASH_DAMAGE = 22;
export const SHOTGUN_SPLASH_RADIUS = 120;
export const SHOTGUN_SPLASH_HALF_ANGLE_RAD = Math.PI / 4; // 90° full cone
export const SHOTGUN_VFX_MS = 150;

/**
 * Pet: spawn PetBullet every 1.0s toward nearest zombie.
 * On hit: AOE radius 80px, damage 28 at impact point (not before collision).
 */
export const PET_AOE_INTERVAL_MS = 1000;
export const PET_AOE_RADIUS = 80;
export const PET_AOE_DAMAGE = 28;
export const PET_AOE_VFX_MS = 150;
/** PetBullet direct contact damage (AOE carries the real payload). */
export const PET_BULLET_DAMAGE = 0;

/**
 * Owns weapon state, nearest-enemy targeting, fire cadence, and splash / AOE math.
 * DefenderGroup pushes bullets / applies hits; StageScene only toggles SPACE + HUD.
 */
export class WeaponSystem {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    /** @type {WeaponId} */
    this.weapon = WEAPON_HANDGUN;
    this._playerCooldown = 0;
    this._petCooldown = 0;
  }

  /** @returns {WeaponId} */
  getWeapon() {
    return this.weapon;
  }

  /** HUD label, e.g. `Weapon: Handgun`. */
  getWeaponLabel() {
    return `Weapon: ${this.weapon}`;
  }

  /** Toggle Handgun ↔ Shotgun. @returns {WeaponId} */
  toggleWeapon() {
    this.weapon =
      this.weapon === WEAPON_HANDGUN ? WEAPON_SHOTGUN : WEAPON_HANDGUN;
    return this.weapon;
  }

  /**
   * Living zombie with smallest Phaser distance to (x, y), or null.
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {number} x
   * @param {number} y
   */
  findNearest(zombies, x, y) {
    let best = null;
    let bestDist = Infinity;
    for (const z of zombies) {
      if (!z.alive) continue;
      const dist = Phaser.Math.Distance.Between(x, y, z.x, z.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = z;
      }
    }
    return best;
  }

  /**
   * Unit aim velocity toward target, or straight left if none.
   * @param {number} fromX
   * @param {number} fromY
   * @param {{ x: number, y: number }|null} target
   * @returns {{ vx: number, vy: number }}
   */
  aimVelocity(fromX, fromY, target) {
    if (!target) {
      return { vx: -BULLET_SPEED, vy: 0 };
    }
    const dx = target.x - fromX;
    const dy = target.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    return {
      vx: (dx / len) * BULLET_SPEED,
      vy: (dy / len) * BULLET_SPEED,
    };
  }

  /**
   * Tick player weapon cadence; may push a bullet into `bullets`.
   * @param {number} deltaMs
   * @param {number} playerX
   * @param {number} playerY
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {object[]} bullets
   */
  updatePlayerFire(deltaMs, playerX, playerY, zombies, bullets) {
    this._playerCooldown -= deltaMs;
    if (this._playerCooldown > 0) return;

    const living = zombies.filter((z) => z.alive);
    const target = this.findNearest(living, playerX, playerY);
    // Fire even with no target (aim left); always spend the interval
    const fromX = playerX - 10;
    const fromY = playerY;
    const { vx, vy } = this.aimVelocity(fromX, fromY, target);

    if (this.weapon === WEAPON_SHOTGUN) {
      this._spawnBullet(bullets, fromX, fromY, vx, vy, {
        damage: SHOTGUN_DAMAGE,
        kind: 'shotgun',
      });
      this._playerCooldown = SHOTGUN_FIRE_MS;
    } else {
      this._spawnBullet(bullets, fromX, fromY, vx, vy, {
        damage: HANDGUN_DAMAGE,
        kind: 'handgun',
      });
      this._playerCooldown = HANDGUN_FIRE_MS;
    }
  }

  /**
   * Tick pet every 1.0s: spawn PetBullet toward nearest living zombie (no AOE yet).
   * @param {number} deltaMs
   * @param {number} petX
   * @param {number} petY
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {object[]} bullets
   */
  updatePetFire(deltaMs, petX, petY, zombies, bullets) {
    this._petCooldown -= deltaMs;
    if (this._petCooldown > 0) return;

    this._petCooldown = PET_AOE_INTERVAL_MS;

    const living = zombies.filter((z) => z.alive);
    const nearest = this.findNearest(living, petX, petY);
    if (!nearest) return;

    const fromX = petX - 10;
    const fromY = petY;
    const { vx, vy } = this.aimVelocity(fromX, fromY, nearest);
    this._spawnBullet(bullets, fromX, fromY, vx, vy, {
      damage: PET_BULLET_DAMAGE,
      kind: 'pet',
    });
  }

  /**
   * After a shotgun bullet's first zombie hit: rearward 90° cone splash.
   * Cone axis = opposite of bullet incoming velocity; apex = hit zombie.
   * Filter eligible targets first, then apply damage (never mutate mid-scan).
   * @param {import('../entities/Zombie.js').Zombie} hitZombie
   * @param {number} bulletVx
   * @param {number} bulletVy
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @returns {{ gold: number, kills: number }}
   */
  applyShotgunSplash(hitZombie, bulletVx, bulletVy, zombies) {
    if (!hitZombie || !hitZombie.alive) {
      return { gold: 0, kills: 0 };
    }

    const apexX = hitZombie.x;
    const apexY = hitZombie.y;

    const axisLen = Math.hypot(bulletVx, bulletVy);
    if (!(axisLen > 0) || !Number.isFinite(axisLen)) {
      // Still apply splash with default rearward axis (left) if velocity is unusable
      return this._applyShotgunSplashAt(apexX, apexY, 1, 0, hitZombie, zombies);
    }

    const invLen = 1 / axisLen;
    const axisX = -bulletVx * invLen;
    const axisY = -bulletVy * invLen;

    return this._applyShotgunSplashAt(apexX, apexY, axisX, axisY, hitZombie, zombies);
  }

  /**
   * @param {number} apexX
   * @param {number} apexY
   * @param {number} axisX
   * @param {number} axisY
   * @param {import('../entities/Zombie.js').Zombie} hitZombie
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @returns {{ gold: number, kills: number }}
   */
  _applyShotgunSplashAt(apexX, apexY, axisX, axisY, hitZombie, zombies) {
    this._drawShotgunFan(apexX, apexY, axisX, axisY);

    const cosHalf = Math.cos(SHOTGUN_SPLASH_HALF_ANGLE_RAD);

    // Collect eligible first — never takeDamage while iterating the live list for eligibility
    const eligible = zombies.filter((z) => {
      if (!z.alive || z === hitZombie) return false;
      const dx = z.x - apexX;
      const dy = z.y - apexY;
      const dist = Math.hypot(dx, dy);
      if (dist > SHOTGUN_SPLASH_RADIUS || dist < 0.001) return false;
      const dot = (dx / dist) * axisX + (dy / dist) * axisY;
      return dot >= cosHalf;
    });

    let gold = 0;
    let kills = 0;
    for (const z of eligible) {
      if (!z.alive) continue;
      const hx = z.x;
      const hy = z.y - z.displayHalf;
      const killed = z.takeDamage(SHOTGUN_SPLASH_DAMAGE);
      showDamageText(this.scene, hx, hy, SHOTGUN_SPLASH_DAMAGE, DAMAGE_COLORS.shotgun);
      if (killed) {
        gold += z.goldValue;
        kills += 1;
      }
    }
    return { gold, kills };
  }

  /**
   * PetBullet on-hit AOE at impact point. Filter-then-damage; VFX 150ms then force-destroy.
   * @param {number} cx
   * @param {number} cy
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @returns {{ gold: number, kills: number }}
   */
  applyPetAoe(cx, cy, zombies) {
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
      return { gold: 0, kills: 0 };
    }

    this._drawPetAoeRing(cx, cy);

    const eligible = zombies.filter((z) => {
      if (!z.alive) return false;
      const dist = Phaser.Math.Distance.Between(cx, cy, z.x, z.y);
      return dist <= PET_AOE_RADIUS;
    });

    let gold = 0;
    let kills = 0;
    for (const z of eligible) {
      if (!z.alive) continue;
      const hx = z.x;
      const hy = z.y - z.displayHalf;
      const killed = z.takeDamage(PET_AOE_DAMAGE);
      showDamageText(this.scene, hx, hy, PET_AOE_DAMAGE, DAMAGE_COLORS.pet);
      if (killed) {
        gold += z.goldValue;
        kills += 1;
      }
    }
    return { gold, kills };
  }

  /**
   * @param {object[]} bullets
   * @param {number} x
   * @param {number} y
   * @param {number} vx
   * @param {number} vy
   * @param {{ damage: number, kind: 'handgun'|'shotgun'|'pet' }} meta
   */
  _spawnBullet(bullets, x, y, vx, vy, meta) {
    let color = 0x40c4ff;
    if (meta.kind === 'shotgun') {
      color = 0xffcc66;
    } else if (meta.kind === 'pet') {
      // PIXELLAB_HOOK: replace with sprite PetBullet
      color = 0xb388ff; // purple/cyan pet projectile
    }
    const size = meta.kind === 'pet' ? Math.max(6, BULLET_SIZE - 1) : BULLET_SIZE;
    const gfx = this.scene.add.rectangle(x, y, size, size, color);
    if (meta.kind === 'pet') {
      gfx.setStrokeStyle(1, 0x42a5f5);
    }
    gfx.setDepth(depthFromY(y));
    bullets.push({
      gfx,
      damage: meta.damage,
      vx,
      vy,
      kind: meta.kind,
    });
  }

  /**
   * Safe unconditional graphics destroy (ignores already-destroyed / inactive).
   * @param {Phaser.GameObjects.Graphics|null|undefined} g
   */
  _safeDestroyGraphics(g) {
    if (!g) return;
    try {
      g.destroy();
    } catch (_) {
      /* already destroyed */
    }
  }

  /**
   * Temporary translucent yellow 90° sector (shotgun blast viz).
   * Skips VFX if axis length is 0 / NaN. Always force-destroys after SHOTGUN_VFX_MS.
   * @param {number} x
   * @param {number} y
   * @param {number} axisX
   * @param {number} axisY
   */
  _drawShotgunFan(x, y, axisX, axisY) {
    // PIXELLAB_HOOK: replace with sprite shotgun fan VFX
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!Number.isFinite(axisX) || !Number.isFinite(axisY)) return;
    const axisLen = Math.hypot(axisX, axisY);
    if (!(axisLen > 0)) return;

    const mid = Math.atan2(axisY, axisX);
    if (!Number.isFinite(mid)) return;

    const start = mid - SHOTGUN_SPLASH_HALF_ANGLE_RAD;
    const end = mid + SHOTGUN_SPLASH_HALF_ANGLE_RAD;
    const g = this.scene.add.graphics();
    g.fillStyle(0xffeb3b, 0.35);
    g.beginPath();
    g.moveTo(x, y);
    g.arc(x, y, SHOTGUN_SPLASH_RADIUS, start, end, false);
    g.closePath();
    g.fillPath();
    g.setDepth(depthFromY(y, 5));
    this.scene.time.delayedCall(SHOTGUN_VFX_MS, () => {
      this._safeDestroyGraphics(g);
    });
  }

  /**
   * Brief purple/blue AOE ring at impact. Always force-destroys after PET_AOE_VFX_MS (150ms).
   * @param {number} x
   * @param {number} y
   */
  _drawPetAoeRing(x, y) {
    // PIXELLAB_HOOK: replace with sprite pet AOE ring VFX
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const g = this.scene.add.graphics();
    g.lineStyle(3, 0x7e57c2, 0.85);
    g.strokeCircle(x, y, PET_AOE_RADIUS);
    g.fillStyle(0x42a5f5, 0.22);
    g.fillCircle(x, y, PET_AOE_RADIUS);
    g.setDepth(depthFromY(y, 5));
    this.scene.time.delayedCall(PET_AOE_VFX_MS, () => {
      this._safeDestroyGraphics(g);
    });
  }
}
