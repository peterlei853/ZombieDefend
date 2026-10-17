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
import { HERO_WEAPONS } from '../assets/heroLoadout.js';
import {
  FLAME_GROW_MS,
  FLAME_RANGE_MAX,
  FLAME_RANGE_START,
  WEAPON_TRAITS,
  forwardVelocity,
  orderWeapons,
  splitVelocities,
} from '../assets/heroDeploy.js';
import { aimRotation, libraryAsset, libraryFxDuration, playLibraryAnim, playLibraryFx } from '../assets/libraryAssets.js';
import {
  waterAimVelocity,
  waterImpactBeatMs,
  waterLeadAim,
  waterSheetFallback,
  waterSplashKey,
  pickWaterGuide,
} from '../assets/waterMounts.js';
import {
  slingAimVelocity,
  slingImpactBeatMs,
  slingImpactKey,
  slingSheetFallback,
} from '../assets/slingMounts.js';
import { slingBodyHitKey, zombieHitFxKey } from '../assets/zombieSprites.js';
import { pixelBodyFromSprite, spriteSweepContact } from './pixelTouch.js';
import { upgradedDamage } from '../data/shopList.js';

/**
 * Sling impact and profession overlays sort with the feet sprite, then sit
 * a few slots above it. Bias stays under one pixel of Y so a nearer lane
 * still wins. Scale is the field taper times this so a 48/64 sheet reads
 * on the body. The bright fx-sling-pellet sheet is used untinted.
 */
export const SLING_OVERLAY_DEPTH_BIAS = 6;
export const SLING_OVERLAY_SCALE = 1.75;

/**
 * Water on-hit burst. Same sheet as the lightning gun's impact
 * (sandbox key 4). Played once at the opaque-pixel contact.
 * No chain arc. Water splash, wet ground, and body-hit sheets stay off.
 */
export const WATER_HIT_FX = 'fx-lightning-impact';

/** @typedef {'Handgun'|'Shotgun'} WeaponId */

export const WEAPON_HANDGUN = /** @type {WeaponId} */ ('Handgun');
export const WEAPON_SHOTGUN = /** @type {WeaponId} */ ('Shotgun');

const HANDGUN_CFG = GAME_CONFIG.WEAPONS.HANDGUN;
const SHOTGUN_CFG = GAME_CONFIG.WEAPONS.SHOTGUN;

/** Handgun: auto-fire every 0.5s, single bullet, damage from GAME_CONFIG (30). */
export const HANDGUN_FIRE_MS = HANDGUN_CFG.FIRE_RATE;
export const HANDGUN_DAMAGE = HANDGUN_CFG.DAMAGE;
/** Horizontal shove on a direct handgun hit. Lane Y is unchanged. From JUICE. */
export const HANDGUN_KNOCKBACK = GAME_CONFIG.JUICE.KNOCKBACK_HANDGUN;

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
export const SHOTGUN_PELLET_KNOCKBACK = GAME_CONFIG.JUICE.KNOCKBACK_SHOTGUN;
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
 * Owns weapon state, nearest-enemy targeting, fire cadence, and ballistics.
 * DefenderGroup pushes bullets / applies hits and plays shotgun recoil.
 * Baby pets are PetCombat, not a bullet kind here.
 * StageScene toggles SPACE and the HUD. The camera does not shake.
 */
export class WeaponSystem {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    /** @type {WeaponId} */
    this.weapon = WEAPON_HANDGUN;
    /** Index into HERO_WEAPONS. Profile still drives this.weapon. */
    this._skinIndex = 0;
    /** Defender display scale captured at the last shot, for FX size. */
    this._visScale = LAYOUT_SCALE;
    this._playerCooldown = 0;
    /** @type {{ gfx: Phaser.GameObjects.Rectangle, vx: number, vy: number, life: number, max: number, spin: number }[]} */
    this._casings = [];
    /** Shop-order ids that deploy and fire together. */
    this._ownedIds = [];
    /** @type {Record<string, number>} Shop ranks. 0 leaves trait damage unchanged. */
    this._upgrades = {};
    /** @type {Record<string, number>} */
    this._cooldowns = {};
    this._visualScale = 1;
    this._wasFrontFire = false;
    this._flameMs = 0;
    this._flameTick = 0;
    this._flameRange = 0;
    /** @type {Phaser.GameObjects.Sprite|null} */
    this._flame = null;
    /** @type {{ zombie: import('../entities/Zombie.js').Zombie, sprite: Phaser.GameObjects.Sprite, key: string, life: number }[]} */
    this._follows = [];
    this._pending = { gold: 0, kills: 0 };
    /** @type {import('../entities/Zombie.js').Zombie[]} */
    this._liveZombies = [];
    /** @type {object[]|null} */
    this._liveBullets = null;
    /**
     * Water hits wait for the impact sheet. Each entry is the primary
     * plus splash victims, damaged together on the FX beat.
     * @type {{ life: number, hits: { zombie: import('../entities/Zombie.js').Zombie, damage: number, knock: boolean }[], knockbackBodies: number }[]}
     */
    this._waterBeats = [];
    /**
     * Sling hits wait for the impact sheet. HP and knockback land together.
     * @type {{ life: number, zombie: import('../entities/Zombie.js').Zombie, damage: number, knockbackBodies: number, streak: string|null }[]}
     */
    this._slingBeats = [];
  }

  /**
   * Guns that sit in the front arc and fire once deploy finishes.
   * @param {string[]|null|undefined} ids
   */
  setOwnedWeapons(ids) {
    this._ownedIds = orderWeapons(ids);
    this._cooldowns = {};
    const first = this._ownedIds[0];
    if (first) {
      const idx = HERO_WEAPONS.findIndex((w) => w.id === first);
      if (idx >= 0) {
        this._skinIndex = idx;
        const skin = HERO_WEAPONS[idx];
        this.weapon = skin.profile === 'shotgun' ? WEAPON_SHOTGUN : WEAPON_HANDGUN;
      }
    }
  }

  /**
   * Ranks bought in the shopping list. Missing ids stay at base damage.
   * @param {Record<string, number>|null|undefined} map
   */
  setUpgrades(map) {
    this._upgrades = { ...(map || {}) };
  }

  /**
   * @param {string} id
   * @param {number} base
   */
  _scaledDamage(id, base) {
    return upgradedDamage(base, this._upgrades?.[id] || 0);
  }

  /** @returns {string[]} */
  ownedIds() {
    return this._ownedIds.slice();
  }

  /**
   * Point the HUD skin at an owned gun. Damage tables stay on WEAPON_TRAITS.
   * Unknown or unowned ids are ignored.
   * @param {string|null|undefined} id
   * @returns {boolean}
   */
  selectOwned(id) {
    if (!id || !this._ownedIds.includes(id)) return false;
    const idx = HERO_WEAPONS.findIndex((w) => w.id === id);
    if (idx < 0) return false;
    this._skinIndex = idx;
    const skin = HERO_WEAPONS[idx];
    this.weapon = skin.profile === 'shotgun' ? WEAPON_SHOTGUN : WEAPON_HANDGUN;
    return true;
  }

  /** @returns {WeaponId} */
  getWeapon() {
    return this.weapon;
  }

  /**
   * Equipped library skin, or null when those sheets are not loaded
   * (legacy handgun / shotgun rectangles stay in that case).
   */
  getSkin() {
    const skin = HERO_WEAPONS[this._skinIndex] || HERO_WEAPONS[0];
    const tex = this.scene?.textures;
    if (!tex?.exists?.(skin.idle) && !tex?.exists?.('player-girl-idle')) return null;
    return skin;
  }

  /** HUD label. Library skins use their art name; otherwise Handgun / Shotgun. */
  getWeaponLabel() {
    const skin = this.getSkin();
    return `Weapon: ${skin ? skin.label : this.weapon}`;
  }

  /**
   * Cycle the six library weapons when their sheets are loaded.
   * Profiles alternate, so the first press is still single-shot → spread.
   * Without the library, this is the old Handgun ↔ Shotgun toggle.
   * @returns {WeaponId}
   */
  toggleWeapon() {
    // One owned gun (the ?weapon= immerse) stays equipped. SPACE and SWAP
    // do not walk the other five.
    if (this._ownedIds.length === 1) {
      const only = this._ownedIds[0];
      const idx = HERO_WEAPONS.findIndex((w) => w.id === only);
      if (idx >= 0) {
        this._skinIndex = idx;
        const skin = HERO_WEAPONS[idx];
        this.weapon = skin.profile === 'shotgun' ? WEAPON_SHOTGUN : WEAPON_HANDGUN;
      }
      return this.weapon;
    }
    const tex = this.scene?.textures;
    const library = tex?.exists?.('player-girl-idle') || tex?.exists?.(HERO_WEAPONS[0].idle);
    if (!library) {
      this.weapon = this.weapon === WEAPON_HANDGUN ? WEAPON_SHOTGUN : WEAPON_HANDGUN;
      return this.weapon;
    }
    const cycle = this._ownedIds.length ? this._ownedIds : HERO_WEAPONS.map((w) => w.id);
    const current = HERO_WEAPONS[this._skinIndex]?.id;
    const at = Math.max(0, cycle.indexOf(current));
    const nextId = cycle[(at + 1) % cycle.length];
    const idx = HERO_WEAPONS.findIndex((w) => w.id === nextId);
    this._skinIndex = idx >= 0 ? idx : 0;
    const skin = HERO_WEAPONS[this._skinIndex];
    this.weapon = skin.profile === 'shotgun' ? WEAPON_SHOTGUN : WEAPON_HANDGUN;
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
    if (opts.frontFloat) {
      return this._updateFrontFire(deltaMs, zombies, bullets, opts);
    }
    this._playerCooldown -= deltaMs;
    if (this._playerCooldown > 0) return null;
    if (!Array.isArray(bullets)) return null;

    const muzzle = this.muzzlePoint(playerX, playerY, opts.scaleX, opts.scaleY);
    const sx = Number.isFinite(opts.scaleX) ? Math.abs(opts.scaleX) : LAYOUT_SCALE;
    this._visScale = sx > 0 ? sx : LAYOUT_SCALE;

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
   * Integrate bullet motion. Shotgun pellets accumulate travel for maxDistance.
   * Handgun slugs are uncapped (retired only when they leave the view).
   * @param {object[]} bullets
   * @param {number} deltaSec
   */
  stepBullets(bullets, deltaSec) {
    if (!Array.isArray(bullets)) return;
    const dt = Number.isFinite(deltaSec) ? deltaSec : 0;
    for (const b of bullets) {
      if (!b?.gfx || b.gfx.active === false) continue;
      b.prevX = b.gfx.x;
      b.prevY = b.gfx.y;
      if (b.weaponId === 'water') this._guideWater(b);
      const dx = (Number.isFinite(b.vx) ? b.vx : 0) * dt;
      const dy = (Number.isFinite(b.vy) ? b.vy : 0) * dt;
      b.gfx.x += dx;
      b.gfx.y += dy;
      b.traveled = (b.traveled || 0) + Math.hypot(dx, dy);
      if (b.library && b.rotate && typeof b.gfx.setRotation === 'function') {
        b.gfx.setRotation(aimRotation(b.vx, b.vy, b.facing || 'west'));
      } else if (b.kind === 'handgun') {
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
    for (const f of this._follows || []) this._safeDestroyGraphics(f?.sprite);
    this._follows = [];
    this._waterBeats = [];
    this._slingBeats = [];
    this._destroyFlame();
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
  /**
   * Water hits when the projectile's opaque pixels meet the enemy's,
   * or when this step's opaque core crosses that box. `_guideWater`
   * keeps the shot on a living body so the cores actually meet.
   * The contact stays the pixel point for the lightning burst.
   * Other weapons keep the box test.
   * @param {object} bullet
   * @param {{ body?: object }} zombie
   * @returns {boolean}
   */
  confirmOpaqueHit(bullet, zombie) {
    if (bullet?.weaponId !== 'water') return true;
    const gfx = bullet.gfx;
    const enemy = zombie?.body;
    const from = Number.isFinite(bullet.prevX) && Number.isFinite(bullet.prevY)
      ? { x: bullet.prevX, y: bullet.prevY }
      : null;
    const point = spriteSweepContact(gfx, enemy, from);
    if (point) {
      bullet.touchX = point.x;
      bullet.touchY = point.y;
      return true;
    }
    // A failed texture read must not turn every overlapping shot into a miss.
    // The caller already required the sprite boxes to overlap.
    if (!pixelBodyFromSprite(gfx) || !pixelBodyFromSprite(enemy)) {
      if (Number.isFinite(gfx?.x) && Number.isFinite(gfx?.y)) {
        bullet.touchX = gfx.x;
        bullet.touchY = gfx.y;
        return true;
      }
    }
    return false;
  }

  /**
   * Keep a water shot pointed at a living body that is still west of it.
   * The same body is kept until it dies or the shot passes it; the next
   * one ahead is then used. Lead is refreshed every step so the opaque
   * core meets the chest instead of skimming past an empty intercept.
   * @param {object} bullet
   */
  _guideWater(bullet) {
    const gfx = bullet?.gfx;
    if (!gfx) return;
    const speed = Math.hypot(Number(bullet.vx) || 0, Number(bullet.vy) || 0);
    if (!(speed > 1)) return;
    const x = gfx.x;
    const y = gfx.y;
    const guide = pickWaterGuide(this._liveZombies, x, y, bullet.guideId);
    bullet.guideId = guide ? guide.id : null;
    if (!guide) return;
    const zy = Number.isFinite(guide.bodyCenterY) ? guide.bodyCenterY : guide.y;
    const vz = typeof guide.marchVx === 'function' ? guide.marchVx() : 0;
    const aim = waterLeadAim(x, y, guide.x, zy, vz, speed);
    const next = waterAimVelocity(x, y, aim, speed);
    bullet.vx = next.vx;
    bullet.vy = next.vy;
  }

  /**
   * Living zombies and the bullet list for splash, split, and chain.
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {object[]} bullets
   */
  armHits(zombies, bullets) {
    this._liveZombies = Array.isArray(zombies) ? zombies : [];
    this._liveBullets = Array.isArray(bullets) ? bullets : null;
  }

  /** Gold from the flame cone, which is not a bullet hit. */
  consumePending() {
    const pending = this._pending || { gold: 0, kills: 0 };
    this._pending = { gold: 0, kills: 0 };
    return pending;
  }

  /**
   * Freeze coats and burn overlays follow their zombie.
   * @param {number} deltaMs
   */
  stepOverlays(deltaMs) {
    const dt = Number.isFinite(deltaMs) ? deltaMs : 0;
    this._stepWaterBeats(dt);
    this._stepSlingBeats(dt);
    const alive = [];
    for (const f of this._follows || []) {
      f.life -= dt;
      if (f.life <= 0 || !f.zombie?.alive || !f.sprite?.active) {
        this._safeDestroyGraphics(f.sprite);
        continue;
      }
      f.sprite.setPosition(f.zombie.x, f.zombie.y);
      if (typeof f.sprite.setDepth === 'function') {
        f.sprite.setDepth(depthFromY(f.zombie.y, 4));
      }
      alive.push(f);
    }
    this._follows = alive;
  }

  applyDirectHit(zombie, bullet) {
    if (!zombie?.alive || !zombie.body || !bullet) {
      return { gold: 0, kills: 0 };
    }
    if (bullet.weaponId && WEAPON_TRAITS[bullet.weaponId]) {
      return this._applyFrontHit(zombie, bullet);
    }
    const damage = Number(bullet.damage);
    if (!Number.isFinite(damage) || damage < 0) {
      return { gold: 0, kills: 0 };
    }

    const hx = zombie.x;
    const hy = Number.isFinite(zombie.visualTop) ? zombie.visualTop : zombie.y - (zombie.displayHalf || 0);
    const goldVal = zombie.goldValue || 0;
    const knockback = Number(bullet.knockback);
    if (knockback > 0 && typeof zombie.applyKnockback === 'function') {
      zombie.applyKnockback(knockback * LAYOUT_SCALE);
    }
    // Knockback must not be followed by a touch of a destroyed body.
    if (!zombie.alive || !zombie.body) {
      return { gold: 0, kills: 0 };
    }

    this._spawnImpactFx(hx, hy, zombie);
    this._spawnSkinHit(zombie);
    const killed = zombie.takeDamage(damage, { kind: bullet.kind });
    if (damage > 0) this.scene.audio?.playHitImpact();
    const color =
      bullet.kind === 'shotgun' ? DAMAGE_COLORS.shotgun : DAMAGE_COLORS.handgun;
    // Per-pellet labels stepped left by knockback (~one digit) and read as
    // -100 / -1000 / -10000. Fold them into one capped floater. HP is per pellet.
    showDamageText(this.scene, hx, hy, damage, color, zombie.id);
    if (killed) return { gold: goldVal, kills: 1 };
    return { gold: 0, kills: 0 };
  }

  /**
   * Every owned gun, west only, and only while `opts.canFire` (stopped + deployed).
   * @param {number} deltaMs
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {object[]} bullets
   * @param {{ canFire?: boolean, muzzles?: { id: string, x: number, y: number }[], visualScale?: number }} opts
   * @returns {string|null} first weapon id that spawned a slug this call
   */
  _updateFrontFire(deltaMs, zombies, bullets, opts) {
    this.armHits(zombies, bullets);
    const dt = Number.isFinite(deltaMs) ? deltaMs : 0;
    this._visualScale =
      Number.isFinite(opts.visualScale) && opts.visualScale > 0 ? opts.visualScale : 1;
    const canFire = opts.canFire === true;
    const muzzles = new Map((opts.muzzles || []).map((m) => [m.id, m]));
    const waterSlot = opts.waterMount || null;
    if (!canFire || !Array.isArray(bullets)) {
      this._wasFrontFire = false;
      this._syncFlame(false, null, dt, zombies);
      return null;
    }
    if (opts.fenceOnly) return this._updateFenceFire(dt, zombies, bullets, opts);
    if (!this._wasFrontFire) {
      this._ownedIds.forEach((id, i) => {
        this._cooldowns[id] = i * 70;
      });
      this._flameMs = 0;
      this._flameTick = 0;
    }
    this._wasFrontFire = true;
    let fired = null;
    let flame = false;
    for (const id of this._ownedIds) {
      const trait = WEAPON_TRAITS[id];
      if (!trait) continue;
      if (id === 'water') {
        if (!waterSlot) continue;
        this._cooldowns[id] = (this._cooldowns[id] || 0) - dt;
        if (this._cooldowns[id] > 0) continue;
        this._cooldowns[id] = trait.fireMs;
        this._spawnWaterShot(bullets, waterSlot, zombies, trait);
        fired = fired || id;
        continue;
      }
      if (id === 'sling' && opts.slingFromMount) {
        const slingSlot = opts.slingMount || null;
        if (!slingSlot) continue;
        this._cooldowns[id] = (this._cooldowns[id] || 0) - dt;
        if (this._cooldowns[id] > 0) continue;
        this._cooldowns[id] = trait.fireMs;
        this._spawnSlingShot(bullets, slingSlot, zombies, trait);
        fired = fired || id;
        continue;
      }
      const muzzle = muzzles.get(id);
      if (!muzzle) continue;
      if (trait.continuous) {
        flame = true;
        this._syncFlame(true, muzzle, dt, zombies);
        continue;
      }
      this._cooldowns[id] = (this._cooldowns[id] || 0) - dt;
      if (this._cooldowns[id] > 0) continue;
      this._cooldowns[id] = trait.fireMs;
      const speed = BULLET_SPEED * LAYOUT_SCALE * (trait.speed || 1);
      const { vx, vy } = forwardVelocity(speed);
      this._spawnFrontBullet(bullets, muzzle.x, muzzle.y, vx, vy, trait, {
        split: trait.id === 'bubble',
        tier: trait.tier || null,
      });
      fired = fired || id;
    }
    if (!flame) this._syncFlame(false, null, dt, zombies);
    return fired;
  }

  /**
   * One mount, one gun. Water and sling keep their beat-timed shots.
   * Bubble, lightning, and frost reuse the front slug (split / chain / freeze).
   * Flame reuses the west cone. The shot aims at the nearest living enemy.
   * @param {number} dt
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {object[]} bullets
   * @param {{ fenceMount?: { weaponId?: string, muzzleX: number, muzzleY: number }|null }} opts
   * @returns {string|null}
   */
  _updateFenceFire(dt, zombies, bullets, opts) {
    if (!this._wasFrontFire) {
      this._ownedIds.forEach((id, i) => {
        this._cooldowns[id] = i * 70;
      });
      this._flameMs = 0;
      this._flameTick = 0;
    }
    this._wasFrontFire = true;
    const slot = opts.fenceMount || null;
    const id = slot && this._ownedIds.includes(slot.weaponId) ? slot.weaponId : null;
    const trait = id ? WEAPON_TRAITS[id] : null;
    if (!trait || !Number.isFinite(slot?.muzzleX) || !Number.isFinite(slot?.muzzleY)) {
      this._syncFlame(false, null, dt, zombies);
      return null;
    }
    if (trait.continuous) {
      this._syncFlame(true, { x: slot.muzzleX, y: slot.muzzleY }, dt, zombies);
      return null;
    }
    this._syncFlame(false, null, dt, zombies);
    this._cooldowns[id] = (this._cooldowns[id] || 0) - dt;
    if (this._cooldowns[id] > 0) return null;
    this._cooldowns[id] = trait.fireMs;
    if (id === 'water') {
      this._spawnWaterShot(bullets, slot, zombies, trait);
      return id;
    }
    if (id === 'sling') {
      this._spawnSlingShot(bullets, slot, zombies, trait);
      return id;
    }
    const speed = BULLET_SPEED * LAYOUT_SCALE * (trait.speed || 1);
    const target = this._nearestLiving(zombies, slot.muzzleX, slot.muzzleY);
    const aim = target
      ? {
          x: target.x,
          y: Number.isFinite(target.bodyCenterY) ? target.bodyCenterY : target.y,
        }
      : null;
    const { vx, vy } = waterAimVelocity(slot.muzzleX, slot.muzzleY, aim, speed);
    this._spawnFrontBullet(bullets, slot.muzzleX, slot.muzzleY, vx, vy, trait, {
      split: id === 'bubble',
      tier: trait.tier || null,
    });
    return id;
  }

  /**
   * @param {object[]} bullets
   * @param {number} x
   * @param {number} y
   * @param {number} vx
   * @param {number} vy
   * @param {object} trait
   * @param {object} [extra]
   */
  _spawnFrontBullet(bullets, x, y, vx, vy, trait, extra = {}) {
    const fxKey = extra.fxKey || trait.projectile;
    const damage = this._scaledDamage(trait.id, extra.damage ?? trait.damage);
    const meta = {
      kind: trait.id,
      weaponId: trait.id,
      fxKey,
      damage,
      visualScale: this._visualScale || 1,
      rotate: trait.rotate === true,
      size: layoutPx(extra.hitSize || trait.hitSize || 10),
      maxDistance: null,
      knockbackBodies: extra.knockbackBodies ?? trait.knockbackBodies ?? 0,
      impact: trait.impact || null,
      tier: extra.tier ?? null,
      split: extra.split === true,
      ignoreId: extra.ignoreId ?? null,
      armTravel: extra.armTravel ?? 0,
    };
    const libraryGfx = this._spawnLibraryProjectile(x, y, vx, vy, meta);
    let gfx = libraryGfx?.sprite;
    if (!gfx && this.scene?.add?.rectangle) {
      const size = meta.size;
      gfx = this.scene.add.rectangle(x, y, size, size, trait.tint || 0xffffff);
      gfx.setDepth(depthFromY(y));
    }
    if (!gfx) return;
    bullets.push({
      gfx,
      trail: null,
      trailPts: [],
      damage,
      vx,
      vy,
      kind: trait.id,
      weaponId: trait.id,
      size: meta.size,
      maxDistance: null,
      traveled: 0,
      knockback: 0,
      knockbackBodies: meta.knockbackBodies,
      library: !!libraryGfx,
      rotate: libraryGfx ? libraryGfx.rotate : false,
      facing: libraryGfx?.facing || 'west',
      impact: meta.impact,
      tier: meta.tier,
      split: meta.split,
      ignoreId: meta.ignoreId,
      armTravel: meta.armTravel,
    });
  }

  /**
   * @param {import('../entities/Zombie.js').Zombie} zombie
   * @param {object} bullet
   */
  _applyFrontHit(zombie, bullet) {
    const trait = WEAPON_TRAITS[bullet.weaponId];
    if (trait?.id === 'water') {
      this._queueWaterSplash(zombie, bullet);
      return { gold: 0, kills: 0 };
    }
    if (trait?.id === 'sling') {
      this._queueSlingImpact(zombie, bullet);
      return { gold: 0, kills: 0 };
    }
    const gain = this._hurtZombie(zombie, bullet.damage, bullet, {
      impact: true,
      knock: true,
    });
    if (trait?.id === 'bubble' && bullet.split) this._splitBubble(zombie, bullet);
    if (trait?.id === 'lightning') {
      const chain = this._chainLightning(zombie);
      gain.gold += chain.gold;
      gain.kills += chain.kills;
    }
    if (trait?.id === 'frost') this._freezeZombie(zombie, trait);
    if (trait?.streak) this._playStreak(zombie, trait.streak);
    return gain;
  }

  /**
   * @param {import('../entities/Zombie.js').Zombie} zombie
   * @param {number} damage
   * @param {object} bullet
   * @param {{ impact?: boolean, knock?: boolean }} [opts]
   */
  _hurtZombie(zombie, damage, bullet, opts = {}) {
    if (!zombie?.alive || !zombie.body) return { gold: 0, kills: 0 };
    const dmg = Number(damage);
    if (!Number.isFinite(dmg) || dmg <= 0) return { gold: 0, kills: 0 };
    const hx = zombie.x;
    const hy = Number.isFinite(zombie.visualTop) ? zombie.visualTop : zombie.y;
    const goldVal = zombie.goldValue || 0;
    if (opts.knock && bullet?.knockbackBodies > 0) {
      const body = (zombie.displayHalf || 0) * 2;
      if (body > 0 && typeof zombie.applyKnockback === 'function') {
        zombie.applyKnockback(body * bullet.knockbackBodies);
      }
    }
    if (!zombie.alive || !zombie.body) return { gold: 0, kills: 0 };
    if (opts.impact && bullet?.impact) {
      this._spawnImpactKey(bullet.impact, hx, Number.isFinite(zombie.bodyCenterY) ? zombie.bodyCenterY : hy, zombie);
    }
    this._spawnSkinHit(zombie, bullet?.weaponId);
    const killed = zombie.takeDamage(dmg, { kind: bullet?.weaponId || bullet?.kind });
    if (dmg > 0) this.scene.audio?.playHitImpact();
    const color = DAMAGE_COLORS[bullet?.weaponId] || DAMAGE_COLORS.handgun;
    showDamageText(this.scene, hx, hy, dmg, color, zombie.id);
    if (killed) return { gold: goldVal, kills: 1 };
    return { gold: 0, kills: 0 };
  }

  /**
   * Opaque contact plays fx-lightning-impact at the pixel point.
   * Water splash, wet ground, and body-hit sheets stay off. No chain.
   * HP for the primary and every neighbor in the splash still waits
   * for the same beat.
   * @param {import('../entities/Zombie.js').Zombie} primary
   * @param {object} bullet
   */
  _queueWaterSplash(primary, bullet) {
    const trait = WEAPON_TRAITS.water;
    const px = primary.x;
    const py = primary.y;
    const tx = Number(bullet?.touchX);
    const ty = Number(bullet?.touchY);
    if (Number.isFinite(tx) && Number.isFinite(ty)) {
      this._spawnPointFx(WATER_HIT_FX, tx, ty, primary);
    }
    const radius = layoutPx(trait.splashRadius || 56);
    /** @type {{ zombie: import('../entities/Zombie.js').Zombie, damage: number, knock: boolean }[]} */
    const hits = [{ zombie: primary, damage: bullet.damage, knock: true }];
    for (const z of this._liveZombies || []) {
      if (!z?.alive || !z.body || z === primary) continue;
      const reach = radius + (z.displayHalf || 0);
      if (Math.hypot(z.x - px, z.y - py) > reach) continue;
      hits.push({
        zombie: z,
        damage: this._scaledDamage('water', trait.splash),
        knock: false,
      });
    }
    this._waterBeats.push({
      life: this._waterBeatMs(),
      hits,
      knockbackBodies: bullet.knockbackBodies || 0,
    });
  }

  /**
   * Half of the splash sheet that will actually play.
   * fx-water-splash-big is 8×12fps; fx-water-impact stays the fallback.
   * @returns {number}
   */
  _waterBeatMs() {
    const exists = (key) => !!this.scene?.textures?.exists?.(key);
    const key = waterSplashKey(exists);
    let anim = null;
    const anims = this.scene?.anims;
    if (anims && typeof anims.exists === 'function' && anims.exists(key) && typeof anims.get === 'function') {
      try {
        anim = anims.get(key);
      } catch (_) {
        anim = null;
      }
    }
    const asset = libraryAsset(this.scene, key);
    const full = libraryFxDuration(anim, asset || waterSheetFallback(key));
    return waterImpactBeatMs(full);
  }

  /**
   * @param {object[]} bullets
   * @param {{ muzzleX: number, muzzleY: number }} slot
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {object} trait
   */
  _spawnWaterShot(bullets, slot, zombies, trait) {
    const speed = BULLET_SPEED * LAYOUT_SCALE * (trait.speed || 1);
    const target = pickWaterGuide(zombies, slot.muzzleX, slot.muzzleY, null);
    let aim = null;
    if (target) {
      const tx = target.x;
      const ty = Number.isFinite(target.bodyCenterY) ? target.bodyCenterY : target.y;
      const vz = typeof target.marchVx === 'function' ? target.marchVx() : 0;
      aim = waterLeadAim(slot.muzzleX, slot.muzzleY, tx, ty, vz, speed);
    }
    const { vx, vy } = waterAimVelocity(slot.muzzleX, slot.muzzleY, aim, speed);
    this._spawnFrontBullet(bullets, slot.muzzleX, slot.muzzleY, vx, vy, trait);
  }

  /**
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {number} x
   * @param {number} y
   */
  _nearestLiving(zombies, x, y) {
    let best = null;
    let bestD = Infinity;
    for (const z of zombies || []) {
      if (!z?.alive || !z.body) continue;
      const zx = z.x;
      const zy = z.y;
      if (!Number.isFinite(zx) || !Number.isFinite(zy)) continue;
      const dist = Math.hypot(zx - x, zy - y);
      if (dist < bestD) {
        best = z;
        bestD = dist;
      }
    }
    return best;
  }

  /**
   * @param {number} dt
   */
  _stepWaterBeats(dt) {
    const pending = [];
    for (const beat of this._waterBeats || []) {
      beat.life -= dt;
      if (beat.life > 0) {
        pending.push(beat);
        continue;
      }
      for (const hit of beat.hits) {
        const gain = this._hurtZombie(
          hit.zombie,
          hit.damage,
          { weaponId: 'water', impact: WEAPON_TRAITS.water.impact, knockbackBodies: beat.knockbackBodies },
          { impact: false, knock: hit.knock }
        );
        this._pending.gold += gain.gold;
        this._pending.kills += gain.kills;
      }
    }
    this._waterBeats = pending;
  }

  /**
   * Impact (or the pellet sheet) plays on contact. HP and the body shove
   * wait for the middle of that sheet. The per-skin hook plays with them.
   * @param {import('../entities/Zombie.js').Zombie} primary
   * @param {object} bullet
   */
  _queueSlingImpact(primary, bullet) {
    const trait = WEAPON_TRAITS.sling;
    const px = primary.x;
    const hy = Number.isFinite(primary.bodyCenterY) ? primary.bodyCenterY : primary.y;
    const exists = (key) => !!this.scene?.textures?.exists?.(key);
    this._spawnImpactKey(slingImpactKey(exists), px, hy, primary);
    this._slingBeats.push({
      life: this._slingBeatMs(),
      zombie: primary,
      damage: bullet.damage,
      knockbackBodies: bullet.knockbackBodies || trait.knockbackBodies || 0,
      streak: trait.streak || null,
    });
  }

  /**
   * Half of the impact sheet that will actually play.
   * fx-sling-impact is 6×14fps; fx-sling-pellet stays the fallback.
   * @returns {number}
   */
  _slingBeatMs() {
    const exists = (key) => !!this.scene?.textures?.exists?.(key);
    const key = slingImpactKey(exists);
    let anim = null;
    const anims = this.scene?.anims;
    if (anims && typeof anims.exists === 'function' && anims.exists(key) && typeof anims.get === 'function') {
      try {
        anim = anims.get(key);
      } catch (_) {
        anim = null;
      }
    }
    const asset = libraryAsset(this.scene, key);
    const full = libraryFxDuration(anim, asset || slingSheetFallback(key));
    return slingImpactBeatMs(full);
  }

  /**
   * @param {object[]} bullets
   * @param {{ muzzleX: number, muzzleY: number }} slot
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {object} trait
   */
  _spawnSlingShot(bullets, slot, zombies, trait) {
    const speed = BULLET_SPEED * LAYOUT_SCALE * (trait.speed || 1);
    const target = this._nearestLiving(zombies, slot.muzzleX, slot.muzzleY);
    const aim = target
      ? {
          x: target.x,
          y: Number.isFinite(target.bodyCenterY) ? target.bodyCenterY : target.y,
        }
      : null;
    const { vx, vy } = slingAimVelocity(slot.muzzleX, slot.muzzleY, aim, speed);
    this._spawnFrontBullet(bullets, slot.muzzleX, slot.muzzleY, vx, vy, trait);
  }

  /**
   * @param {number} dt
   */
  _stepSlingBeats(dt) {
    const pending = [];
    for (const beat of this._slingBeats || []) {
      beat.life -= dt;
      if (beat.life > 0) {
        pending.push(beat);
        continue;
      }
      const zombie = beat.zombie;
      if (zombie?.alive && zombie.body) {
        const gain = this._hurtZombie(
          zombie,
          beat.damage,
          {
            weaponId: 'sling',
            impact: WEAPON_TRAITS.sling.impact,
            knockbackBodies: beat.knockbackBodies,
          },
          { impact: false, knock: true }
        );
        this._pending.gold += gain.gold;
        this._pending.kills += gain.kills;
        if (beat.streak) this._playStreak(zombie, beat.streak);
      }
    }
    this._slingBeats = pending;
  }

  /**
   * @param {import('../entities/Zombie.js').Zombie} zombie
   * @param {object} bullet
   */
  _splitBubble(zombie, bullet) {
    const trait = WEAPON_TRAITS.bubble;
    const tier = bullet.tier || 'l';
    const next = trait.childTier?.[tier];
    const fx = trait.childProjectile?.[tier];
    if (!next || !fx || !this._liveBullets) return;
    const kids = splitVelocities(bullet.vx, bullet.vy);
    const nudge = layoutPx(28);
    for (const vel of kids) {
      const len = Math.hypot(vel.vx, vel.vy) || 1;
      this._spawnFrontBullet(
        this._liveBullets,
        zombie.x + (vel.vx / len) * nudge,
        zombie.y + (vel.vy / len) * nudge,
        vel.vx,
        vel.vy,
        trait,
        {
          fxKey: fx,
          damage: trait.childDamage?.[next] ?? trait.damage,
          hitSize: trait.childHitSize?.[next] ?? trait.hitSize,
          tier: next,
          split: !!trait.childTier?.[next],
          knockbackBodies: 0,
          ignoreId: zombie.id,
          armTravel: layoutPx(36),
        }
      );
    }
  }

  /**
   * Primary hit plus two jumps (chain count 3).
   * @param {import('../entities/Zombie.js').Zombie} primary
   */
  _chainLightning(primary) {
    const trait = WEAPON_TRAITS.lightning;
    const range = layoutPx(trait.chainRange || 150);
    let from = primary;
    let gold = 0;
    let kills = 0;
    const used = new Set([primary.id]);
    const jumps = trait.chainJumps || 0;
    for (let i = 0; i < jumps; i++) {
      let best = null;
      let bestD = range;
      for (const z of this._liveZombies || []) {
        if (!z?.alive || !z.body || used.has(z.id)) continue;
        const d = Math.hypot(z.x - from.x, (z.bodyCenterY || z.y) - (from.bodyCenterY || from.y));
        if (d < bestD) {
          best = z;
          bestD = d;
        }
      }
      if (!best) break;
      used.add(best.id);
      this._spawnChain(
        from.x,
        from.bodyCenterY || from.y,
        best.x,
        best.bodyCenterY || best.y
      );
      const dmg = this._scaledDamage('lightning', trait.chainDamage?.[i] ?? trait.damage);
      const gain = this._hurtZombie(
        best,
        dmg,
        { weaponId: 'lightning', impact: trait.impact },
        { impact: true, knock: false }
      );
      gold += gain.gold;
      kills += gain.kills;
      from = best;
    }
    return { gold, kills };
  }

  /**
   * @param {import('../entities/Zombie.js').Zombie} zombie
   * @param {object} trait
   */
  _freezeZombie(zombie, trait) {
    if (typeof zombie.applyRoot === 'function') zombie.applyRoot(trait.freezeMs || 0);
    this._attachFollow(zombie, trait.status, trait.freezeMs || 900);
  }

  /**
   * @param {boolean} active
   * @param {{ x: number, y: number }|null} muzzle
   * @param {number} dt
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   */
  _syncFlame(active, muzzle, dt, zombies) {
    if (!active || !muzzle || !Number.isFinite(muzzle.x)) {
      this._destroyFlame();
      this._flameMs = 0;
      this._flameTick = 0;
      return;
    }
    const trait = WEAPON_TRAITS.flame;
    this._flameMs = Math.min(FLAME_GROW_MS, (this._flameMs || 0) + Math.max(0, dt));
    const u = FLAME_GROW_MS > 0 ? this._flameMs / FLAME_GROW_MS : 1;
    const frac = FLAME_RANGE_START + (FLAME_RANGE_MAX - FLAME_RANGE_START) * u;
    const range = GAME_WIDTH * frac;
    const useShort = frac < 0.3 && this.scene.textures?.exists?.(trait.coneShort);
    const key = useShort ? trait.coneShort : trait.cone;
    if (!key || !this.scene.textures?.exists?.(key)) {
      this._destroyFlame();
      return;
    }
    const asset = libraryAsset(this.scene, key);
    const fw = asset?.frameWidth || (useShort ? 48 : 128);
    const fh = asset?.frameHeight || (useShort ? 32 : 48);
    if (!this._flame?.active || this._flame.texture?.key !== key) {
      this._destroyFlame();
      this._flame = this.scene.add.sprite(muzzle.x, muzzle.y, key);
      const origin = asset?.origin || [1, 0.5];
      this._flame.setOrigin(origin[0], origin[1]);
      playLibraryAnim(this._flame, key, this.scene);
    }
    const sy = this._visualScale || 1;
    this._flame.setPosition(muzzle.x, muzzle.y);
    this._flame.setScale(range / Math.max(1, fw), sy);
    this._flame.setDepth(depthFromY(muzzle.y, 5));
    this._flameRange = range;
    const halfY = (fh * sy) / 2;
    this._flameTick += Math.max(0, dt);
    const tick = trait.tickMs || 200;
    if (this._flameTick < tick) return;
    this._flameTick = 0;
    for (const z of zombies || []) {
      if (!z?.alive || !z.body) continue;
      const dx = muzzle.x - z.x;
      if (dx < 0 || dx > range) continue;
      const reach = halfY + (z.displayHalf || 0);
      if (Math.abs(z.y - muzzle.y) > reach) continue;
      if (typeof z.applyBurn === 'function') {
        z.applyBurn(this._scaledDamage('flame', trait.burn), trait.burnIntervalMs, trait.burnMs);
      }
      this._attachFollow(z, trait.burnFx, trait.burnMs);
      const gain = this._hurtZombie(z, this._scaledDamage('flame', trait.chip), { weaponId: 'flame' }, { impact: false, knock: false });
      this._pending.gold += gain.gold;
      this._pending.kills += gain.kills;
    }
  }

  _destroyFlame() {
    this._safeDestroyGraphics(this._flame);
    this._flame = null;
    this._flameRange = 0;
  }

  /**
   * Body-center puff on the takeDamage frame.
   * Water does not play a body sheet here. Its hit is fx-lightning-impact
   * at the opaque contact, spawned when the projectile touches.
   * Sling prefers fx-hit-sling-<skin> (office-worker-v2 → office-v2),
   * then fx-sling-impact, then fx-sling-pellet.
   * PIXELLAB_HOOK: fx-hit-sling-<skinId> for each monster skin.
   * PIXELLAB_HOOK: fx-hit-<skinId> for skins without a water overlay.
   * @param {{ x: number, y: number, bodyCenterY?: number, scale?: number, skin?: { id?: string } }} zombie
   * @param {string} [weaponId]
   */
  _spawnSkinHit(zombie, weaponId) {
    if (weaponId === 'water') return;
    const exists = (key) => !!this.scene?.textures?.exists?.(key);
    let key = null;
    if (weaponId === 'sling') {
      const mapped = slingBodyHitKey(zombie?.skin?.id);
      const order = [mapped, 'fx-sling-impact', 'fx-sling-pellet'].filter(Boolean);
      key = order.find((name) => exists(name)) || null;
    } else {
      const generic = zombieHitFxKey(zombie?.skin?.id);
      key = generic && exists(generic) ? generic : null;
    }
    if (!key) return;
    const x = zombie.x;
    const y = Number.isFinite(zombie.bodyCenterY) ? zombie.bodyCenterY : zombie.y;
    const sling = weaponId === 'sling';
    playLibraryFx(this.scene, x, y, key, {
      scale: sling ? this._slingOverlayScale(zombie) : (this._visualScale || Math.abs(zombie.scale || 1) || 1),
      depth: sling ? this._slingOverlayDepth(zombie) : depthFromY(y, 5),
    });
  }

  /**
   * Feet depth, not the chest. A chest Y sorts the splash behind the sprite.
   * @param {{ y?: number, body?: { depth?: number } }} zombie
   */
  _slingOverlayDepth(zombie) {
    const feet = Number.isFinite(zombie?.y) ? zombie.y : 0;
    const fromFeet = depthFromY(feet);
    const fromBody = Number.isFinite(zombie?.body?.depth) ? zombie.body.depth : fromFeet;
    return Math.max(fromFeet, fromBody) + SLING_OVERLAY_DEPTH_BIAS;
  }

  /**
   * @param {{ scale?: number }} [zombie]
   */
  _slingOverlayScale(zombie) {
    const base = this._visualScale || Math.abs(zombie?.scale || 1) || 1;
    return base * SLING_OVERLAY_SCALE;
  }

  /**
   * @param {string} key
   */
  _isSlingImpactKey(key) {
    return key === 'fx-sling-impact' || key === 'fx-sling-pellet';
  }

  /**
   * One-shot sheet at an exact world point. Used for the water hit so
   * the burst stays on the opaque contact instead of the body center.
   * Depth follows the feet so the burst paints in front of the sprite.
   * @param {string} key
   * @param {number} x
   * @param {number} y
   * @param {{ y?: number, scale?: number }} [zombie]
   */
  _spawnPointFx(key, x, y, zombie) {
    if (!key || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const feet = Number.isFinite(zombie?.y) ? zombie.y : y;
    playLibraryFx(this.scene, x, y, key, {
      scale: this._visualScale || Math.abs(zombie?.scale || 1) || 1,
      depth: depthFromY(feet, 4),
    });
  }

  /**
   * Impact at the body center (not the feet, not the crown).
   * @param {string|null|undefined} key
   * @param {number} x
   * @param {number} y
   * @param {{ scale?: number, bodyCenterY?: number }} [zombie]
   */
  _spawnImpactKey(key, x, y, zombie) {
    if (!key) return;
    const hy = Number.isFinite(zombie?.bodyCenterY) ? zombie.bodyCenterY : y;
    const sling = this._isSlingImpactKey(key);
    playLibraryFx(this.scene, x, hy, key, {
      scale: sling ? this._slingOverlayScale(zombie) : (this._visualScale || Math.abs(zombie?.scale || 1) || 1),
      depth: sling ? this._slingOverlayDepth(zombie) : depthFromY(hy, 4),
    });
  }

  /**
   * @param {string|null|undefined} key
   * @param {number} x
   * @param {number} y feet
   */
  _spawnGround(key, x, y) {
    if (!key) return;
    const sprite = playLibraryFx(this.scene, x, y, key, {
      scale: this._visualScale || 1,
      depth: depthFromY(y, 1),
    });
    if (!sprite) return;
    this.scene.time?.delayedCall?.(1400, () => this._safeDestroyGraphics(sprite));
  }

  /**
   * @param {import('../entities/Zombie.js').Zombie} zombie
   * @param {string} key
   */
  _playStreak(zombie, key) {
    const y = Number.isFinite(zombie.bodyCenterY) ? zombie.bodyCenterY : zombie.y;
    const sling = typeof key === 'string' && key.startsWith('fx-sling');
    playLibraryFx(this.scene, zombie.x, y, key, {
      scale: sling ? this._slingOverlayScale(zombie) : (this._visualScale || 1),
      depth: sling ? this._slingOverlayDepth(zombie) : depthFromY(y, 5),
      flipX: true,
    });
  }

  /**
   * @param {import('../entities/Zombie.js').Zombie} zombie
   * @param {string} key
   * @param {number} life
   */
  _attachFollow(zombie, key, life) {
    if (!zombie || !key || !this.scene.textures?.exists?.(key)) return;
    const existing = (this._follows || []).find((f) => f.zombie === zombie && f.key === key);
    if (existing) {
      existing.life = Math.max(existing.life, life || 0);
      return;
    }
    const sprite = playLibraryFx(this.scene, zombie.x, zombie.y, key, {
      scale: this._visualScale || 1,
      depth: depthFromY(zombie.y, 4),
    });
    if (!sprite) return;
    this._follows.push({ zombie, sprite, key, life: life || 0 });
  }

  /**
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   */
  _spawnChain(x1, y1, x2, y2) {
    const key = WEAPON_TRAITS.lightning.chainFx;
    if (!key || !this.scene.textures?.exists?.(key)) return;
    const asset = libraryAsset(this.scene, key);
    const sprite = this.scene.add.sprite(x1, y1, key);
    const origin = asset?.origin || [0, 0.5];
    sprite.setOrigin(origin[0], origin[1]);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    const fw = asset?.frameWidth || 64;
    sprite.setScale(Math.max(0.2, dist / Math.max(1, fw)), this._visualScale || 1);
    sprite.setRotation(aimRotation(dx, dy, asset?.facing || 'west'));
    sprite.setDepth(depthFromY((y1 + y2) / 2, 6));
    playLibraryAnim(sprite, key, this.scene);
    this.scene.time?.delayedCall?.(180, () => this._safeDestroyGraphics(sprite));
  }

  /**
   * @param {object[]} bullets
   * @param {number} x
   * @param {number} y
   */
  _spawnShotgunFan(bullets, x, y) {
    const count = Phaser.Math.Between(SHOTGUN_PELLET_MIN, SHOTGUN_PELLET_MAX);
    const alts = this.getSkin()?.projectileAlts;
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
      const fxKey = Array.isArray(alts) && alts.length ? alts[i % alts.length] : null;
      this._spawnBullet(bullets, x, y, vx, vy, {
        damage: SHOTGUN_PELLET_DAMAGE,
        kind: 'shotgun',
        size: SHOTGUN_PELLET_SIZE * LAYOUT_SCALE,
        maxDistance: SHOTGUN_MAX_DISTANCE,
        knockback: SHOTGUN_PELLET_KNOCKBACK,
        fxKey,
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
   * @param {{ damage: number, kind: 'handgun'|'shotgun', size?: number, maxDistance?: number|null, knockback?: number, fxKey?: string|null }} meta
   */
  _spawnBullet(bullets, x, y, vx, vy, meta) {
    const libraryGfx = this._spawnLibraryProjectile(x, y, vx, vy, meta);
    if (libraryGfx) {
      bullets.push({
        gfx: libraryGfx.sprite,
        trail: null,
        trailPts: [],
        damage: meta.damage,
        vx,
        vy,
        kind: meta.kind,
        size: meta.size ?? BULLET_SIZE,
        maxDistance: meta.maxDistance == null ? null : meta.maxDistance,
        traveled: 0,
        knockback: meta.knockback || 0,
        library: true,
        rotate: libraryGfx.rotate,
        facing: libraryGfx.facing,
      });
      return;
    }

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
   * Library projectile sprite. Collision `size` stays on the GameConfig slug
   * or pellet — the graphic scale does not change the hit test.
   * @param {number} x
   * @param {number} y
   * @param {number} vx
   * @param {number} vy
   * @param {{ kind?: string, fxKey?: string|null }} meta
   * @returns {{ sprite: Phaser.GameObjects.Sprite, rotate: boolean, facing: string }|null}
   */
  _spawnLibraryProjectile(x, y, vx, vy, meta) {
    const skin = this.getSkin();
    const keyed = !!meta.fxKey;
    if (!keyed && meta.kind !== 'handgun' && meta.kind !== 'shotgun') return null;
    if (!keyed && !skin) return null;
    const key = meta.fxKey || skin?.projectile;
    if (!key || !this.scene.textures?.exists?.(key)) return null;
    // PIXELLAB_HOOK: projectile sheet — fx-<weapon>-* from the hero FX manifest
    const sprite = this.scene.add.sprite(x, y, key);
    const asset = libraryAsset(this.scene, key);
    const origin = asset?.origin ?? [0.5, 0.5];
    sprite.setOrigin(origin[0], origin[1]);
    const scale = Number.isFinite(meta.visualScale)
      ? meta.visualScale
      : (this._visScale || 1) * (skin?.projScale || 1);
    sprite.setScale(scale);
    const facing = asset?.facing || 'west';
    const rotate = meta.rotate != null ? meta.rotate : skin?.rotate !== false;
    if (rotate) sprite.setRotation(aimRotation(vx, vy, facing));
    playLibraryAnim(sprite, key, this.scene);
    sprite.setDepth(depthFromY(y));
    return { sprite, rotate, facing };
  }

  /**
   * Impact puff at the hit. Skipped when the skin has no impact strip.
   * @param {number} x
   * @param {number} y
   * @param {{ scale?: number, bodyCenterY?: number }} zombie
   */
  _spawnImpactFx(x, y, zombie) {
    const key = this.getSkin()?.impact;
    if (!key) return;
    const hy = Number.isFinite(zombie?.bodyCenterY) ? zombie.bodyCenterY : y;
    playLibraryFx(this.scene, x, hy, key, {
      scale: Math.abs(zombie?.scale || this._visScale || 1),
      depth: depthFromY(hy, 4),
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
   * Library muzzle strip when the skin names one (nozzle origin on the barrel).
   * Otherwise the yellow-white flash. Fades in MUZZLE_FLASH_MS (~50ms).
   * @param {number} x
   * @param {number} y
   */
  _spawnMuzzleFlash(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const skin = this.getSkin();
    if (skin) {
      // PIXELLAB_HOOK: muzzle FX — fx-<weapon>-muzzle, origin (1, 0.5) nozzle
      if (skin.muzzle) {
        playLibraryFx(this.scene, x, y, skin.muzzle, {
          scale: this._visScale || 1,
          depth: depthFromY(y, 6),
        });
      }
      return;
    }
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
    if (this.getSkin()) return;
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
    // PIXELLAB_HOOK: spread VFX — fx-flame-cone when the skin names a fan
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const skin = this.getSkin();
    if (skin) {
      if (skin.fan && this.scene.textures?.exists?.(skin.fan)) {
        const fan = playLibraryFx(this.scene, x, y, skin.fan, {
          scale: this._visScale || 1,
          depth: depthFromY(y, 5),
        });
        this.scene.time?.delayedCall?.(SHOTGUN_VFX_MS, () => {
          if (fan?.active) fan.destroy();
        });
      }
      return;
    }
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
}
