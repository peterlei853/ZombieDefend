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
  SANDBOX_WATER_CHARGE_SHEETS,
  sandboxChargeSheetReady,
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
import { GAME_CONFIG } from '../data/GameConfig.js';
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
import { preloadGameAudio, SoundManager, WATER_EAR_PREVIEW_KEYS } from '../systems/SoundManager.js';
import { WeaponSystem } from '../systems/WeaponSystem.js';

const HERO_X = 1060;
const DUMMY_X = 700;
const DRIFT_LIMIT = 240;
const REVIVE_MS = 700;
/** Five bodies on the lane so L2 pierce (5) and L3 (the whole line) can be seen. */
// Feet X, nearest first. The water muzzle sits near x=961, so a body at
// 900 meets the shot inside the gun and the L1 projectile never reads.
// This line leaves about half a second of open air, and five bodies
// still fit on the sandbox view for L2/L3 pierce.
const WATER_LINE_X = [740, 575, 410, 245, 80];

export default class WeaponTryoutScene extends Phaser.Scene {
  constructor() {
    super('WeaponTryout');
  }

  preload() {
    preloadLibrary(this, { categories: ['hero', 'zombies', 'fx', 'ui'] });
    preloadGameAudio(this, { sandbox: true });
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
    this.heroY = this.laneY;
    this._moveDy = 0;
    this._attackPose = null;
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
    this._space = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE) || null;
    this.input.keyboard?.addCapture?.(Phaser.Input.Keyboard.KeyCodes.SPACE);
    const keys = this.input.keyboard;
    this._up = keys?.addKey?.(Phaser.Input.Keyboard.KeyCodes.W) || null;
    this._upArrow = keys?.addKey?.(Phaser.Input.Keyboard.KeyCodes.UP) || null;
    this._down = keys?.addKey?.(Phaser.Input.Keyboard.KeyCodes.S) || null;
    this._downArrow = keys?.addKey?.(Phaser.Input.Keyboard.KeyCodes.DOWN) || null;
    this._bindApi();
    this._publish();
  }

  /**
   * @param {number} _time
   * @param {number} delta
   */
  update(_time, delta) {
    const dt = Number.isFinite(delta) ? delta : 0;
    this._moveHero(dt);
    this._syncHero();
    this._syncWaterPose(this.weaponId === 'water' && !!this._space?.isDown);
    this._syncGun();
    const origin = sandboxFloatOrigin(this.hero.x, this.hero.y, this.hero.scaleX);
    const frame = libraryAsset(this, frontKey(this.weaponId))?.frameWidth || SANDBOX_FLOAT_FRAME;
    const muzzle = sandboxMuzzle(origin, frame);
    const slot = { muzzleX: muzzle.x, muzzleY: muzzle.y, weaponId: this.weaponId };
    const living = (this.targets || []).filter((z) => z?.alive && z.body);
    const scale = Math.abs(this.hero.scaleX || 1);
    const water = this.weaponId === 'water';
    const fired = this.weapons.updatePlayerFire(dt, this.hero.x, this.hero.y, living, this.bullets, {
      frontFloat: true,
      canFire: water ? true : living.length > 0,
      muzzles: [{ id: this.weaponId, x: muzzle.x, y: muzzle.y }],
      // Coordinates only. Water and sling already aim from a muzzle slot;
      // nothing here instantiates a cradle sprite.
      // PIXELLAB_HOOK: charge sheets — see SANDBOX_WATER_CHARGE_SHEETS.
      // Keep fx-water-proj-t2 (128×64 @ 12) and fx-aoe-touch-x (32×32 @ 16, drawn at 2×).
      // L3 fx-water-proj-t3 is a 512×256 sheet drawn at 1.0 × _visualScale (8× the 32px L1 height).
      // L2 AOE fx-water-t2-aoe is 256×212, drawn at 2× a normal mob (half of the v0.36.21 4×).
      // Auras: blue fx-water-charge-aura, yellow fx-water-charge-aura-l2, red fx-water-charge-aura-l3.
      waterMount: water ? slot : null,
      waterCharge: water,
      waterHeld: water && !!this._space?.isDown,
      slingFromMount: this.weaponId === 'sling',
      slingMount: this.weaponId === 'sling' ? slot : null,
      fenceOnly: false,
      visualScale: scale / LAYOUT_SCALE,
      scaleX: this.hero.scaleX,
      scaleY: this.hero.scaleY,
    });
    if (fired && !(water && fired === 'water')) this.audio?.playWeaponShot({ id: fired }, fired);
    if (water && this.hint) {
      const tier = this.weapons.chargeTier();
      const held = tier
        ? `charging L${tier} ${(this.weapons.chargeMs() / 1000).toFixed(1)}s`
        : 'SPACE hold';
      this.hint.setText(`${held} · tap L1 · hold 1.8s L2 · 4s L3 · W/S move and shoot · gun stays out · 1–6 switch · R reset`);
    }
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

  /**
   * Lane move for the water try-out. The gun stays on the hero, so a
   * charge started up the lane still has a muzzle when she is moving.
   * @param {number} dt
   */
  _moveHero(dt) {
    const up = !!(this._up?.isDown || this._upArrow?.isDown);
    const down = !!(this._down?.isDown || this._downArrow?.isDown);
    this._moveDy = (down ? 1 : 0) - (up ? 1 : 0);
    if (!this._moveDy) return;
    const step = GAME_CONFIG.PLAYER.MOVE_SPEED * LAYOUT_SCALE * (Math.max(0, dt) / 1000);
    const next = this.heroY + this._moveDy * step;
    this.heroY = Math.min(grassYMax(), Math.max(grassYMin(), next));
  }

  _syncHero() {
    const y = Number.isFinite(this.heroY) ? this.heroY : this.laneY;
    const scale = displayScaleFromY(y);
    this.hero.setPosition(this.heroX, y);
    this.hero.setScale(scale);
    this.hero.setDepth(depthFromY(y));
  }

  /**
   * `player-girl-water-fire`: start, loop while SPACE is down, then the end.
   * Walking plays the north/south sheets only when she is not shooting.
   * @param {boolean} held
   */
  _syncWaterPose(held) {
    const hero = this.hero;
    if (!hero || typeof hero.play !== 'function') return;
    if (this.weaponId !== 'water') {
      this._attackPose = null;
      return;
    }
    const base = HERO_UNARMED.waterFire;
    const start = `${base}:start`;
    const loop = `${base}:loop`;
    const end = `${base}:end`;
    const current = hero.anims?.currentAnim?.key ?? null;
    const playing = !!hero.anims?.isPlaying;
    const play = (key) => {
      if (!this.anims?.exists?.(key)) return false;
      return playLibraryAnim(hero, key, this);
    };
    if (held) {
      this._attackPose = 'hold';
      if ((current === loop || current === start) && playing) return;
      if (current === start && !playing && play(loop, true)) return;
      if (play(start, true) || play(base, true)) return;
      this._attackPose = null;
      return;
    }
    if (this._attackPose === 'hold' || this._attackPose === 'end') {
      if (current === end && playing) {
        this._attackPose = 'end';
        return;
      }
      if (current === end && !playing) this._attackPose = null;
      else if (play(end, false)) {
        this._attackPose = 'end';
        return;
      } else this._attackPose = null;
    }
    if (this._moveDy < 0) play(HERO_UNARMED.walk.north, true);
    else if (this._moveDy > 0) play(HERO_UNARMED.walk.south, true);
    else if (current !== HERO_UNARMED.idle) play(HERO_UNARMED.idle, true);
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
    for (const zombie of this.targets || []) {
      zombie.showcaseHold = false;
      zombie.alive = false;
      zombie.destroyVisuals();
    }
    const xs = this.weaponId === 'water' ? WATER_LINE_X : [this.dummyX];
    const row = WAVE_DEFS[0].archetypes[0];
    this.targets = xs.map((x) => {
      const zombie = new Zombie(this, {
        x,
        y: this.laneY,
        hp: SANDBOX_TARGET_HP,
        speed: row.speed,
        dps: row.dps,
        wave: 1,
        variant: row.variant,
        skin: 'office-worker-v2',
      });
      zombie.showcaseHold = true;
      zombie.placeAt(x);
      zombie.homeX = x;
      zombie.setHpBarShown?.(true);
      return zombie;
    });
    this.target = this.targets[0] || null;
    this._reviveAt = 0;
  }

  /** @param {number} dt */
  _holdTarget(dt) {
    const list = this.targets || [];
    if (!list.length) return;
    let living = 0;
    for (const zombie of list) {
      if (!zombie?.alive || !zombie.body) continue;
      living += 1;
      zombie.tickStatus(dt);
      const home = Number.isFinite(zombie.homeX) ? zombie.homeX : this.dummyX;
      if (zombie.x < home - DRIFT_LIMIT) zombie.placeAt(home);
    }
    if (living > 0) {
      this._reviveAt = 0;
      return;
    }
    if (!this._reviveAt) this._reviveAt = this.time.now + REVIVE_MS;
    if (this.time.now >= this._reviveAt) this._spawnTarget();
  }

  _resolveHits() {
    const list = this.targets || [];
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
      if ((bullet.charge || 0) >= 2) {
        if (this.weapons.stepChargeAoe(bullet, list)) remove.add(i);
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
        if (bullet.weaponId === 'water' && bullet.hitIds?.includes(zombie.id)) continue;
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
          this.weapons.markWaterPierce(bullet, zombie);
          if (!this.weapons.waterKeepsFlying(bullet)) break;
        }
      }
    }
    for (const hit of hits) {
      if (!this.weapons.waterKeepsFlying(hit.bullet)) remove.add(hit.index);
      this.weapons.applyDirectHit(hit.zombie, hit.bullet);
    }
    for (let i = 0; i < this.bullets.length; i++) {
      if (remove.has(i)) continue;
      if (this.weapons.shouldRetireBullet(this.bullets[i])) remove.add(i);
    }
    const indices = Array.from(remove).sort((a, b) => b - a);
    for (const index of indices) {
      const bullet = this.bullets[index];
      this.weapons.releaseChargeAoe?.(bullet);
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
      this.weapons.releaseChargeAoe?.(bullet);
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

  /**
   * Confirms the r2 charge sheets are preloaded at the catalog cell.
   * The color swap itself stays with Gameplay.
   * @returns {string}
   */
  _chargeLoadNote() {
    const missing = [];
    for (const spec of SANDBOX_WATER_CHARGE_SHEETS) {
      const loaded = this.textures?.exists?.(spec.key) === true;
      const asset = libraryAsset(this, spec.key);
      if (!loaded || !sandboxChargeSheetReady(asset, spec)) missing.push(spec.key);
    }
    if (missing.length) return `charge sheets missing ${missing.join(', ')}`;
    const earReady = WATER_EAR_PREVIEW_KEYS.every((key) => this.cache?.audio?.exists?.(key) === true);
    const ear = earReady ? 'ear SFX ready' : 'ear SFX missing';
    return `charge auras blue → l2 → l3 preloaded; L3 512×256; L2 AOE 256×212; ${ear}`;
  }

  _publish() {
    const trait = WEAPON_TRAITS[this.weaponId];
    const text = this.textures.exists(frontKey(this.weaponId))
      ? sandboxWeaponLabel(this.weaponId)
      : `${trait?.label || this.weaponId} · front sheet missing`;
    const chargeNote = this.weaponId === 'water' ? this._chargeLoadNote() : '';
    if (this.caption) this.caption.setText(chargeNote ? `${text} · ${chargeNote}` : text);
    const detail = { id: this.weaponId, text: chargeNote ? `${text} · ${chargeNote}` : text };
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
