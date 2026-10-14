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
import { HeroFloats } from '../systems/HeroFloats.js';
import { libraryAnimReady, playLibraryAnim } from '../assets/libraryAssets.js';
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
import {
  HERO_ORIGIN_X,
  HERO_ORIGIN_Y,
  heroLibraryReady,
  heroLocomotionKeys,
} from '../assets/heroLoadout.js';
import {
  HERO_UNARMED,
  createDeployMachine,
  stepDeploy,
  unarmedAnimKeys,
} from '../assets/heroDeploy.js';
import { PetCombat } from '../systems/PetCombat.js';

/** Player sits this many px right of the grass edge (safe zone), in field px. */
const PLAYER_SAFE_OFFSET = layoutPx(32);
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
 * Player on the barricade lane. Baby pets are not spawned here — the
 * pet bar summons and recalls them through `summonPet`. PetCombat owns the sprites.
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
    this.weapons.setOwnedWeapons(opts.ownedWeapons || []);
    this.weapons.setUpgrades(opts.upgrades);
    this.floats = new HeroFloats(scene);
    this.floats.setWeapons(this.weapons.ownedIds());
    /** @type {import('../systems/WaterMounts.js').WaterMounts|null} */
    this.waterMounts = opts.waterMounts || null;
    /** @type {import('../systems/SlingMounts.js').SlingMounts|null} */
    this.slingMounts = opts.slingMounts || null;
    const ownedNow = this.weapons.ownedIds();
    const soleWater = this.waterMounts && ownedNow.length === 1 && ownedNow[0] === 'water';
    const soleSling = this.slingMounts && ownedNow.length === 1 && ownedNow[0] === 'sling';
    if (soleWater || soleSling) {
      this.floats.setFenceMounts(true);
    }
    this._deploy = createDeployMachine();
    /** Unarmed girl + front-float guns. Legacy handgun/shotgun stays when that sheet is missing. */
    this._frontFloat = heroLibraryReady(scene);
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
    let playerY = (yMin + yMax) / 2;
    if (this.waterMounts && ownedNow.length === 1 && ownedNow[0] === 'water') {
      const slot = this.waterMounts.nearest(playerY);
      if (slot) playerY = slot.y;
    }
    if (this.slingMounts && ownedNow.length === 1 && ownedNow[0] === 'sling') {
      const slot = this.slingMounts.nearest(playerY);
      if (slot) playerY = slot.y;
    }
    const playerX = barricadeXAtY(playerY) + PLAYER_SAFE_OFFSET;
    const playerScale = displayScaleFromY(playerY);

    registerPlayerAnims(scene);
    this.player = this._createPlayerBody(scene, playerX, playerY, playerScale);
    this.weaponProp = this._createWeaponProp(scene, playerX, playerY);

    this.petCombat = new PetCombat(scene);

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
    const heroKey = this._frontFloat
      ? HERO_UNARMED.idle
      : this.weapons.getSkin?.()?.idle;
    if (heroKey && scene.textures.exists(heroKey) && scene.anims.exists(heroKey)) {
      // PIXELLAB_HOOK: player-girl-idle — 92px, feet at y=76, faces west. Guns float in front.
      const player = scene.add.sprite(playerX, playerY, heroKey, 0);
      player.setOrigin(HERO_ORIGIN_X, HERO_ORIGIN_Y);
      player.setScale(playerScale);
      player.setDepth(depthFromY(playerY));
      playLibraryAnim(player, heroKey, scene);
      return player;
    }
    if (scene.textures.exists('player-idle') && scene.anims.exists('player-idle')) {
      const player = scene.add.sprite(playerX, playerY, 'player-idle', 0);
      player.setOrigin(PLAYER_ORIGIN_X, PLAYER_ORIGIN_Y);
      player.setScale(playerScale);
      player.setDepth(depthFromY(playerY));
      playLibraryAnim(player, 'player-idle', scene);
      return player;
    }

    const body = scene.add.rectangle(playerX, playerY, 22, 28, 0x42a5f5);
    body.setStrokeStyle(2, 0x1e88e5);
    body.setScale(playerScale);
    body.setDepth(depthFromY(playerY));
    return body;
  }

  _createWeaponProp(scene, playerX, playerY) {
    // Front-float guns replace the loose icon. Armed library sheets did too.
    if (this._frontFloat || this.weapons.getSkin?.()) return null;
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

  /**
   * Tap a pet bar. Ready summons (no deploy cooldown, enemies not required).
   * On the field, the same tap recalls. Revive rejects the tap.
   * @param {number} index party order
   * @param {import('./Zombie.js').Zombie[]} zombies
   */
  summonPet(index, zombies) {
    return (
      this.petCombat?.summon(index, { x: this.player.x, y: this.player.y }, zombies) || {
        ok: false,
        reason: 'missing',
      }
    );
  }

  /** Living summoned pets for zombie aggro. */
  fieldPets() {
    return this.petCombat?.fieldPets() || [];
  }

  /** True while a tier-3 ultimate letterbox is holding combat. */
  combatFrozen() {
    return !!this.petCombat?.ultPlaying;
  }

  /**
   * Advance only the ult overlay. Player, pets, and bullets stay put.
   * @param {number} deltaMs real milliseconds, not hitlag
   */
  tickCombatFreeze(deltaMs) {
    return this.petCombat?.update(deltaMs, []) || { gold: 0, kills: 0 };
  }

  /**
   * @param {number} deltaMs
   * @param {import('./Zombie.js').Zombie[]} zombies
   * @returns {{ gold: number, kills: number }} pet kills only; bullet gold comes from resolveHits
   */
  update(deltaMs, zombies) {
    // Player Y-only move (W/S, arrows, or the touch stick). X always tracks
    // the barricade edge. A/D, left/right, and stick X only pick a walk sheet.
    const deltaSec = deltaMs / 1000;
    if (this._frontFloat || this.weapons.getWeapon() !== WEAPON_SHOTGUN) {
      this._shotgunLockMs = 0;
    } else if (this._shotgunLockMs > 0) {
      this._shotgunLockMs = Math.max(0, this._shotgunLockMs - deltaMs);
    }
    const { dx, dy: inputDy } = this._inputAxes();
    // Lane keys (W/S, arrows, joystick Y) drive the defender. A/D and stick X
    // do not change position. Either axis is "moving" for gun deploy: walk
    // hides the guns and blocks fire.
    const laneHeld = inputDy !== 0;
    const shotgunLocked = !this._frontFloat && this._shotgunLockMs > 0;
    const dy = shotgunLocked ? 0 : inputDy;
    if (dy !== 0) {
      this.player.y += dy * PLAYER_MOVE_SPEED * deltaSec;
    }
    this._syncPlayerTransform();

    let fired = null;
    if (this._frontFloat) {
      const moving = dy !== 0 || dx !== 0;
      this._deploy = stepDeploy(this._deploy, moving, deltaMs);
      const waterSlot = this.waterMounts?.aligned(this.player.y) || null;
      this.waterMounts?.setActive(waterSlot ? waterSlot.index : -1);
      const slingSlot = this.slingMounts?.aligned(this.player.y) || null;
      this.slingMounts?.setActive(slingSlot ? slingSlot.index : -1);
      const ownedIds = this.weapons.ownedIds();
      const command =
        this._deploy.phase === 'fire' &&
        ((!!waterSlot && ownedIds.includes('water')) ||
          (!!slingSlot && ownedIds.includes('sling')));
      this._updateUnarmedPose(this._deploy.phase, dy, dx, { command });
      this.floats?.setSelected(this.weapons.getSkin?.()?.id);
      this.floats?.sync(this.player, this._deploy);
      const visualScale = Math.abs(this.player.scaleX || 1) / LAYOUT_SCALE;
      fired = this.weapons.updatePlayerFire(
        deltaMs,
        this.player.x,
        this.player.y,
        zombies,
        this.bullets,
        {
          frontFloat: true,
          canFire: this._deploy.canFire,
          muzzles: this.floats?.muzzles() || [],
          waterMount: waterSlot,
          slingFromMount: !!this.slingMounts,
          slingMount: slingSlot,
          visualScale,
          scaleX: this.player.scaleX,
          scaleY: this.player.scaleY,
        }
      );
    } else {
      // Handgun keeps firing while the lane is held. Shotgun waits until the
      // defender is fully stopped and the post-fire lock has expired.
      fired = this.weapons.updatePlayerFire(
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
      this._updateStance(dy, shotgunLocked ? 0 : dx);
    }
    // One fire SFX per volley. Front-float passes the weapon id that actually shot.
    if (fired) {
      const cue = this._frontFloat ? { id: fired } : this.weapons.getSkin?.();
      this.scene.audio?.playWeaponShot(cue, fired);
    }
    if (!this._frontFloat && fired === 'shotgun') this._onShotgunVolley();
    else if (!this._frontFloat && fired === 'handgun' && dy === 0 && dx === 0) this._playWeaponFire();
    const petGain =
      this.petCombat?.update(deltaMs, zombies, { x: this.player.x, y: this.player.y }) || {
        gold: 0,
        kills: 0,
      };

    // Move only. Range / off-view retirement happens after hit tests so a
    // pellet can still connect on the frame it reaches maxDistance.
    this.weapons.stepBullets(this.bullets, deltaSec);
    this.weapons.stepCasings(deltaMs);
    this.weapons.stepOverlays?.(deltaMs);

    return petGain;
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
    let anim = null;
    try {
      anim = typeof anims.get === 'function' ? anims.get(key) : null;
    } catch (_) {
      anim = null;
    }
    if (!libraryAnimReady(anim)) return false;
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
  /**
   * Unarmed body. Deploy plays once. Fire stays on idle unless the hero
   * is stopped behind a water or sling mount, which holds the tower-fire
   * still (command is the backup). Walk prefers a run sheet when one is loaded.
   * @param {'move'|'hold'|'deploy'|'fire'} phase
   * @param {number} dy
   * @param {number} dx
   * @param {{ command?: boolean }} [pose]
   */
  _updateUnarmedPose(phase, dy, dx, pose = {}) {
    const player = this.player;
    if (!player) return;
    if (typeof player.setFlipX === 'function') {
      player.setFlipX(false);
      player.setFlipY(false);
    }
    if (typeof player.play !== 'function') return;
    if (phase === 'deploy') {
      const key = HERO_UNARMED.deploy;
      if (this._currentAnimKey() !== key) this._playAnim(key, true);
      return;
    }
    if (phase === 'move') {
      this._playFirstExisting(unarmedAnimKeys(dy, dx));
      return;
    }
    if (phase === 'fire' && pose.command) {
      // Both poses are one-frame stills, so neither registers an anim.
      const poses = [HERO_UNARMED.towerFire, HERO_UNARMED.command];
      if (this._playFirstExisting(poses)) return;
      for (const key of poses) {
        if (this._holdStill(key)) return;
      }
    }
    this._playFirstExisting([HERO_UNARMED.idle, 'player-idle']);
  }

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
    const skin = this.weapons.getSkin?.();
    if (skin) {
      if (this._fireAnimPlaying()) {
        this._syncWeaponProp();
        return;
      }
      this._playFirstExisting(heroLocomotionKeys(skin, dy, dx));
      this._syncWeaponProp();
      return;
    }
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

  _fireAnimPlaying() {
    const fire = this.weapons.getSkin?.()?.fire;
    if (!fire) return false;
    const anims = this.player?.anims;
    if (!anims?.isPlaying) return false;
    return this._currentAnimKey() === fire;
  }

  _playWeaponFire() {
    const key = this.weapons.getSkin?.()?.fire;
    if (key) this._playAnim(key, false);
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
   * Show a one-frame library still (tower-fire, or command as backup).
   * Origin stays whatever the body was created with — both share the idle feet.
   * @param {string} textureKey
   */
  _holdStill(textureKey) {
    const player = this.player;
    if (!player || typeof player.setTexture !== 'function') return false;
    if (!this.scene?.textures?.exists?.(textureKey)) return false;
    if (player.texture?.key === textureKey && !player.anims?.isPlaying) return true;
    try {
      player.anims?.stop?.();
    } catch (_) {
      /* rectangle / missing anim component */
    }
    player.setTexture(textureKey);
    return true;
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
   * One shotgun volley (not each pellet): recoil anim, body kick, lane lock.
   * The camera does not shake. Shell casing and muzzle flash still spawn
   * with the fan.
   */
  _onShotgunVolley() {
    this._shotgunLockMs = GAME_CONFIG.PLAYER.SHOTGUN_MOVE_LOCK_MS;
    this._playShotgunRecoilAnim();
    this._kickShotgunRecoil();
  }

  /**
   * Play only when the anim is registered and this body can play it
   * (placeholder rectangle has no play).
   */
  _playShotgunRecoilAnim() {
    if (this.weapons.getSkin?.()) {
      this._playWeaponFire();
      return;
    }
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
   * Resolve bullet ↔ zombie hits (per-pellet shotgun). Pet strikes are not bullets.
   * Pair living bodies first, then damage — never splice or takeDamage mid-scan.
   * A zombie killed by an earlier pellet is skipped by later pellets.
   * @param {import('./Zombie.js').Zombie[]} zombies
   * @returns {{ gold: number, kills: number }}
   */
  resolveHits(zombies) {
    let gold = 0;
    let kills = 0;
    const list = Array.isArray(zombies) ? zombies : [];
    this.weapons.armHits?.(list, this.bullets);
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
        if (
          b.ignoreId != null &&
          z.id === b.ignoreId &&
          (b.traveled || 0) < (b.armTravel || 0)
        ) {
          continue;
        }
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

    // Pass 2 — damage / knockback. Later pellets no-op if an earlier
    // one already destroyed that zombie.
    for (const hit of hits) {
      remove.add(hit.index);
      const gain = this.weapons.applyDirectHit(hit.zombie, hit.bullet);
      gold += gain.gold;
      kills += gain.kills;
    }

    for (let i = 0; i < this.bullets.length; i++) {
      if (remove.has(i)) continue;
      if (this.weapons.shouldRetireBullet(this.bullets[i])) remove.add(i);
    }

    const indices = Array.from(remove).sort((a, b) => b - a);
    for (const i of indices) this._retireBullet(i);

    const pending = this.weapons.consumePending?.() || { gold: 0, kills: 0 };
    return { gold: gold + (pending.gold || 0), kills: kills + (pending.kills || 0) };
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
    this.petCombat?.destroy();
    this.petCombat = null;
    this.floats?.destroy();
    this.floats = null;
    this.weapons.destroyEffects();
    for (const b of this.bullets) this._destroyBulletParts(b);
    this.bullets = [];
    this.weaponProp?.destroy();
    this.weaponProp = null;
    this.player.destroy();
  }
}
