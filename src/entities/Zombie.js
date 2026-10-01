import { getGoldByHP } from '../data/economy.js';
import {
  GAME_CONFIG,
  isCriticalHp,
  isOverkillHit,
  resolveZombieVariant,
  woundedMoveSpeed,
  zombieTypeDef,
} from '../data/GameConfig.js';
import {
  ZOMBIE_ORIGIN_X,
  ZOMBIE_ORIGIN_Y,
  hasZombieAnim,
  registerZombieAnims,
  zombieSheetKey,
} from '../assets/zombieSprites.js';
import { depthFromY, displayScaleFromY, LAYOUT_SCALE } from '../systems/DepthView.js';
import { beginHitlag, shakeOverkill, spawnBlood, spawnFragments } from '../systems/combatJuice.js';

let _zombieId = 0;

/**
 * Lane zombie. Walks right until barricade contact, then bites.
 * PixelLab strips (`zombie-walker|runner|tank` + walk/attack/stumble/death)
 * replace the rectangle when that texture is loaded; otherwise the colored
 * square stays. Scale and draw-order follow lane Y (2.5D DepthView).
 */
export class Zombie {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ x: number, y: number, hp: number, speed: number, dps: number, wave?: number, variant?: string }} cfg
   */
  constructor(scene, cfg) {
    this.scene = scene;
    this.id = ++_zombieId;
    this.maxHp = cfg.hp;
    this.hp = cfg.hp;
    this.speed = cfg.speed;
    this.dps = cfg.dps;
    this.wave = cfg.wave || 1;
    this.variant = resolveZombieVariant({
      variant: cfg.variant,
      hp: cfg.hp,
      speed: cfg.speed,
    });
    this.typeDef = zombieTypeDef(this.variant);
    this.knockbackMult = this.typeDef.knockbackMult ?? 1;
    this.baseSize = cfg.hp >= 150 ? 26 : cfg.hp >= 100 ? 22 : 18;
    this.alive = true;
    this.atBarricade = false;
    /** Seconds until the next barricade bite (punch + hit VFX). */
    this._attackCooldown = 1;
    this._attackBeat = false;
    /** Halt X while chewing, so the lunge tween can return here. */
    this._haltX = null;
    /** Fractional contact DPS waiting to be shown as an integer. */
    this.barricadeDmgAccum = 0;
    this.goldValue = getGoldByHP(this.maxHp);
    this.laneY = cfg.y;
    this._lastX = cfg.x;
    this._lastY = cfg.y;
    this.scale = displayScaleFromY(cfg.y);
    /** @type {'normal'|'overkill'|null} */
    this._deathMode = null;
    this._flashToken = 0;

    registerZombieAnims(scene);
    const walkKey = zombieSheetKey(this.variant, 'walk');
    this._isSprite = !!(scene.textures?.exists?.(walkKey) && scene.anims?.exists?.(walkKey));
    this.variantScale = this._isSprite ? 1 : this.typeDef.placeholderScale || 1;
    this._baseFill = this.typeDef.placeholderColor;
    this._baseStroke = this.typeDef.placeholderStroke;

    // PIXELLAB_HOOK: rectangle stands in until `{prefix}-walk` is in the cache
    this.body = this._isSprite
      ? this._createSprite(scene, cfg.x, cfg.y, walkKey)
      : this._createPlaceholder(scene, cfg.x, cfg.y);

    const barW = Math.max(20, (this._isSprite ? 28 : this.baseSize * this.variantScale) + 6) * this.scale;
    const barY = this.visualTop - 8 * this.scale;
    this.hpBarBg = scene.add.rectangle(cfg.x, barY, barW, 5 * this.scale, 0x1a1a1a);
    this.hpBarFg = scene.add
      .rectangle(cfg.x - barW / 2, barY, barW, 5 * this.scale, 0xff5252)
      .setOrigin(0, 0.5);
    this._barW = barW;

    this._applyDepth();
    this._syncLocomotion();
  }

  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {string} walkKey
   */
  _createSprite(scene, x, y, walkKey) {
    const sprite = scene.add.sprite(x, y, walkKey, 0);
    // Lane Y is the sole. Sheets are west-facing 64×64; origin stays (0.5, 1.0).
    sprite.setOrigin(ZOMBIE_ORIGIN_X, ZOMBIE_ORIGIN_Y);
    sprite.setScale(this.scale);
    // March is +X toward the right-side barricade, so mirror for the lifetime.
    this._faceBarricade(sprite);
    return sprite;
  }

  /**
   * PixelLab strips look west. Walk, stumble, and attack all keep flipX
   * so the zombie faces the barricade. Nothing in combat needs a left face.
   * @param {Phaser.GameObjects.Sprite} [sprite]
   */
  _faceBarricade(sprite = this.body) {
    if (!this._isSprite || !sprite) return;
    if (typeof sprite.setFlipX === 'function') sprite.setFlipX(true);
    else sprite.flipX = true;
  }

  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   */
  _createPlaceholder(scene, x, y) {
    const body = scene.add.rectangle(x, y, this.baseSize, this.baseSize, this._baseFill);
    body.setStrokeStyle(1, this._baseStroke);
    body.setScale(this.scale * this.variantScale);
    return body;
  }

  /** Wounded walk: stumble strip when it is registered, otherwise the current walk. */
  isCritical() {
    return this.alive && isCriticalHp(this.hp, this.maxHp);
  }

  /** Horizontal half-width. Barricade contact uses this so the right edge stops on the post. */
  get displayHalf() {
    if (this._isSprite && this.body) return Math.abs(this.body.displayWidth) / 2;
    return (this.baseSize * this.scale * this.variantScale) / 2;
  }

  /** Top of the sprite (feet at body.y) or of the centered placeholder square. */
  get visualTop() {
    if (!this.body) return this._lastY;
    if (this._isSprite) return this.body.y - Math.abs(this.body.displayHeight);
    return this.body.y - (this.baseSize * this.scale * this.variantScale) / 2;
  }

  /** Chest / square center. Floating numbers and gibs start here. */
  get bodyCenterY() {
    if (!this.body) return this._lastY;
    if (this._isSprite) return this.body.y - Math.abs(this.body.displayHeight) / 2;
    return this.body.y;
  }

  /** @deprecated use baseSize / displayHalf — kept as alias for callers expecting .size */
  get size() {
    return this.baseSize * this.scale * this.variantScale;
  }

  get x() {
    return this.body ? this.body.x : this._lastX;
  }

  get y() {
    return this.body ? this.body.y : this._lastY;
  }

  /**
   * Shove the zombie left along its lane. Y stays on laneY.
   * Releases barricade lock and any bite tween so the shove is not snapped back.
   * Tanks apply knockbackMult (still the handgun / pellet distances from GameConfig).
   * No-op if already dead or the body is gone.
   * @param {number} pixels
   */
  applyKnockback(pixels) {
    if (!this.alive || !this.body) return;
    const amount = Number(pixels) * (this.knockbackMult ?? 1);
    if (!(amount > 0) || !Number.isFinite(amount)) return;
    if (this.scene?.tweens?.killTweensOf) {
      this.scene.tweens.killTweensOf(this.body);
    }
    this.body.x -= amount;
    if (Number.isFinite(this.laneY)) this.body.y = this.laneY;
    this._lastX = this.body.x;
    this._lastY = this.body.y;
    if (this.atBarricade) {
      this.atBarricade = false;
      this._haltX = null;
      this._attackCooldown = 1;
      this._attackBeat = false;
    }
    this._syncBars();
    this._applyDepth();
  }

  _applyDepth() {
    const y = this.body ? this.body.y : this.laneY;
    const d = depthFromY(y);
    if (this.body) this.body.setDepth(d);
    if (this.hpBarBg) this.hpBarBg.setDepth(d + 1);
    if (this.hpBarFg) this.hpBarFg.setDepth(d + 2);
  }

  /**
   * @param {number} deltaSec
   * @param {number} contactX
   */
  update(deltaSec, contactX) {
    if (!this.alive) return;

    if (!this.atBarricade) {
      // Wave speed is field px/s. LAYOUT_SCALE keeps time-to-contact on the wider canvas.
      // Critical HP uses CRIT_SPEED_MULT (stumble sheet or not).
      const speed = woundedMoveSpeed(this.speed, this.hp, this.maxHp);
      const nextX = this.body.x + speed * LAYOUT_SCALE * deltaSec;
      const halt = contactX - this.displayHalf;
      if (nextX >= halt) {
        this.body.x = halt;
        this.atBarricade = true;
        this._haltX = halt;
        this._stopWalkAnim();
      } else {
        this.body.x = nextX;
      }
    }

    if (this.atBarricade) {
      this._attackCooldown -= deltaSec;
      if (this._attackCooldown <= 0) {
        this._attackCooldown += 1;
        if (this._attackCooldown < 0) this._attackCooldown = 0;
        this._playAttackPunch();
        this._attackBeat = true;
      }
    } else {
      this._syncLocomotion();
    }

    // Attack and locomotion must not flip back to the sheet's west face.
    this._faceBarricade();
    this._applyDepth();
    this._syncBars();
  }

  /**
   * True once on each ~1s bite while this zombie is dealing contact DPS.
   * StageScene uses the beat for flash / claw / damage text; DPS math stays per-frame.
   */
  consumeAttackBeat() {
    const beat = this._attackBeat;
    this._attackBeat = false;
    return beat;
  }

  /** Queue fractional barricade DPS for the next integer floating number. */
  addBarricadeDmg(amount) {
    if (amount > 0) this.barricadeDmgAccum += amount;
  }

  /**
   * Whole HP lost since the last pop. Remainder stays queued so the readout
   * tracks applyDamage without printing a fraction every frame.
   */
  popBarricadeDmgInt() {
    const shown = Math.floor(this.barricadeDmgAccum + 1e-6);
    if (shown <= 0) return 0;
    this.barricadeDmgAccum -= shown;
    return shown;
  }

  /** Stop the walk or stumble while the body leans into the barricade. */
  _stopWalkAnim() {
    if (!this._isSprite || !this.body?.anims) return;
    const key = this.body.anims.currentAnim?.key || '';
    if (key.endsWith('-walk') || key.endsWith('-stumble')) this.body.anims.stop();
  }

  /**
   * Stumble loop when that sheet is registered and HP is critical.
   * Otherwise keep the walk loop. No-op for rectangle placeholders.
   */
  _syncLocomotion() {
    if (!this._isSprite || !this.body?.anims || !this.alive || this.atBarricade) return;
    const stumble = zombieSheetKey(this.variant, 'stumble');
    const walk = zombieSheetKey(this.variant, 'walk');
    const key = this.isCritical() && hasZombieAnim(this.scene, this.variant, 'stumble') ? stumble : walk;
    if (!this.scene.anims.exists(key)) return;
    const current = this.body.anims.currentAnim?.key;
    if (current === key && this.body.anims.isPlaying) {
      this._faceBarricade();
      return;
    }
    this.body.play(key);
    this._faceBarricade();
  }

  /**
   * ~10 field px lean into the barricade, then return.
   * Plays `{prefix}-attack` when that strip registered.
   */
  _playAttackPunch() {
    if (!this.alive || !this.body) return;
    const homeX = this._haltX ?? this.body.x;
    this.scene.tweens.killTweensOf(this.body);
    this.body.x = homeX;
    this._stopWalkAnim();
    const attackKey = zombieSheetKey(this.variant, 'attack');
    if (this._isSprite && this.scene.anims?.exists?.(attackKey)) {
      this.body.play(attackKey);
    }
    this._faceBarricade();
    const juice = GAME_CONFIG.JUICE;
    const reach = homeX + juice.BARRICADE_LUNGE_PX * LAYOUT_SCALE;
    this.scene.tweens.add({
      targets: this.body,
      x: reach,
      duration: juice.BARRICADE_LUNGE_MS,
      yoyo: true,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        if (this.alive) this._syncBars();
      },
      onComplete: () => {
        if (!this.alive || !this.body || !this.atBarricade) return;
        this.body.x = homeX;
        this._syncBars();
      },
    });
  }

  /**
   * Deal contact DPS to barricade while stopped against it.
   * @param {number} deltaSec
   * @returns {number} damage dealt this frame
   */
  contactDamage(deltaSec) {
    if (!this.alive || !this.atBarricade) return 0;
    return this.dps * deltaSec;
  }

  /**
   * @param {number} amount
   * @param {{ kind?: string }} [hit]
   * @returns {boolean} true if killed
   */
  takeDamage(amount, hit = {}) {
    if (!this.alive) return false;
    this.hp -= amount;
    this._syncBars();
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this._beginDeath(amount, hit);
      return true;
    }
    this._playHitFlash();
    return false;
  }

  /**
   * Pure white for HIT_FLASH_MS, then the previous fill / tint.
   * Safe to call on the killing blow; death mode decides whether it restores.
   */
  _playHitFlash() {
    const body = this.body;
    if (!body?.active) return;
    const token = (this._flashToken || 0) + 1;
    this._flashToken = token;
    const juice = GAME_CONFIG.JUICE;
    if (this._isSprite && typeof body.setTintFill === 'function') {
      body.setTintFill(juice.HIT_FLASH_COLOR);
    } else if (typeof body.setFillStyle === 'function') {
      body.setFillStyle(juice.HIT_FLASH_COLOR);
      if (typeof body.setStrokeStyle === 'function') body.setStrokeStyle(1, juice.HIT_FLASH_COLOR);
    }
    this.scene.time?.delayedCall?.(juice.HIT_FLASH_MS, () => {
      if (this._flashToken !== token || !body.active) return;
      if (this._deathMode === 'overkill') return;
      this._restoreBodyColor(body);
    });
  }

  /** @param {Phaser.GameObjects.GameObject} body */
  _restoreBodyColor(body) {
    if (!body?.active) return;
    if (this._isSprite && typeof body.clearTint === 'function') {
      body.clearTint();
      return;
    }
    if (typeof body.setFillStyle === 'function') body.setFillStyle(this._baseFill);
    if (typeof body.setStrokeStyle === 'function') body.setStrokeStyle(1, this._baseStroke);
  }

  /**
   * @param {number} amount
   * @param {{ kind?: string }} hit
   */
  _beginDeath(amount, hit) {
    const body = this.body;
    if (!body) return;
    this._lastX = body.x;
    this._lastY = body.y;
    this.atBarricade = false;
    this._attackBeat = false;
    this._releaseBars();
    if (this.scene?.tweens?.killTweensOf) this.scene.tweens.killTweensOf(body);

    const overkill = isOverkillHit(hit?.kind, amount);
    this._deathMode = overkill ? 'overkill' : 'normal';
    this._playHitFlash();

    if (overkill) {
      beginHitlag(this.scene);
      shakeOverkill(this.scene);
      spawnFragments(this.scene, body.x, this.bodyCenterY);
      const ms = GAME_CONFIG.JUICE.HIT_FLASH_MS;
      this.scene.time?.delayedCall?.(ms, () => {
        if (this.body === body && body.active) {
          body.destroy();
          this.body = null;
        }
      });
      return;
    }

    this._recenterCorpse(body);
    spawnBlood(this.scene, body.x, body.y);
    const deathKey = zombieSheetKey(this.variant, 'death');
    if (this._isSprite && this.scene.anims?.exists?.(deathKey)) {
      body.play(deathKey);
    }
    this._faceBarricade(body);
    this._arcCorpse(body);
  }

  /**
   * Spin around the chest. Foot-pivot sheets would pinwheel on the sole.
   * @param {Phaser.GameObjects.Sprite} body
   */
  _recenterCorpse(body) {
    if (!this._isSprite || typeof body.setOrigin !== 'function') return;
    const halfH = Math.abs(body.displayHeight) / 2;
    body.setOrigin(0.5, 0.5);
    body.y -= halfH;
  }

  /**
   * Toss the body further left and up, spin, then fade. Y follows a hump
   * so the corpse arcs instead of sliding in a straight line.
   * @param {Phaser.GameObjects.GameObject & { x: number, y: number, angle: number, alpha: number, active: boolean }} body
   */
  _arcCorpse(body) {
    const juice = GAME_CONFIG.JUICE;
    const x0 = body.x;
    const y0 = body.y;
    const dx = -juice.DEATH_ARC_X * LAYOUT_SCALE;
    const arc = juice.DEATH_ARC_Y * LAYOUT_SCALE;
    const drop = juice.DEATH_DROP_Y * LAYOUT_SCALE;
    const spin = -juice.DEATH_SPIN_DEG;
    const state = { t: 0 };
    if (!this.scene?.tweens?.add) {
      body.destroy();
      this.body = null;
      return;
    }
    this.scene.tweens.add({
      targets: state,
      t: 1,
      duration: juice.DEATH_MS,
      ease: 'Linear',
      onUpdate: () => {
        if (!body.active) return;
        const t = state.t;
        body.x = x0 + dx * t;
        const hump = Math.sin(t * Math.PI) * arc;
        body.y = y0 - hump + drop * t * t;
        body.angle = spin * t;
        body.alpha = 1 - t;
        this._lastX = body.x;
        this._lastY = body.y;
      },
      onComplete: () => {
        if (body.active) body.destroy();
        if (this.body === body) this.body = null;
      },
    });
  }

  _syncBars() {
    if (!this.hpBarBg || !this.hpBarFg || !this.body) return;
    const barY = this.visualTop - 8 * this.scale;
    this.hpBarBg.x = this.body.x;
    this.hpBarBg.y = barY;
    this.hpBarFg.x = this.body.x - this._barW / 2;
    this.hpBarFg.y = barY;
    const ratio = this.maxHp > 0 ? Math.max(0, this.hp / this.maxHp) : 0;
    this.hpBarFg.width = this._barW * ratio;
  }

  _releaseBars() {
    if (this.hpBarBg) {
      this.hpBarBg.destroy();
      this.hpBarBg = null;
    }
    if (this.hpBarFg) {
      this.hpBarFg.destroy();
      this.hpBarFg = null;
    }
  }

  /** Axis-aligned hitbox. Sprites stand on the lane; squares stay centered. */
  getBounds() {
    if (!this.body) return null;
    const halfW = this.displayHalf;
    if (this._isSprite) {
      return {
        left: this.body.x - halfW,
        right: this.body.x + halfW,
        top: this.visualTop,
        bottom: this.body.y,
      };
    }
    return {
      left: this.body.x - halfW,
      right: this.body.x + halfW,
      top: this.body.y - halfW,
      bottom: this.body.y + halfW,
    };
  }

  destroyVisuals() {
    if (this.body) {
      this._lastX = this.body.x;
      this._lastY = this.body.y;
      this.scene.tweens.killTweensOf(this.body);
      this.body.destroy();
      this.body = null;
    }
    this._releaseBars();
  }
}
