import { BULLET_SPEED, BULLET_SIZE, GAME_WIDTH } from '../data/waves.js';
import { GAME_CONFIG } from '../data/GameConfig.js';
import {
  depthFromY,
  spawnWorldX,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  LAYOUT_SCALE,
  layoutPx,
} from './DepthView.js';
import { DAMAGE_COLORS, showDamageText } from '../ui/damageText.js';

/** @typedef {'Handgun'|'Shotgun'} WeaponId */

export const WEAPON_HANDGUN = /** @type {WeaponId} */ ('Handgun');
export const WEAPON_SHOTGUN = /** @type {WeaponId} */ ('Shotgun');

const HANDGUN_CFG = GAME_CONFIG.WEAPONS.HANDGUN;
const SHOTGUN_CFG = GAME_CONFIG.WEAPONS.SHOTGUN;

/** Handgun: auto-fire every 0.5s, single bullet, damage from GAME_CONFIG (30). */
export const HANDGUN_FIRE_MS = HANDGUN_CFG.FIRE_RATE;
export const HANDGUN_DAMAGE = HANDGUN_CFG.DAMAGE;
/** Horizontal shove on a direct handgun hit. Lane Y is unchanged. */
export const HANDGUN_KNOCKBACK = HANDGUN_CFG.KNOCKBACK;

/**
 * Full-screen reference length (viewport width). The handgun bullet itself
 * has no maxDistance — it flies until it hits or leaves the view.
 * Shotgun pellets use a quarter of this. On the 800-wide field that was
 * 200px; on 1280 it is 320px, the same fraction of the march.
 */
export const HANDGUN_EFFECTIVE_RANGE = GAME_WIDTH;

/**
 * Shotgun: auto-fire every 2.0s. Each shot is a 70° fan of 16–20 pellets
 * centered on straight left (180°), not a single slug and not a rearward splash.
 * Per-pellet damage is lower than the old 40-point slug so hits stack at close
 * range instead of each grain one-shotting a wave. Knockback is slightly under
 * the handgun's 10 so a faceful shoves harder than one pistol round.
 * PELLETS (18) is the midpoint; the volley rolls PELLETS_MIN–PELLETS_MAX.
 */
export const SHOTGUN_FIRE_MS = SHOTGUN_CFG.FIRE_RATE;
export const SHOTGUN_PELLET_DAMAGE = SHOTGUN_CFG.PELLET_DAMAGE;
export const SHOTGUN_PELLET_KNOCKBACK = SHOTGUN_CFG.PELLET_KNOCKBACK;
export const SHOTGUN_PELLET_MIN = SHOTGUN_CFG.PELLETS_MIN ?? SHOTGUN_CFG.PELLETS;
export const SHOTGUN_PELLET_MAX = SHOTGUN_CFG.PELLETS_MAX ?? SHOTGUN_CFG.PELLETS;
export const SHOTGUN_PELLET_SIZE = 4;
/** Half of the fan, centered on 180° (straight left). */
export const SHOTGUN_FAN_HALF_DEG = SHOTGUN_CFG.SPREAD_ANGLE / 2;
export const SHOTGUN_FAN_HALF_RAD = (SHOTGUN_FAN_HALF_DEG * Math.PI) / 180;
/** Straight left in screen space (0° is +X, +Y is down). */
export const SHOTGUN_CENTER_ANGLE = Math.PI;
/** ± this fraction of BULLET_SPEED, rolled per pellet. */
export const SHOTGUN_SPEED_SPREAD = 0.08;
export const SHOTGUN_MAX_DISTANCE = HANDGUN_EFFECTIVE_RANGE * SHOTGUN_CFG.RANGE_RATIO;
export const SHOTGUN_VFX_MS = SHOTGUN_CFG.MUZZLE_VFX_MS;
/** Short muzzle flash; pellets themselves show the travel. */
export const SHOTGUN_MUZZLE_VFX_RADIUS = 48;

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
 * Owns weapon state, nearest-enemy targeting, fire cadence, and ballistics.
 * DefenderGroup pushes bullets / applies hits and plays shotgun recoil.
 * StageScene toggles SPACE, HUD, and the one-per-volley camera shake.
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
    /** @type {{ gfx: Phaser.GameObjects.Rectangle, vx: number, vy: number, life: number, max: number, spin: number }[]} */
    this._casings = [];
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
   * Living zombie with a body and the smallest distance to (x, y), or null.
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {number} x
   * @param {number} y
   */
  findNearest(zombies, x, y) {
    let best = null;
    let bestDist = Infinity;
    const list = Array.isArray(zombies) ? zombies : [];
    for (const z of list) {
      if (!z?.alive || !z.body) continue;
      const zx = z.x;
      const zy = z.y;
      if (!Number.isFinite(zx) || !Number.isFinite(zy)) continue;
      const dist = Phaser.Math.Distance.Between(x, y, zx, zy);
      if (dist < bestDist) {
        bestDist = dist;
        best = z;
      }
    }
    return best;
  }

  /**
   * Unit aim velocity toward target, or straight left (180°, −X) if none.
   * @param {number} fromX
   * @param {number} fromY
   * @param {{ x: number, y: number }|null} target
   * @returns {{ vx: number, vy: number }}
   */
  aimVelocity(fromX, fromY, target) {
    // Field px/s, scaled so flight time matches the 800-wide field.
    const speed = BULLET_SPEED * LAYOUT_SCALE;
    const straightLeft = { vx: -speed, vy: 0 };
    if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) {
      return straightLeft;
    }
    const dx = target.x - fromX;
    const dy = target.y - fromY;
    const len = Math.hypot(dx, dy);
    if (!(len > 0) || !Number.isFinite(len)) return straightLeft;
    return {
      vx: (dx / len) * speed,
      vy: (dy / len) * speed,
    };
  }

  /**
   * Muzzle in world px. Offsets in GameConfig are frame px from the sole;
   * `scaleX/scaleY` are the defender display scale (includes LAYOUT_SCALE).
   * Never the sprite origin alone.
   * @param {number} playerX
   * @param {number} playerY
   * @param {number} [scaleX]
   * @param {number} [scaleY]
   */
  muzzlePoint(playerX, playerY, scaleX, scaleY) {
    const cfg = this.weapon === WEAPON_SHOTGUN ? SHOTGUN_CFG : HANDGUN_CFG;
    const sx = Number.isFinite(scaleX) && scaleX !== 0 ? Math.abs(scaleX) : LAYOUT_SCALE;
    const sy = Number.isFinite(scaleY) && scaleY !== 0 ? Math.abs(scaleY) : LAYOUT_SCALE;
    return {
      x: playerX + (cfg.MUZZLE_OFFSET_X ?? 0) * sx,
      y: playerY + (cfg.MUZZLE_OFFSET_Y ?? 0) * sy,
    };
  }

  /**
   * Tick player weapon cadence; may push bullets into `bullets`.
   * Handgun: one slug from the handgun muzzle, including while the defender moves.
   * Shotgun: one 16–20 pellet fan from the shotgun muzzle, only when
   * `canFireShotgun` is not false (caller blocks this while a lane key is held
   * or the post-fire move lock is active).
   * Returns which weapon actually fired this call, once per volley.
   * @param {number} deltaMs
   * @param {number} playerX
   * @param {number} playerY
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {object[]} bullets
   * @param {{ scaleX?: number, scaleY?: number, canFireShotgun?: boolean }} [opts]
   * @returns {'shotgun'|'handgun'|null}
   */
  updatePlayerFire(deltaMs, playerX, playerY, zombies, bullets, opts = {}) {
    this._playerCooldown -= deltaMs;
    if (this._playerCooldown > 0) return null;
    if (!Array.isArray(bullets)) return null;

    const muzzle = this.muzzlePoint(playerX, playerY, opts.scaleX, opts.scaleY);

    if (this.weapon === WEAPON_SHOTGUN) {
      if (opts.canFireShotgun === false) {
        this._playerCooldown = 0;
        return null;
      }
      this._playerCooldown = SHOTGUN_FIRE_MS;
      this._spawnShotgunFan(bullets, muzzle.x, muzzle.y);
      this._spawnMuzzleFlash(muzzle.x, muzzle.y);
      this._spawnShellCasing(muzzle.x, muzzle.y);
      return 'shotgun';
    }

    this._playerCooldown = HANDGUN_FIRE_MS;
    const living = (Array.isArray(zombies) ? zombies : []).filter(
      (z) => z?.alive && z.body
    );
    const target = this.findNearest(living, playerX, playerY);
    const { vx, vy } = this.aimVelocity(muzzle.x, muzzle.y, target);
    this._spawnBullet(bullets, muzzle.x, muzzle.y, vx, vy, {
      damage: HANDGUN_DAMAGE,
      kind: 'handgun',
      size: layoutPx(HANDGUN_CFG.BULLET_W),
      maxDistance: null,
      knockback: HANDGUN_KNOCKBACK,
    });
    this._spawnMuzzleFlash(muzzle.x, muzzle.y);
    return 'handgun';
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
    if (!Array.isArray(bullets)) return;

    this._petCooldown = PET_AOE_INTERVAL_MS;

    const living = (Array.isArray(zombies) ? zombies : []).filter(
      (z) => z?.alive && z.body
    );
    const nearest = this.findNearest(living, petX, petY);
    if (!nearest) return;

    const fromX = petX - 10 * LAYOUT_SCALE;
    const fromY = petY;
    const { vx, vy } = this.aimVelocity(fromX, fromY, nearest);
    this._spawnBullet(bullets, fromX, fromY, vx, vy, {
      damage: PET_BULLET_DAMAGE,
      kind: 'pet',
      size: Math.max(6, BULLET_SIZE - 1) * LAYOUT_SCALE,
      maxDistance: null,
      knockback: 0,
    });
  }

  /**
   * Integrate bullet motion. Shotgun pellets accumulate travel for maxDistance.
   * Handgun and PetBullet are uncapped (retired only when they leave the view).
   * @param {object[]} bullets
   * @param {number} deltaSec
   */
  stepBullets(bullets, deltaSec) {
    if (!Array.isArray(bullets)) return;
    const dt = Number.isFinite(deltaSec) ? deltaSec : 0;
    for (const b of bullets) {
      if (!b?.gfx || b.gfx.active === false) continue;
      const dx = (Number.isFinite(b.vx) ? b.vx : 0) * dt;
      const dy = (Number.isFinite(b.vy) ? b.vy : 0) * dt;
      b.gfx.x += dx;
      b.gfx.y += dy;
      if (b.maxDistance != null) {
        b.traveled = (b.traveled || 0) + Math.hypot(dx, dy);
      }
      if (b.kind === 'handgun') {
        if (typeof b.gfx.setRotation === 'function') {
          b.gfx.setRotation(Math.atan2(b.vy, b.vx));
        }
        this._drawHandgunTrail(b);
      }
      if (typeof b.gfx.setDepth === 'function') {
        b.gfx.setDepth(depthFromY(b.gfx.y));
      }
    }
  }

  /**
   * Integrate ejected shotgun casings (arc under gravity, then fade).
   * @param {number} deltaMs
   */
  stepCasings(deltaMs) {
    if (!this._casings?.length) return;
    const dt = (Number.isFinite(deltaMs) ? deltaMs : 0) / 1000;
    const gravity = SHOTGUN_CFG.CASING_GRAVITY * LAYOUT_SCALE;
    const alive = [];
    for (const c of this._casings) {
      if (!c?.gfx || c.gfx.active === false) continue;
      c.life -= deltaMs;
      if (c.life <= 0) {
        this._safeDestroyGraphics(c.gfx);
        continue;
      }
      c.vy += gravity * dt;
      c.gfx.x += c.vx * dt;
      c.gfx.y += c.vy * dt;
      c.gfx.rotation += c.spin * dt;
      c.gfx.setAlpha(Math.max(0, c.life / c.max));
      if (typeof c.gfx.setDepth === 'function') {
        c.gfx.setDepth(depthFromY(c.gfx.y, 3));
      }
      alive.push(c);
    }
    this._casings = alive;
  }

  /** Drop leftover flash/casing objects. Scene shutdown also destroys them. */
  destroyEffects() {
    for (const c of this._casings || []) this._safeDestroyGraphics(c?.gfx);
    this._casings = [];
  }

  /**
   * True when a bullet should be removed without a hit:
   * shotgun pellets past maxDistance, anything that left the playable view,
   * or a graphic that is already gone.
   * @param {object} b
   */
  shouldRetireBullet(b) {
    if (!b?.gfx || b.gfx.active === false) return true;
    if (
      b.maxDistance != null &&
      Number.isFinite(b.maxDistance) &&
      (b.traveled || 0) >= b.maxDistance
    ) {
      return true;
    }
    const x = b.gfx.x;
    const y = b.gfx.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
    const leftCull = spawnWorldX() - 50 * LAYOUT_SCALE;
    if (x < leftCull || x > WORLD_WIDTH + 40 * LAYOUT_SCALE) return true;
    if (y < -30 * LAYOUT_SCALE || y > WORLD_HEIGHT + 30 * LAYOUT_SCALE) return true;
    return false;
  }

  /**
   * Direct handgun or shotgun-pellet hit. Filter is the caller's job;
   * this no-ops if the zombie is already dead or its body is gone.
   * Knockback is applied only while the body still exists.
   * @param {import('../entities/Zombie.js').Zombie} zombie
   * @param {{ damage?: number, kind?: string, knockback?: number }} bullet
   * @returns {{ gold: number, kills: number }}
   */
  applyDirectHit(zombie, bullet) {
    if (!zombie?.alive || !zombie.body || !bullet) {
      return { gold: 0, kills: 0 };
    }
    const damage = Number(bullet.damage);
    if (!Number.isFinite(damage) || damage < 0) {
      return { gold: 0, kills: 0 };
    }

    const hx = zombie.x;
    const hy = zombie.y - (zombie.displayHalf || 0);
    const goldVal = zombie.goldValue || 0;
    const knockback = Number(bullet.knockback);
    if (knockback > 0 && typeof zombie.applyKnockback === 'function') {
      zombie.applyKnockback(knockback * LAYOUT_SCALE);
    }
    // Knockback must not be followed by a touch of a destroyed body.
    if (!zombie.alive || !zombie.body) {
      return { gold: 0, kills: 0 };
    }

    const killed = zombie.takeDamage(damage);
    const color =
      bullet.kind === 'shotgun' ? DAMAGE_COLORS.shotgun : DAMAGE_COLORS.handgun;
    showDamageText(this.scene, hx, hy, damage, color);
    if (killed) return { gold: goldVal, kills: 1 };
    return { gold: 0, kills: 0 };
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

    const list = Array.isArray(zombies) ? zombies : [];
    const eligible = list.filter((z) => {
      if (!z?.alive || !z.body) return false;
      const dist = Phaser.Math.Distance.Between(cx, cy, z.x, z.y);
      return dist <= PET_AOE_RADIUS * LAYOUT_SCALE;
    });

    let gold = 0;
    let kills = 0;
    for (const z of eligible) {
      if (!z.alive || !z.body) continue;
      const hx = z.x;
      const hy = z.y - z.displayHalf;
      const goldVal = z.goldValue;
      const killed = z.takeDamage(PET_AOE_DAMAGE);
      showDamageText(this.scene, hx, hy, PET_AOE_DAMAGE, DAMAGE_COLORS.pet);
      if (killed) {
        gold += goldVal;
        kills += 1;
      }
    }
    return { gold, kills };
  }

  /**
   * @param {object[]} bullets
   * @param {number} x
   * @param {number} y
   */
  _spawnShotgunFan(bullets, x, y) {
    const count = Phaser.Math.Between(SHOTGUN_PELLET_MIN, SHOTGUN_PELLET_MAX);
    for (let i = 0; i < count; i++) {
      const spread = Phaser.Math.FloatBetween(
        -SHOTGUN_FAN_HALF_RAD,
        SHOTGUN_FAN_HALF_RAD
      );
      const angle = SHOTGUN_CENTER_ANGLE + spread;
      const speed =
        BULLET_SPEED *
        LAYOUT_SCALE *
        Phaser.Math.FloatBetween(1 - SHOTGUN_SPEED_SPREAD, 1 + SHOTGUN_SPEED_SPREAD);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      this._spawnBullet(bullets, x, y, vx, vy, {
        damage: SHOTGUN_PELLET_DAMAGE,
        kind: 'shotgun',
        size: SHOTGUN_PELLET_SIZE * LAYOUT_SCALE,
        maxDistance: SHOTGUN_MAX_DISTANCE,
        knockback: SHOTGUN_PELLET_KNOCKBACK,
      });
    }
    this._drawShotgunFan(x, y);
  }

  /**
   * @param {object[]} bullets
   * @param {number} x
   * @param {number} y
   * @param {number} vx
   * @param {number} vy
   * @param {{ damage: number, kind: 'handgun'|'shotgun'|'pet', size?: number, maxDistance?: number|null, knockback?: number }} meta
   */
  _spawnBullet(bullets, x, y, vx, vy, meta) {
    let color = 0x40c4ff;
    let size = meta.size ?? BULLET_SIZE;
    let gfx;
    /** @type {Phaser.GameObjects.Graphics|null} */
    let trail = null;
    if (meta.kind === 'handgun') {
      color = 0xffe14a;
      const w = layoutPx(HANDGUN_CFG.BULLET_W);
      const h = layoutPx(HANDGUN_CFG.BULLET_H);
      size = w;
      gfx = this.scene.add.rectangle(x, y, w, h, color);
      gfx.setRotation(Math.atan2(vy, vx));
      trail = this.scene.add.graphics();
      trail.setDepth(depthFromY(y));
    } else if (meta.kind === 'shotgun') {
      color = 0xffaa00;
      size = meta.size ?? SHOTGUN_PELLET_SIZE;
      gfx = this.scene.add.rectangle(x, y, size, size, color);
      gfx.setStrokeStyle(1, 0xfff3e0);
    } else if (meta.kind === 'pet') {
      // PIXELLAB_HOOK: replace with sprite PetBullet
      color = 0xb388ff; // purple/cyan pet projectile
      size = meta.size ?? Math.max(6, BULLET_SIZE - 1) * LAYOUT_SCALE;
      gfx = this.scene.add.rectangle(x, y, size, size, color);
      gfx.setStrokeStyle(1, 0x42a5f5);
    } else {
      gfx = this.scene.add.rectangle(x, y, size, size, color);
    }
    gfx.setDepth(depthFromY(y));
    bullets.push({
      gfx,
      trail,
      trailPts: [],
      damage: meta.damage,
      vx,
      vy,
      kind: meta.kind,
      size,
      maxDistance: meta.maxDistance == null ? null : meta.maxDistance,
      traveled: 0,
      knockback: meta.knockback || 0,
    });
  }

  /**
   * Short fading streak behind the handgun slug.
   * @param {object} b
   */
  _drawHandgunTrail(b) {
    const g = b?.trail;
    if (!g || g.active === false || typeof g.clear !== 'function') return;
    if (!b.trailPts) b.trailPts = [];
    b.trailPts.push({ x: b.gfx.x, y: b.gfx.y });
    const maxPts = 5;
    if (b.trailPts.length > maxPts) {
      b.trailPts.splice(0, b.trailPts.length - maxPts);
    }
    g.clear();
    const pts = b.trailPts;
    for (let i = 1; i < pts.length; i++) {
      const t = i / (pts.length - 1);
      g.lineStyle(Math.max(1, layoutPx(1)), 0xffe14a, 0.08 + t * 0.22);
      g.beginPath();
      g.moveTo(pts[i - 1].x, pts[i - 1].y);
      g.lineTo(pts[i].x, pts[i].y);
      g.strokePath();
    }
    if (typeof g.setDepth === 'function') g.setDepth(depthFromY(b.gfx.y));
  }

  /**
   * Yellow-white flash at the muzzle. Fades in MUZZLE_FLASH_MS (~50ms).
   * @param {number} x
   * @param {number} y
   */
  _spawnMuzzleFlash(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!this.scene?.add?.rectangle) return;
    const ms = GAME_CONFIG.VFX.MUZZLE_FLASH_MS;
    const flash = this.scene.add.rectangle(x, y, layoutPx(11), layoutPx(7), 0xfff6d0);
    flash.setDepth(depthFromY(y, 6));
    const tween = this.scene.tweens?.add?.({
      targets: flash,
      alpha: 0,
      duration: ms,
      onComplete: () => this._safeDestroyGraphics(flash),
    });
    if (!tween && this.scene.time?.delayedCall) {
      this.scene.time.delayedCall(ms, () => this._safeDestroyGraphics(flash));
    }
  }

  /**
   * Yellow shell from the shotgun muzzle. +X / −Y then gravity, fading out.
   * @param {number} x
   * @param {number} y
   */
  _spawnShellCasing(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!this.scene?.add?.rectangle) return;
    const cfg = SHOTGUN_CFG;
    const gfx = this.scene.add.rectangle(
      x + cfg.CASING_OFFSET_X * LAYOUT_SCALE,
      y + cfg.CASING_OFFSET_Y * LAYOUT_SCALE,
      Math.max(2, layoutPx(cfg.CASING_W)),
      Math.max(1, layoutPx(cfg.CASING_H)),
      0xffe14a
    );
    gfx.setDepth(depthFromY(y, 4));
    gfx.setRotation(-0.6);
    this._casings.push({
      gfx,
      vx: cfg.CASING_VEL_X * LAYOUT_SCALE,
      vy: cfg.CASING_VEL_Y * LAYOUT_SCALE,
      life: cfg.CASING_LIFE_MS,
      max: cfg.CASING_LIFE_MS,
      spin: 9,
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
   * Brief translucent orange 70° muzzle fan aimed straight left.
   * Always force-destroys after SHOTGUN_VFX_MS.
   * @param {number} x
   * @param {number} y
   */
  _drawShotgunFan(x, y) {
    // PIXELLAB_HOOK: replace with sprite shotgun fan VFX
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!this.scene?.add?.graphics) return;

    const mid = SHOTGUN_CENTER_ANGLE;
    const start = mid - SHOTGUN_FAN_HALF_RAD;
    const end = mid + SHOTGUN_FAN_HALF_RAD;
    const g = this.scene.add.graphics();
    g.fillStyle(0xffaa00, 0.35);
    g.beginPath();
    g.moveTo(x, y);
    g.arc(x, y, SHOTGUN_MUZZLE_VFX_RADIUS * LAYOUT_SCALE, start, end, false);
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
    const radius = PET_AOE_RADIUS * LAYOUT_SCALE;
    g.lineStyle(3 * LAYOUT_SCALE, 0x7e57c2, 0.85);
    g.strokeCircle(x, y, radius);
    g.fillStyle(0x42a5f5, 0.22);
    g.fillCircle(x, y, radius);
    g.setDepth(depthFromY(y, 5));
    this.scene.time.delayedCall(PET_AOE_VFX_MS, () => {
      this._safeDestroyGraphics(g);
    });
  }
}
