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
  takeZombieSkin,
  zombieActionKey,
  zombieSheetKey,
} from '../assets/zombieSprites.js';
import { depthFromY, displayScaleFromY, LAYOUT_SCALE, layoutPx } from '../systems/DepthView.js';
import { beginHitlag, shakeOverkill, spawnBlood, spawnFragments } from '../systems/combatJuice.js';

let _zombieId = 0;

/**
 * Lane zombie. Walks right until barricade contact, then bites.
 * Library skins (`zombie-<group>-walk|run|attack|die`) replace the rectangle
 * when that texture is loaded; otherwise the legacy west strip, then the
 * colored square. Feet stay on the lane (origin 0.5, 1). East library art
 * is not flipped; west legacy art uses setFlipX(true).
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
    this.skin = takeZombieSkin(this.variant);
    const libraryWalk = zombieActionKey(this.skin, this.variant, 'walk');
    const legacyWalk = zombieSheetKey(this.variant, 'walk');
    const libraryReady = !!(
      libraryWalk &&
      scene.textures?.exists?.(libraryWalk) &&
      scene.anims?.exists?.(libraryWalk)
    );
    if (!libraryReady) this.skin = null;
    const walkKey = libraryReady ? libraryWalk : legacyWalk;
    this._isSprite = !!(scene.textures?.exists?.(walkKey) && scene.anims?.exists?.(walkKey));
    /** Library sheets face east. Legacy strips face west and must be mirrored. */
    this._faceWest = (this.skin?.facing || 'west') === 'west';
    this.variantScale = this._isSprite ? 1 : this.typeDef.placeholderScale || 1;
    this._baseFill = this.typeDef.placeholderColor;
    this._baseStroke = this.typeDef.placeholderStroke;

    // PIXELLAB_HOOK: rectangle stands in until the library `{group}-walk` strip is cached
    this.body = this._isSprite
      ? this._createSprite(scene, cfg.x, cfg.y, walkKey)
      : this._createPlaceholder(scene, cfg.x, cfg.y);

    const metrics = this._barMetrics();
    this._barW = metrics.barW;
    this._barH = metrics.barH;
    this.hpBarBg = scene.add.rectangle(cfg.x, metrics.barY, metrics.barW, metrics.barH, 0x1a1a1a);
    this.hpBarFg = scene.add
      .rectangle(cfg.x - metrics.barW / 2, metrics.barY, metrics.barW, metrics.barH, 0xff5252)
      .setOrigin(0, 0.5);

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
    // Lane Y is the sole. Origin stays (0.5, 1) for 64px and brute 96px frames.
    sprite.setOrigin(ZOMBIE_ORIGIN_X, ZOMBIE_ORIGIN_Y);
    sprite.setScale(this.scale);
    // East library art already faces the barricade. West legacy art is mirrored.
    sprite.setFlipX(this._faceWest);
    return sprite;
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

  /** Screen Y of the HP tick (feet-relative, on the body). */
  get hpBarAnchorY() {
    return this.hpBarBg ? this.hpBarBg.y : this.y - layoutPx(16);
  }

  /**
   * Short tick just above the feet. A head-relative bar floated into the
   * lane above and stacked into stripes when several bodies overlapped.
   * @returns {{ barW: number, barH: number, barY: number }}
   */
  _barMetrics() {
    const bodyW = Math.max(layoutPx(12), this.displayHalf * 2);
    const barW = Math.round(Math.min(bodyW * 0.45, layoutPx(22)));
    const barH = Math.max(2, layoutPx(2));
    const feet = this.y;
    const minY = this.visualTop + barH;
    const maxY = feet - barH;
    const wanted = feet - layoutPx(16);
    const barY = maxY <= minY ? (minY + maxY) / 2 : Math.min(maxY, Math.max(minY, wanted));
    return { barW, barH, barY };
  }

  /**
   * Move the body onto the visible march line. Spawn X depends on the
   * measured half-width, which exists only after the sprite is scaled.
   * @param {number} x
   */
  placeAt(x) {
    if (!this.body || !Number.isFinite(x)) return;
    this.body.x = x;
    this._lastX = x;
    this._syncBars();
  }

  /** @param {boolean} shown */
  setHpBarShown(shown) {
    const visible = !!shown;
    if (this.hpBarBg) this.hpBarBg.setVisible(visible);
    if (this.hpBarFg) this.hpBarFg.setVisible(visible);
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

  /** Stop the walk or run while the body leans into the barricade. */
  _stopWalkAnim() {
    if (!this._isSprite || !this.body?.anims) return;
    const key = this.body.anims.currentAnim?.key || '';
    if (key.endsWith('-walk') || key.endsWith('-run') || key.endsWith('-stumble')) {
      this.body.anims.stop();
    }
  }

  /**
   * @param {'walk'|'attack'|'stumble'|'death'|'hurt'|'blast'} action
   * @returns {string|null}
   */
  _animKey(action) {
    return zombieActionKey(this.skin, this.variant, action);
  }

  /** @param {string|null|undefined} key */
  _animReady(key) {
    return !!(key && this.scene?.anims?.exists?.(key));
  }

  /**
   * Stumble loop when that sheet is registered and HP is critical.
   * Otherwise keep the walk loop. No-op for rectangle placeholders.
   */
  _syncLocomotion() {
    if (!this._isSprite || !this.body?.anims || !this.alive || this.atBarricade) return;
    const stumble = this._animKey('stumble');
    const walk = this._animKey('walk');
    const stumbleReady =
      !!stumble &&
      (this.skin ? this._animReady(stumble) : hasZombieAnim(this.scene, this.variant, 'stumble'));
    const key = this.isCritical() && stumbleReady ? stumble : walk;
    if (!this.scene.anims.exists(key)) return;
    const current = this.body.anims.currentAnim?.key;
    if (current === key && this.body.anims.isPlaying) return;
    this.body.play(key);
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
    const attackKey = this._animKey('attack');
    if (this._isSprite && this._animReady(attackKey)) {
      this.body.play(attackKey);
    }
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

    const deathKey = this._libraryDeathKey(overkill);
    if (deathKey) {
      if (overkill) {
        beginHitlag(this.scene);
        shakeOverkill(this.scene);
      } else {
        spawnBlood(this.scene, body.x, body.y);
      }
      this._playLibraryDeath(body, deathKey, overkill);
      return;
    }

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
    const legacyDeath = zombieSheetKey(this.variant, 'death');
    if (this._isSprite && this.scene.anims?.exists?.(legacyDeath)) {
      body.play(legacyDeath);
    }
    this._arcCorpse(body);
  }

  /**
   * Authored death strip when the library skin is on this body.
   * Exploders use the explode strip on an overkill so the blast FX can attach.
   * @param {boolean} overkill
   * @returns {string|null}
   */
  _libraryDeathKey(overkill) {
    if (!this._isSprite || !this.skin) return null;
    if (overkill) {
      const blast = this._animKey('blast');
      if (this._animReady(blast)) return blast;
    }
    const death = this._animKey('death');
    return this._animReady(death) ? death : null;
  }

  /**
   * Play the death strip in place (feet origin, no spin). The arc toss is the
   * placeholder / legacy path — it fights a feet-planted death sheet.
   * @param {Phaser.GameObjects.Sprite} body
   * @param {string} deathKey
   * @param {boolean} overkill
   */
  _playLibraryDeath(body, deathKey, overkill) {
    if (overkill && deathKey === this._animKey('blast')) this._spawnBlastFx(body);
    body.play(deathKey);
    // Overkill flash otherwise holds a white tint for the whole death strip.
    this.scene.time?.delayedCall?.(GAME_CONFIG.JUICE.HIT_FLASH_MS, () => {
      if (body.active && typeof body.clearTint === 'function') body.clearTint();
    });
    const finish = () => {
      if (!body.active) return;
      if (!this.scene?.tweens?.add) {
        body.destroy();
        if (this.body === body) this.body = null;
        return;
      }
      this.scene.tweens.add({
        targets: body,
        alpha: 0,
        duration: 220,
        onComplete: () => {
          if (body.active) body.destroy();
          if (this.body === body) this.body = null;
        },
      });
    };
    body.once(`animationcomplete-${deathKey}`, finish);
  }

  /**
   * Shared exploder blast at the body. PIXELLAB_HOOK: zombie-exploder-blast.
   * @param {Phaser.GameObjects.Sprite} body
   */
  _spawnBlastFx(body) {
    const fxKey = this.skin?.blastFx;
    if (!fxKey || !this.scene.textures?.exists?.(fxKey)) return;
    const sprite = this.scene.add.sprite(body.x, this.bodyCenterY, fxKey);
    sprite.setOrigin(0.5, 0.5);
    sprite.setScale(Math.abs(body.scaleX || 1));
    sprite.setDepth((body.depth || 0) + 2);
    if (this.scene.anims?.exists?.(fxKey)) {
      sprite.play(fxKey);
      sprite.once(`animationcomplete-${fxKey}`, () => {
        if (sprite.active) sprite.destroy();
      });
    }
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
    const { barW, barH, barY } = this._barMetrics();
    this._barW = barW;
    this._barH = barH;
    this.hpBarBg.setSize(barW, barH);
    this.hpBarBg.x = this.body.x;
    this.hpBarBg.y = barY;
    this.hpBarFg.setSize(barW, barH);
    this.hpBarFg.x = this.body.x - barW / 2;
    this.hpBarFg.y = barY;
    const ratio = this.maxHp > 0 ? Math.max(0, this.hp / this.maxHp) : 0;
    this.hpBarFg.width = barW * ratio;
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

/** Vertical gap under which two ticks read as one stripe. */
const HP_BAR_STACK_Y = layoutPx(10);
/** Horizontal gap under which two ticks on the same row collide. */
const HP_BAR_STACK_X = layoutPx(26);

/**
 * Hide HP ticks that would paint on top of a nearer (or wounded) body.
 * Nearer and already-damaged zombies keep their bar so the mark stays
 * on a body the player is looking at.
 * @param {Zombie[]} zombies
 */
export function applyHpBarDensity(zombies) {
  const list = [];
  for (const z of zombies) {
    if (!z?.alive || !z.hpBarBg) {
      z?.setHpBarShown?.(false);
      continue;
    }
    list.push(z);
  }
  list.sort((a, b) => {
    const aw = a.hp < a.maxHp ? 1 : 0;
    const bw = b.hp < b.maxHp ? 1 : 0;
    if (aw !== bw) return bw - aw;
    return b.y - a.y;
  });
  /** @type {{ x: number, y: number }[]} */
  const shown = [];
  for (const z of list) {
    const y = z.hpBarAnchorY;
    const x = z.x;
    const crowded = shown.some(
      (o) => Math.abs(o.y - y) < HP_BAR_STACK_Y && Math.abs(o.x - x) < HP_BAR_STACK_X
    );
    z.setHpBarShown(!crowded);
    if (!crowded) shown.push({ x, y });
  }
}
