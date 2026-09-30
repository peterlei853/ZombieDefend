import {
  PLAYER_BULLET_DAMAGE,
  BULLET_SPEED,
  BULLET_SIZE,
} from '../data/waves.js';
import { depthFromY } from './DepthView.js';

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

/** Pet AOE pulse every 1.0s: 80px radius centered on nearest zombie, damage 28. */
export const PET_AOE_INTERVAL_MS = 1000;
export const PET_AOE_RADIUS = 80;
export const PET_AOE_DAMAGE = 28;
export const PET_AOE_VFX_MS = 180;

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
   * Tick pet AOE every 1.0s: damage circle centered on nearest zombie to pet.
   * @param {number} deltaMs
   * @param {number} petX
   * @param {number} petY
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @returns {{ gold: number, kills: number }}
   */
  updatePetAoe(deltaMs, petX, petY, zombies) {
    this._petCooldown -= deltaMs;
    if (this._petCooldown > 0) return { gold: 0, kills: 0 };

    this._petCooldown = PET_AOE_INTERVAL_MS;

    const living = zombies.filter((z) => z.alive);
    const nearest = this.findNearest(living, petX, petY);
    if (!nearest) return { gold: 0, kills: 0 };

    const cx = nearest.x;
    const cy = nearest.y;
    this._drawPetAoeRing(cx, cy);

    let gold = 0;
    let kills = 0;
    for (const z of living) {
      if (!z.alive) continue;
      const dist = Phaser.Math.Distance.Between(cx, cy, z.x, z.y);
      if (dist > PET_AOE_RADIUS) continue;
      const killed = z.takeDamage(PET_AOE_DAMAGE);
      if (killed) {
        gold += z.goldValue;
        kills += 1;
      }
    }
    return { gold, kills };
  }

  /**
   * After a shotgun bullet's first zombie hit: rearward 90° cone splash.
   * Cone axis = opposite of bullet incoming velocity; apex = hit zombie.
   * @param {import('../entities/Zombie.js').Zombie} hitZombie
   * @param {number} bulletVx
   * @param {number} bulletVy
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @returns {{ gold: number, kills: number }}
   */
  applyShotgunSplash(hitZombie, bulletVx, bulletVy, zombies) {
    const apexX = hitZombie.x;
    const apexY = hitZombie.y;

    // Opposite of bullet incoming direction (rearward relative to impact)
    const invLen = 1 / (Math.hypot(bulletVx, bulletVy) || 1);
    const axisX = -bulletVx * invLen;
    const axisY = -bulletVy * invLen;

    this._drawShotgunFan(apexX, apexY, axisX, axisY);

    const cosHalf = Math.cos(SHOTGUN_SPLASH_HALF_ANGLE_RAD);
    let gold = 0;
    let kills = 0;

    for (const z of zombies) {
      if (!z.alive || z === hitZombie) continue;
      const dx = z.x - apexX;
      const dy = z.y - apexY;
      const dist = Math.hypot(dx, dy);
      if (dist > SHOTGUN_SPLASH_RADIUS || dist < 0.001) continue;
      const dot = (dx / dist) * axisX + (dy / dist) * axisY;
      if (dot < cosHalf) continue;

      const killed = z.takeDamage(SHOTGUN_SPLASH_DAMAGE);
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
   * @param {{ damage: number, kind: 'handgun'|'shotgun' }} meta
   */
  _spawnBullet(bullets, x, y, vx, vy, meta) {
    // PIXELLAB_HOOK: replace with sprite bullet
    const color = meta.kind === 'shotgun' ? 0xffcc66 : 0x40c4ff;
    const gfx = this.scene.add.rectangle(x, y, BULLET_SIZE, BULLET_SIZE, color);
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
   * Temporary translucent yellow 90° sector (shotgun blast viz).
   * @param {number} x
   * @param {number} y
   * @param {number} axisX
   * @param {number} axisY
   */
  _drawShotgunFan(x, y, axisX, axisY) {
    // PIXELLAB_HOOK: replace with sprite shotgun fan VFX
    const mid = Math.atan2(axisY, axisX);
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
      if (g.active) g.destroy();
    });
  }

  /**
   * Brief purple/blue AOE ring centered on the target zombie.
   * @param {number} x
   * @param {number} y
   */
  _drawPetAoeRing(x, y) {
    // PIXELLAB_HOOK: replace with sprite pet AOE ring VFX
    const g = this.scene.add.graphics();
    g.lineStyle(3, 0x7e57c2, 0.85);
    g.strokeCircle(x, y, PET_AOE_RADIUS);
    g.fillStyle(0x42a5f5, 0.22);
    g.fillCircle(x, y, PET_AOE_RADIUS);
    g.setDepth(depthFromY(y, 5));
    this.scene.time.delayedCall(PET_AOE_VFX_MS, () => {
      if (g.active) g.destroy();
    });
  }
}
