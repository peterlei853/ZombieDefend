import { BULLET_SIZE } from '../data/waves.js';
import { GAME_CONFIG } from '../data/GameConfig.js';
import {
  depthFromY,
  displayScaleFromY,
  grassYMin,
  grassYMax,
  barricadeXAtY,
  LAYOUT_SCALE,
  layoutPx,
} from '../systems/DepthView.js';
import { WeaponSystem, WEAPON_SHOTGUN } from '../systems/WeaponSystem.js';
import {
  PLAYER_FRAME_SIZE,
  PLAYER_ORIGIN_X,
  PLAYER_ORIGIN_Y,
  HANDGUN_AIM_KEY,
  HANDGUN_AIM_TEXTURE,
  HANDGUN_AIM_FRAME,
  SHOTGUN_HOLD_KEY,
  SHOTGUN_HOLD_TEXTURE,
  SHOTGUN_HOLD_FRAME,
  SHOTGUN_RECOIL_KEY,
  animDrawsWeapon,
  applyWeaponWalkAliases,
  isPlayerActionAnim,
  isShotgunRecoilAnim,
  locomotionAnimCandidates,
  preferredShotgunRecoilKey,
  registerPlayerAnims,
} from '../assets/playerSprites.js';

/** Player sits this many px right of the grass edge (safe zone), in field px. */
const PLAYER_SAFE_OFFSET = layoutPx(32);
/** Pet (turret) offset from player toward the safer side. */
const PET_OFFSET_X = layoutPx(25);
const PET_OFFSET_Y = layoutPx(-15);
/** Lerp factor per ~16.67ms frame (delta-aware). */
const PET_LERP = 0.16;
/**
 * Player vertical move speed (field px/s from GAME_CONFIG), scaled so a lane
 * sweep takes the same time on the 1280 canvas.
 */
const PLAYER_MOVE_SPEED = GAME_CONFIG.PLAYER.MOVE_SPEED * LAYOUT_SCALE;
/**
 * Shotgun volley kicks the defender right (they face left to shoot).
 * Distances and durations come from GAME_CONFIG.PLAYER. The kick eases out,
 * then eases back onto the lane so the barricade safe-zone X is not left offset.
 * Lane input stays locked for SHOTGUN_MOVE_LOCK_MS, which outlasts the kick.
 */
const SHOTGUN_RECOIL_PX = GAME_CONFIG.PLAYER.SHOTGUN_RECOIL_PX * LAYOUT_SCALE;
const SHOTGUN_RECOIL_MS = GAME_CONFIG.PLAYER.SHOTGUN_RECOIL_MS;
const SHOTGUN_RECOIL_RETURN_MS = GAME_CONFIG.PLAYER.SHOTGUN_RECOIL_RETURN_MS;
/**
 * Weapon icon scale relative to the defender's DepthView scale.
 * Grip sits on the west-facing hand; the sheet already shows the gun
 * during shoot / recoil, so the prop hides while those anims play.
 */
const WEAPON_PROP_SCALE = 0.4;
/** Grip point inside handgun.png (48×32) and shotgun.png (64×32). */
const WEAPON_GRIP = {
  handgun: { x: 0.62, y: 0.72 },
  shotgun: { x: 0.55, y: 0.55 },
};

/**
 * Player + pet behind the barricade.
 * Movement / follow stay here; targeting, fire cadence, ballistics, pet AOE
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
    /**
     * Additive world-X kick from the latest shotgun volley. Eases back to 0.
     * Not underscored: Phaser skips tween props whose names start with `_`.
     */
    this.recoilX = 0;
    /** Bumps when a new volley starts so a stopped tween cannot ease the next one. */
    this._recoilGen = 0;
    /** @type {Phaser.Tweens.Tween|null} */
    this._recoilTween = null;
    /** Remaining shotgun post-fire lane lock. Handgun never sets this. */
    this._shotgunLockMs = 0;

    const yMin = grassYMin();
    const yMax = grassYMax();
    const playerY = (yMin + yMax) / 2;
    const playerX = barricadeXAtY(playerY) + PLAYER_SAFE_OFFSET;
    const playerScale = displayScaleFromY(playerY);

    registerPlayerAnims(scene);
    this.player = this._createPlayerBody(scene, playerX, playerY, playerScale);
    this.weaponProp = this._createWeaponProp(scene, playerX, playerY);

    const petX = playerX + PET_OFFSET_X;
    const petY = playerY + PET_OFFSET_Y;
    const petScale = displayScaleFromY(petY);

    // PIXELLAB_HOOK: replace with sprite turret (Pet)
    this.turret = scene.add.rectangle(petX, petY, 24, 24, 0x78909c);
    this.turret.setStrokeStyle(2, 0x546e7a);
    this.turret.setScale(petScale);
    this.turret.setDepth(depthFromY(petY));
    // Small barrel marker
    this.turretBarrel = scene.add
      .rectangle(petX - layoutPx(16), petY, 14, 6, 0x90a4ae)
      .setScale(petScale)
      .setDepth(depthFromY(petY, 1));

    // W/S + arrow keys for Y-only move. Touch stick is optional (VirtualControls).
    const keyboard = scene.input.keyboard;
    if (keyboard) {
      this.cursors = keyboard.createCursorKeys();
      this.keys = keyboard.addKeys({
        W: Phaser.Input.Keyboard.KeyCodes.W,
        S: Phaser.Input.Keyboard.KeyCodes.S,
        A: Phaser.Input.Keyboard.KeyCodes.A,
        D: Phaser.Input.Keyboard.KeyCodes.D,
      });
    } else {
      this.cursors = null;
      this.keys = null;
    }
    /** @type {import('../ui/VirtualControls.js').VirtualControls|null} */
    this.touchControls = null;
  }

  /**
   * Feet-anchored sprite when the PixelLab sheet is loaded.
   * Frame size comes from the texture (92), not a hard-coded 64 box.
   * Rectangle remains only if the sheet failed to load.
   */
  _createPlayerBody(scene, playerX, playerY, playerScale) {
    if (scene.textures.exists('player-idle') && scene.anims.exists('player-idle')) {
      const player = scene.add.sprite(playerX, playerY, 'player-idle', 0);
      player.setOrigin(PLAYER_ORIGIN_X, PLAYER_ORIGIN_Y);
      player.setScale(playerScale);
      player.setDepth(depthFromY(playerY));
      player.play('player-idle');
      return player;
    }

    const body = scene.add.rectangle(playerX, playerY, 22, 28, 0x42a5f5);
    body.setStrokeStyle(2, 0x1e88e5);
    body.setScale(playerScale);
    body.setDepth(depthFromY(playerY));
    return body;
  }

  _createWeaponProp(scene, playerX, playerY) {
    const key = scene.textures.exists('handgun')
      ? 'handgun'
      : scene.textures.exists('shotgun')
        ? 'shotgun'
        : null;
    if (!key) return null;
    const prop = scene.add.image(playerX, playerY, key);
    prop.setDepth(depthFromY(playerY, 1));
    return prop;
  }

  _clampGrassY(y) {
    return Math.min(grassYMax(), Math.max(grassYMin(), y));
  }

  /** Barricade safe-zone X for a lane Y. Recoil is not part of this anchor. */
  _laneAnchorX(y) {
    return barricadeXAtY(y) + PLAYER_SAFE_OFFSET;
  }

  _syncPlayerTransform() {
    const y = this._clampGrassY(this.player.y);
    this.player.y = y;
    // Lane clamp owns X. Shotgun recoil is a temporary +X on this same body.
    this.player.x = this._laneAnchorX(y) + this.recoilX;
    const s = displayScaleFromY(y);
    this.player.setScale(s);
    this.player.setDepth(depthFromY(y));
    this._syncWeaponProp();
  }

  _syncPetTransform(deltaMs) {
    // Pet stays on the lane anchor — shotgun recoil does not shove the pet.
    const targetX = this._laneAnchorX(this.player.y) + PET_OFFSET_X;
    const targetY = this._clampGrassY(this.player.y + PET_OFFSET_Y);
    // Delta-aware lerp (~PET_LERP per 60fps frame)
    const t = 1 - Math.pow(1 - PET_LERP, deltaMs / (1000 / 60));
    this.turret.x += (targetX - this.turret.x) * t;
    this.turret.y += (targetY - this.turret.y) * t;
    this.turret.y = this._clampGrassY(this.turret.y);

    const s = displayScaleFromY(this.turret.y);
    this.turret.setScale(s);
    this.turret.setDepth(depthFromY(this.turret.y));

    this.turretBarrel.x = this.turret.x - layoutPx(16);
    this.turretBarrel.y = this.turret.y;
    this.turretBarrel.setScale(s);
    this.turretBarrel.setDepth(depthFromY(this.turret.y, 1));
  }

  /**
   * @param {number} deltaMs
   * @param {import('./Zombie.js').Zombie[]} zombies
   * @returns {{ gold: number, kills: number }} always zero here; pet AOE gold comes from resolveHits
   */
  update(deltaMs, zombies) {
    // Player Y-only move (W/S, arrows, or the touch stick). X always tracks
    // the barricade edge. A/D, left/right, and stick X only pick a walk sheet.
    const deltaSec = deltaMs / 1000;
    if (this.weapons.getWeapon() !== WEAPON_SHOTGUN) {
      this._shotgunLockMs = 0;
    } else if (this._shotgunLockMs > 0) {
      this._shotgunLockMs = Math.max(0, this._shotgunLockMs - deltaMs);
    }
    const { dx, dy: inputDy } = this._inputAxes();
    // Lane keys (W/S, arrows, joystick Y) drive the defender. A/D and stick X
    // do not change position, so they do not count as shotgun "moving".
    const laneHeld = inputDy !== 0;
    const shotgunLocked = this._shotgunLockMs > 0;
    const dy = shotgunLocked ? 0 : inputDy;
    if (dy !== 0) {
      this.player.y += dy * PLAYER_MOVE_SPEED * deltaSec;
    }
    this._syncPlayerTransform();
    this._syncPetTransform(deltaMs);

    // Handgun keeps firing while the lane is held. Shotgun waits until the
    // defender is fully stopped and the post-fire lock has expired.
    const fired = this.weapons.updatePlayerFire(
      deltaMs,
      this.player.x,
      this.player.y,
      zombies,
      this.bullets,
      {
        scaleX: this.player.scaleX,
        scaleY: this.player.scaleY,
        canFireShotgun: !laneHeld && !shotgunLocked,
      }
    );
    if (fired === 'shotgun') this._onShotgunVolley();
    this._updateStance(dy, shotgunLocked ? 0 : dx);
    this.weapons.updatePetFire(
      deltaMs,
      this.turret.x,
      this.turret.y,
      zombies,
      this.bullets
    );

    // Move only. Range / off-view retirement happens after hit tests so a
    // pellet can still connect on the frame it reaches maxDistance.
    this.weapons.stepBullets(this.bullets, deltaSec);
    this.weapons.stepCasings(deltaMs);

    return { gold: 0, kills: 0 };
  }

  /**
   * Held keys, or the touch stick when that axis is idle.
   * dy moves the defender (grass clamp is in _syncPlayerTransform).
   * dx only selects a walk sheet — the player cannot leave the lane.
   * Full stick deflection matches a held key (±1).
   * @returns {{ dx: number, dy: number }}
   */
  _inputAxes() {
    let dy = 0;
    let dx = 0;
    if (this.cursors?.up?.isDown || this.keys?.W?.isDown) dy -= 1;
    if (this.cursors?.down?.isDown || this.keys?.S?.isDown) dy += 1;
    if (this.cursors?.left?.isDown || this.keys?.A?.isDown) dx -= 1;
    if (this.cursors?.right?.isDown || this.keys?.D?.isDown) dx += 1;

    const touch = this.touchControls?.getAxes?.();
    if (touch) {
      if (dy === 0) dy = touch.dy || 0;
      if (dx === 0) dx = touch.dx || 0;
    }
    return { dx, dy };
  }

  _currentAnimKey() {
    return this.player?.anims?.currentAnim?.key ?? null;
  }

  _actionAnimPlaying() {
    const anims = this.player?.anims;
    if (!anims?.isPlaying) return false;
    return isPlayerActionAnim(this._currentAnimKey());
  }

  /**
   * @param {string} key
   * @param {boolean} [ignoreIfPlaying]
   */
  _playAnim(key, ignoreIfPlaying = false) {
    const player = this.player;
    if (!player || typeof player.play !== 'function') return false;
    const anims = this.scene?.anims;
    if (!anims || typeof anims.exists !== 'function') return false;
    if (!anims.exists(key)) return false;
    try {
      player.play(key, ignoreIfPlaying);
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Handgun holds `player-handgun-aim` while stopped. Lane movement plays
   * `player-handgun-aim-walk-north` / `south` (west/east only when the lane
   * axis is idle). Shots do not leave that pose. Shotgun uses the matching
   * hold / hold-walk sheets, and a volley plays `player-shotgun-fire-recoil`
   * when that sheet is registered. Depth walks are never flipX'd — the
   * muzzle stays on the left for combat.
   * @param {number} dy
   * @param {number} dx
   */
  _updateStance(dy, dx) {
    const player = this.player;
    if (!player) return;
    if (typeof player.setFlipX === 'function') {
      player.setFlipX(false);
      player.setFlipY(false);
    }
    if (typeof player.play !== 'function') return;

    const shotgun = this.weapons.getWeapon() === WEAPON_SHOTGUN;
    const stance = shotgun ? 'shotgun' : 'handgun';
    applyWeaponWalkAliases(this.scene, stance);
    if (shotgun && this._recoilAnimPlaying()) {
      this._syncWeaponProp();
      return;
    }

    const moving = dy !== 0 || dx !== 0;
    if (moving) {
      this._playFirstExisting(locomotionAnimCandidates(dy, dx, stance));
    } else if (shotgun) {
      if (!this._playFirstExisting([SHOTGUN_HOLD_KEY])) {
        this._holdFrame(SHOTGUN_HOLD_TEXTURE, SHOTGUN_HOLD_FRAME) ||
          this._playFirstExisting(['player-idle']);
      }
    } else if (!this._playFirstExisting([HANDGUN_AIM_KEY])) {
      this._holdFrame(HANDGUN_AIM_TEXTURE, HANDGUN_AIM_FRAME) ||
        this._playFirstExisting(['player-idle']);
    }
    this._syncWeaponProp();
  }

  _recoilAnimPlaying() {
    const anims = this.player?.anims;
    if (!anims?.isPlaying) return false;
    return isShotgunRecoilAnim(this._currentAnimKey());
  }

  /**
   * @param {string[]} keys
   * @returns {boolean}
   */
  _playFirstExisting(keys) {
    const anims = this.scene?.anims;
    if (!anims || typeof anims.exists !== 'function') return false;
    for (const key of keys) {
      if (!anims.exists(key)) continue;
      if (this._currentAnimKey() === key && this.player.anims?.isPlaying) return true;
      return this._playAnim(key, true);
    }
    return false;
  }

  /**
   * Freeze one frame when a still-anim key is missing.
   * @param {string} textureKey
   * @param {number} frame
   */
  _holdFrame(textureKey, frame) {
    const player = this.player;
    if (!player || typeof player.setTexture !== 'function') return false;
    if (!this.scene?.textures?.exists?.(textureKey)) return false;
    const tex = this.scene.textures.get(textureKey);
    const hasFrame =
      typeof tex?.has !== 'function' || tex.has(frame) || tex.has(String(frame));
    if (!hasFrame) return false;
    try {
      player.anims?.stop?.();
    } catch (_) {
      /* rectangle / missing anim component */
    }
    player.setTexture(textureKey, frame);
    return true;
  }

  /**
   * One shotgun volley (not each pellet): recoil anim, +12px kick, 300ms
   * lane lock, camera shake. Shell casing and muzzle flash spawn with the fan.
   */
  _onShotgunVolley() {
    this._shotgunLockMs = GAME_CONFIG.PLAYER.SHOTGUN_MOVE_LOCK_MS;
    this._playShotgunRecoilAnim();
    this._kickShotgunRecoil();
    if (typeof this.scene?.onShotgunFired === 'function') {
      this.scene.onShotgunFired();
    }
  }

  /**
   * Play only when the anim is registered and this body can play it
   * (placeholder rectangle has no play).
   */
  _playShotgunRecoilAnim() {
    const preferred = preferredShotgunRecoilKey(this.scene);
    if (!this._playAnim(preferred, false) && preferred !== SHOTGUN_RECOIL_KEY) {
      this._playAnim(SHOTGUN_RECOIL_KEY, false);
    }
    this._syncWeaponProp();
  }

  /**
   * Equipped weapon icon on the west hand. Hidden while shoot / recoil
   * frames already draw the gun. Position is a fraction of the frame
   * (feet origin), scaled with DepthView — not a fixed 64px offset.
   */
  _syncWeaponProp() {
    const prop = this.weaponProp;
    const player = this.player;
    if (!prop || !player?.active) return;

    const shotgun = this.weapons.getWeapon() === WEAPON_SHOTGUN;
    const key = shotgun ? 'shotgun' : 'handgun';
    if (this.scene.textures.exists(key) && prop.texture?.key !== key) {
      prop.setTexture(key);
    }
    const grip = WEAPON_GRIP[key] ?? WEAPON_GRIP.handgun;
    prop.setOrigin(grip.x, grip.y);

    // Aim, hold, armed walks, and recoil sheets already include the gun.
    // Walk-up and walk-down keep the authored north/south pixels (no flip).
    // The prop only shows on the unarmed west-facing locomotion sheets.
    const facing = this._currentAnimKey();
    const facingWest = !facing || facing === 'player-idle' || facing === 'player-walk-west';
    prop.setVisible(!animDrawsWeapon(facing) && !this._actionAnimPlaying() && facingWest);

    const s = player.scaleX || 1;
    const frameW = player.width || PLAYER_FRAME_SIZE;
    const frameH = player.height || PLAYER_FRAME_SIZE;
    // West-facing hand, as a fraction of the frame above the feet anchor.
    // Grip overlaps the forward hand; the barrel sticks out to the left.
    const handX = frameW * 0.02;
    const handY = -frameH * 0.30;
    prop.setScale(s * WEAPON_PROP_SCALE);
    prop.setPosition(player.x + handX * s, player.y + handY * s);
    prop.setDepth((player.depth ?? depthFromY(player.y)) + 1);
  }

  _stopRecoilTween() {
    if (!this._recoilTween) return;
    this._recoilTween.stop();
    this._recoilTween = null;
  }

  /**
   * Tween the defender body +12 field px on X (Quad.easeOut, 80ms), then ease
   * back over 120ms. Y is never part of the tween. Lane input stays locked
   * separately for SHOTGUN_MOVE_LOCK_MS.
   */
  _kickShotgunRecoil() {
    this._recoilGen += 1;
    const gen = this._recoilGen;
    this._stopRecoilTween();
    const scene = this.scene;
    if (!scene?.tweens) return;

    this._recoilTween = scene.tweens.add({
      targets: this,
      recoilX: SHOTGUN_RECOIL_PX,
      duration: SHOTGUN_RECOIL_MS,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        if (gen !== this._recoilGen) return;
        this._applyRecoilOffset();
      },
      onComplete: () => {
        if (gen !== this._recoilGen) return;
        this._recoilTween = null;
        this._easeRecoilBack();
      },
    });
  }

  _easeRecoilBack() {
    const gen = this._recoilGen;
    const scene = this.scene;
    if (!scene?.tweens || !this.player?.active) {
      this.recoilX = 0;
      return;
    }
    this._recoilTween = scene.tweens.add({
      targets: this,
      recoilX: 0,
      duration: SHOTGUN_RECOIL_RETURN_MS,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        if (gen !== this._recoilGen) return;
        this._applyRecoilOffset();
      },
      onComplete: () => {
        if (gen !== this._recoilGen) return;
        this.recoilX = 0;
        this._recoilTween = null;
        this._applyRecoilOffset();
      },
    });
  }

  /** Re-apply lane anchor + current recoil without touching Y clamp rules. */
  _applyRecoilOffset() {
    if (!this.player?.active) return;
    const y = this._clampGrassY(this.player.y);
    this.player.y = y;
    this.player.x = this._laneAnchorX(y) + this.recoilX;
    this._syncWeaponProp();
  }

  /**
   * Resolve bullet ↔ zombie hits (per-pellet shotgun + pet on-hit AOE).
   * Pair living bodies first, then damage — never splice or takeDamage mid-scan.
   * A zombie killed by an earlier pellet is skipped by later pellets.
   * @param {import('./Zombie.js').Zombie[]} zombies
   * @returns {{ gold: number, kills: number }}
   */
  resolveHits(zombies) {
    let gold = 0;
    let kills = 0;
    const list = Array.isArray(zombies) ? zombies : [];
    /** @type {Set<number>} */
    const remove = new Set();
    /** @type {{ index: number, bullet: object, zombie: import('./Zombie.js').Zombie, bx: number, by: number }[]} */
    const hits = [];

    // Pass 1 — pair only. Do not takeDamage here; a kill nulls body and would
    // throw on the next bounds read (the old shotgun hang).
    for (let i = 0; i < this.bullets.length; i++) {
      const b = this.bullets[i];
      if (!b?.gfx || b.gfx.active === false) {
        remove.add(i);
        continue;
      }
      const half = ((b.size ?? BULLET_SIZE * LAYOUT_SCALE) / 2) + 2 * LAYOUT_SCALE;
      const bx = b.gfx.x;
      const by = b.gfx.y;
      let hitZombie = null;

      for (const z of list) {
        if (!z?.alive || !z.body) continue;
        const bounds = z.getBounds();
        if (!bounds) continue;
        if (
          bx + half >= bounds.left &&
          bx - half <= bounds.right &&
          by + half >= bounds.top &&
          by - half <= bounds.bottom
        ) {
          hitZombie = z;
          break;
        }
      }

      if (!hitZombie) continue;
      hits.push({ index: i, bullet: b, zombie: hitZombie, bx, by });
    }

    // Pass 2 — damage / knockback / pet AOE. Later pellets no-op if an earlier
    // one already destroyed that zombie.
    for (const hit of hits) {
      remove.add(hit.index);
      const b = hit.bullet;
      if (b.kind === 'pet') {
        const z = hit.zombie;
        const ix = Number.isFinite(hit.bx) ? hit.bx : z?.x;
        const iy = Number.isFinite(hit.by) ? hit.by : z?.y;
        const aoe = this.weapons.applyPetAoe(ix, iy, list);
        gold += aoe.gold;
        kills += aoe.kills;
      } else {
        const gain = this.weapons.applyDirectHit(hit.zombie, b);
        gold += gain.gold;
        kills += gain.kills;
      }
    }

    for (let i = 0; i < this.bullets.length; i++) {
      if (remove.has(i)) continue;
      if (this.weapons.shouldRetireBullet(this.bullets[i])) remove.add(i);
    }

    const indices = Array.from(remove).sort((a, b) => b - a);
    for (const i of indices) this._retireBullet(i);

    return { gold, kills };
  }

  /**
   * @param {number} index
   */
  _retireBullet(index) {
    const b = this.bullets[index];
    this._destroyBulletParts(b);
    this.bullets.splice(index, 1);
  }

  /** @param {object|undefined} b */
  _destroyBulletParts(b) {
    if (!b) return;
    for (const key of ['gfx', 'trail']) {
      if (!b[key]) continue;
      try {
        b[key].destroy();
      } catch (_) {
        /* already destroyed */
      }
      b[key] = null;
    }
  }

  destroy() {
    this._recoilGen += 1;
    this._stopRecoilTween();
    this.recoilX = 0;
    this._shotgunLockMs = 0;
    this.weapons.destroyEffects();
    for (const b of this.bullets) this._destroyBulletParts(b);
    this.bullets = [];
    this.weaponProp?.destroy();
    this.weaponProp = null;
    this.player.destroy();
    this.turret.destroy();
    this.turretBarrel.destroy();
  }
}
