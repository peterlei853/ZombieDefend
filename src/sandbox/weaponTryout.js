/**
 * Sandbox weapon try-out. StageScene never starts this scene.
 *
 * One of the six stage guns floats in front of the girl at the catalog
 * front-float size (56×56, same display scale as the hero). No fence
 * cradle, water mount, or sling mount is drawn. Shots use WeaponSystem
 * so the projectile sheet and the hit FX are the combat ones. Kill gold
 * is discarded: this page does not write the save store, MockDB, or the
 * stage registry. Feel-booth keys 6–9 are not wired here.
 */

import { frontKey, HERO_UNARMED, OWNED_WEAPON_ORDER, WEAPON_TRAITS } from '../assets/heroDeploy.js';
import {
  SANDBOX_FLOAT_FRAME,
  SANDBOX_TARGET_HP,
  sandboxFloatOrigin,
  sandboxMuzzle,
  sandboxWeaponFromSearch,
  sandboxWeaponLabel,
} from './weaponFloat.js';
import { HERO_ORIGIN_X, HERO_ORIGIN_Y } from '../assets/heroLoadout.js';
import {
  createLibraryAnims,
  libraryAsset,
  playLibraryAnim,
  preloadLibrary,
} from '../assets/libraryAssets.js';
import { registerZombieAnims } from '../assets/zombieSprites.js';
import { BULLET_SIZE, GAME_HEIGHT, GAME_WIDTH, WAVE_DEFS } from '../data/waves.js';
import { Zombie } from '../entities/Zombie.js';
import {
  depthFromY,
  displayScaleFromY,
  grassYMax,
  grassYMin,
  laneCenters,
  LAYOUT_SCALE,
} from '../systems/DepthView.js';
import { preloadGameAudio, SoundManager } from '../systems/SoundManager.js';
import { WeaponSystem } from '../systems/WeaponSystem.js';

const HERO_X = 1060;
const DUMMY_X = 700;
const DRIFT_LIMIT = 240;
const REVIVE_MS = 700;

export default class WeaponTryoutScene extends Phaser.Scene {
  constructor() {
    super('WeaponTryout');
  }

  preload() {
    preloadLibrary(this, { categories: ['hero', 'zombies', 'fx', 'ui'] });
    preloadGameAudio(this);
  }

  create() {
    createLibraryAnims(this);
    registerZombieAnims(this);
    this.audio = new SoundManager(this);
    this.events.once('shutdown', () => {
      this.audio?.dispose?.();
      this.audio = null;
    });
    this.weaponId = sandboxWeaponFromSearch(
      globalThis.location?.search || '',
      globalThis.location?.hash || ''
    );
    this.laneY = laneCenters()[4];
    this.heroX = HERO_X;
    this.dummyX = DUMMY_X;
    this.bullets = [];
    this.weapons = new WeaponSystem(this);
    this._reviveAt = 0;
    this._drawLane();
    this._makeHero();
    this._makeGun();
    this._spawnTarget();
    this.caption = this.add.text(24, 18, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '20px',
      color: '#e6ebf2',
    }).setDepth(20000).setScrollFactor(0);
    this.hint = this.add.text(24, 48, '1–6 switch · [ ] cycle · R reset target', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '15px',
      color: '#8d99ab',
    }).setDepth(20000).setScrollFactor(0);
    this._bindApi();
    this._publish();
  }

  /**
   * @param {number} _time
   * @param {number} delta
   */
  update(_time, delta) {
    const dt = Number.isFinite(delta) ? delta : 0;
    this._syncHero();
    this._syncGun();
    const origin = sandboxFloatOrigin(this.hero.x, this.hero.y, this.hero.scaleX);
    const frame = libraryAsset(this, frontKey(this.weaponId))?.frameWidth || SANDBOX_FLOAT_FRAME;
    const muzzle = sandboxMuzzle(origin, frame);
    const slot = { muzzleX: muzzle.x, muzzleY: muzzle.y, weaponId: this.weaponId };
    const living = this.target?.alive ? [this.target] : [];
    const scale = Math.abs(this.hero.scaleX || 1);
    const fired = this.weapons.updatePlayerFire(dt, this.hero.x, this.hero.y, living, this.bullets, {
      frontFloat: true,
      canFire: living.length > 0,
      muzzles: [{ id: this.weaponId, x: muzzle.x, y: muzzle.y }],
      // Coordinates only. Water and sling already aim from a muzzle slot;
      // nothing here instantiates a cradle sprite.
      waterMount: this.weaponId === 'water' ? slot : null,
      slingFromMount: this.weaponId === 'sling',
      slingMount: this.weaponId === 'sling' ? slot : null,
      fenceOnly: false,
      visualScale: scale / LAYOUT_SCALE,
      scaleX: this.hero.scaleX,
      scaleY: this.hero.scaleY,
    });
    if (fired) this.audio?.playWeaponShot({ id: fired }, fired);
    this.weapons.stepBullets(this.bullets, dt / 1000);
    this.weapons.stepCasings?.(dt);
    this.weapons.stepOverlays?.(dt);
    this._resolveHits();
    this._holdTarget(dt);
  }

  /** @param {string} id */
  pick(id) {
    const next = String(id || '').toLowerCase();
    if (!OWNED_WEAPON_ORDER.includes(next) || next === this.weaponId) {
      this._publish();
      return;
    }
    this.weaponId = next;
    this._clearBullets();
    this.weapons.destroyEffects();
    this.weapons.setOwnedWeapons([next]);
    this._makeGun();
    this._spawnTarget();
    this._rememberQuery();
    this._publish();
  }

  next() {
    const i = OWNED_WEAPON_ORDER.indexOf(this.weaponId);
    this.pick(OWNED_WEAPON_ORDER[(i + 1) % OWNED_WEAPON_ORDER.length]);
  }

  prev() {
    const i = OWNED_WEAPON_ORDER.indexOf(this.weaponId);
    this.pick(OWNED_WEAPON_ORDER[(i + OWNED_WEAPON_ORDER.length - 1) % OWNED_WEAPON_ORDER.length]);
  }

  reset() {
    this._clearBullets();
    this.weapons.destroyEffects();
    this._spawnTarget();
    this._publish();
  }

  _drawLane() {
    const sky = this.add.graphics();
    sky.fillStyle(0x121814, 1);
    sky.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    sky.fillStyle(0x24362c, 1);
    sky.fillRect(0, grassYMin(), GAME_WIDTH, Math.max(20, grassYMax() - grassYMin()));
    sky.setDepth(0);
    this.add.text(this.dummyX, this.laneY + 28, 'target', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      color: '#8d99ab',
    }).setOrigin(0.5, 0).setDepth(6);
  }

  _makeHero() {
    const scale = displayScaleFromY(this.laneY);
    const key = HERO_UNARMED.idle;
    if (this.textures.exists(key)) {
      this.hero = this.add.sprite(this.heroX, this.laneY, key, 0);
      this.hero.setOrigin(HERO_ORIGIN_X, HERO_ORIGIN_Y);
      this.hero.setScale(scale);
      this.hero.setDepth(depthFromY(this.laneY));
      playLibraryAnim(this.hero, key, this);
      return;
    }
    this.hero = this.add.rectangle(this.heroX, this.laneY, 28, 48, 0x42a5f5);
    this.hero.setScale(scale);
    this.hero.setDepth(depthFromY(this.laneY));
  }

  _syncHero() {
    const scale = displayScaleFromY(this.laneY);
    this.hero.setPosition(this.heroX, this.laneY);
    this.hero.setScale(scale);
    this.hero.setDepth(depthFromY(this.laneY));
  }

  _makeGun() {
    if (this.gun) {
      try {
        this.gun.destroy();
      } catch (_) {
        /* already destroyed */
      }
      this.gun = null;
    }
    this.weapons.setOwnedWeapons([this.weaponId]);
    const key = frontKey(this.weaponId);
    const origin = sandboxFloatOrigin(this.hero.x, this.hero.y, this.hero.scaleX);
    if (this.textures.exists(key)) {
      this.gun = this.add.sprite(origin.x, origin.y, key, 0);
      const asset = libraryAsset(this, key);
      const ox = asset?.origin?.[0] ?? 0.5;
      const oy = asset?.origin?.[1] ?? 0.5;
      this.gun.setOrigin(ox, oy);
    } else {
      const tint = WEAPON_TRAITS[this.weaponId]?.tint || 0xffffff;
      this.gun = this.add.rectangle(origin.x, origin.y, SANDBOX_FLOAT_FRAME, 28, tint);
      this.gun.setOrigin(0.5, 0.5);
    }
    this._syncGun();
  }

  _syncGun() {
    if (!this.gun?.active) return;
    const origin = sandboxFloatOrigin(this.hero.x, this.hero.y, this.hero.scaleX);
    this.gun.setPosition(origin.x, origin.y);
    this.gun.setScale(origin.scale);
    this.gun.setDepth((this.hero.depth ?? depthFromY(this.hero.y)) + 2);
    const key = frontKey(this.weaponId);
    if (typeof this.gun.play === 'function' && this.anims.exists(key)) {
      const current = this.gun.anims?.currentAnim?.key;
      if (current !== key || !this.gun.anims?.isPlaying) playLibraryAnim(this.gun, key, this);
    }
  }

  _spawnTarget() {
    if (this.target) {
      this.target.showcaseHold = false;
      this.target.alive = false;
      this.target.destroyVisuals();
      this.target = null;
    }
    const row = WAVE_DEFS[0].archetypes[0];
    const zombie = new Zombie(this, {
      x: this.dummyX,
      y: this.laneY,
      hp: SANDBOX_TARGET_HP,
      speed: row.speed,
      dps: row.dps,
      wave: 1,
      variant: row.variant,
      skin: 'office-worker-v2',
    });
    zombie.showcaseHold = true;
    zombie.placeAt(this.dummyX);
    zombie.setHpBarShown?.(true);
    this.target = zombie;
    this._reviveAt = 0;
  }

  /** @param {number} dt */
  _holdTarget(dt) {
    const zombie = this.target;
    if (!zombie) return;
    if (!zombie.alive || !zombie.body) {
      if (!this._reviveAt) this._reviveAt = this.time.now + REVIVE_MS;
      if (this.time.now >= this._reviveAt) this._spawnTarget();
      return;
    }
    zombie.tickStatus(dt);
    if (zombie.x < this.dummyX - DRIFT_LIMIT) zombie.placeAt(this.dummyX);
  }

  _resolveHits() {
    const list = this.target ? [this.target] : [];
    this.weapons.armHits(list, this.bullets);
    /** @type {Set<number>} */
    const remove = new Set();
    /** @type {{ index: number, bullet: object, zombie: Zombie }[]} */
    const hits = [];
    for (let i = 0; i < this.bullets.length; i++) {
      const bullet = this.bullets[i];
      if (!bullet?.gfx || bullet.gfx.active === false) {
        remove.add(i);
        continue;
      }
      const half = ((bullet.size ?? BULLET_SIZE * LAYOUT_SCALE) / 2) + 2 * LAYOUT_SCALE;
      const bx = bullet.gfx.x;
      const by = bullet.gfx.y;
      for (const zombie of list) {
        if (!zombie?.alive || !zombie.body) continue;
        if (
          bullet.ignoreId != null &&
          zombie.id === bullet.ignoreId &&
          (bullet.traveled || 0) < (bullet.armTravel || 0)
        ) {
          continue;
        }
        const bounds = zombie.getBounds();
        if (!bounds) continue;
        if (
          bx + half >= bounds.left &&
          bx - half <= bounds.right &&
          by + half >= bounds.top &&
          by - half <= bounds.bottom
        ) {
          if (this.weapons.confirmOpaqueHit?.(bullet, zombie) === false) continue;
          hits.push({ index: i, bullet, zombie });
          break;
        }
      }
    }
    for (const hit of hits) {
      remove.add(hit.index);
      this.weapons.applyDirectHit(hit.zombie, hit.bullet);
    }
    for (let i = 0; i < this.bullets.length; i++) {
      if (remove.has(i)) continue;
      if (this.weapons.shouldRetireBullet(this.bullets[i])) remove.add(i);
    }
    const indices = Array.from(remove).sort((a, b) => b - a);
    for (const index of indices) {
      const bullet = this.bullets[index];
      try {
        bullet?.gfx?.destroy();
      } catch (_) {
        /* already destroyed */
      }
      try {
        bullet?.trail?.destroy();
      } catch (_) {
        /* already destroyed */
      }
      this.bullets.splice(index, 1);
    }
    // Flame ticks and delayed water / sling beats report gold here. Drop it.
    this.weapons.consumePending();
  }

  _clearBullets() {
    for (const bullet of this.bullets) {
      try {
        bullet?.gfx?.destroy();
      } catch (_) {
        /* already destroyed */
      }
      try {
        bullet?.trail?.destroy();
      } catch (_) {
        /* already destroyed */
      }
    }
    this.bullets = [];
  }

  _bindApi() {
    const api = {
      pick: (id) => this.pick(id),
      next: () => this.next(),
      prev: () => this.prev(),
      reset: () => this.reset(),
    };
    globalThis.__ZD_WEAPON = api;
  }

  _rememberQuery() {
    try {
      const url = new URL(globalThis.location.href);
      url.searchParams.set('weapon', this.weaponId);
      url.hash = this.weaponId;
      globalThis.history?.replaceState?.(null, '', url);
    } catch (_) {
      /* file or sandboxed pages can omit history */
    }
  }

  _publish() {
    const trait = WEAPON_TRAITS[this.weaponId];
    const text = this.textures.exists(frontKey(this.weaponId))
      ? sandboxWeaponLabel(this.weaponId)
      : `${trait?.label || this.weaponId} · front sheet missing`;
    if (this.caption) this.caption.setText(text);
    const detail = { id: this.weaponId, text };
    globalThis.__ZD_WEAPON_STATE = detail;
    globalThis.__ZD_WEAPON_PAINT?.(detail);
  }
}

export function bootWeaponTryout() {
  const config = {
    type: Phaser.AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent: 'game-host',
    backgroundColor: '#121814',
    scene: [WeaponTryoutScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      pixelArt: true,
      roundPixels: true,
    },
  };
  const game = new Phaser.Game(config);
  globalThis.__ZD_WEAPON_GAME = game;
  return game;
}

if (typeof window !== 'undefined' && window.Phaser) {
  bootWeaponTryout();
}
