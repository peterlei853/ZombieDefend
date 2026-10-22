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
  resolveSpawnSkin,
  skipsHurtKnockback,
  takeZombieSkin,
  zombieActionKey,
  zombieDeathKeys,
  pickDeathKey,
  pickProfessionAttackKey,
  pickProfessionDeathKey,
  professionLocomotionKey,
  tireMoveSpeed,
  zombieSheetKey,
  zombieSkinDef,
  ZOMBIE_HURT_MS,
  ZOMBIE_HURT_SPEED_MUL,
  ZOMBIE_TIRE_HP,
  ZOMBIE_TIRE_SPEED_MUL,
} from '../assets/zombieSprites.js';
import { depthFromY, displayScaleFromY, grassYMax, grassYMin, LAYOUT_SCALE, layoutPx } from '../systems/DepthView.js';
import { petReachableBeforeFence } from '../systems/petAggro.js';
import { beginHitlag, spawnBlood, spawnFragments } from '../systems/combatJuice.js';
import { attackContactFrame, ruleAttackContactFrame } from '../data/enemyShowcase.js';
import { smallHurtLocksMove } from '../systems/footprints.js';
import { DAMAGE_COLORS, showDamageText } from '../ui/damageText.js';
import { KitHpBar } from '../ui/uiKit.js';

/**
 * Phaser 3.80 `AnimationFrame.index` is 1-based. `textureFrame` is the
 * 0-based sheet cell when the index is missing.
 * @param {{ index?: number, textureFrame?: number|string }|null|undefined} animFrame
 * @returns {number|null}
 */
function shownPhaserIndex(animFrame) {
  if (Number.isFinite(animFrame?.index)) return animFrame.index;
  const cell = Number(animFrame?.textureFrame);
  if (!Number.isInteger(cell) || cell < 0) return null;
  return cell + 1;
}

/** Near-black track. The old 0x1a1a1a tick disappeared into green slime shading. */
const HP_BAR_TRACK = 0x050308;
/** High-luminance fill. 0xff5252 sat in the slime's green midtones at this size. */
const HP_BAR_FILL = 0xfff3c4;
/** Cream stroke so the tick reads on neon green and on dark bodies. */
const HP_BAR_OUTLINE = 0xfff6e8;
/**
 * One floater is about one bite (1s). A little slack covers a late frame.
 * Longer queues are a stalled readout, not a bigger hit.
 */
const BARRICADE_READOUT_SEC = 1.25;

let _zombieId = 0;

/**
 * Lane zombie. Walks right until barricade contact, then bites.
 * A summoned pet in front of the fence is chased first. Pets behind the
 * posts do not pull the zombie through the barricade.
 * Library skins (`zombie-<group>-walk|run|attack|die`) replace the rectangle
 * when that texture is loaded; otherwise the legacy west strip, then the
 * colored square. Feet stay on the lane (origin 0.5, 1). East library art
 * is not flipped; west legacy art uses setFlipX(true).
 */
export class Zombie {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ x: number, y: number, hp: number, speed: number, dps: number, wave?: number, variant?: string, skin?: string }} cfg
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
    /** Panda slow. March speed only — barricade bite DPS is untouched. */
    this._slowMs = 0;
    this._slowMult = 1;
    /** Hit reaction. March speed ×0.5 until this expires. Bite DPS is untouched. */
    this._hurtMs = 0;
    /** Freeze / stun. March and chase only — barricade bite DPS is untouched. */
    this._rootMs = 0;
    /** Dragon smoke burn. Ticked by tickStatus; does not change contact DPS. */
    this._burnLeft = 0;
    this._burnAcc = 0;
    this._burnDmg = 0;
    this._burnInterval = 450;
    /** Seconds until the next barricade bite (punch + hit VFX). */
    this._attackCooldown = 1;
    this._attackBeat = false;
    /** Halt X while biting. The attack strip plays on this X. */
    this._haltX = null;
    /**
     * Fractional contact DPS waiting for the next integer floater.
     * Display only — barricade HP is applied every frame in StageScene.
     * Knockback clears a completed integer so interrupted bites do not
     * bank into one later popup.
     */
    this.barricadeDmgAccum = 0;
    /** Pet being bitten this frame. Null while the barricade is the target. */
    this.petBiteTarget = null;
    const explicitGold = Number(cfg.gold);
    this.goldValue = cfg.gold != null && Number.isFinite(explicitGold)
      ? explicitGold
      : getGoldByHP(this.maxHp);
    this.laneY = cfg.y;
    this._lastX = cfg.x;
    this._lastY = cfg.y;
    this.scale = displayScaleFromY(cfg.y);
    /** @type {'normal'|'overkill'|null} */
    this._deathMode = null;
    this._flashToken = 0;
    /** Feel booth holds this body in front of the fence. Waves never set it. */
    this.showcaseHold = false;
    /**
     * Feel-only march inside a short lane so tire ×0.3 and hurt ×0.5
     * can be watched. Waves never set it. It does not deal contact damage.
     */
    this.feelPace = false;
    /** Feel-only. Keeps hurt-normal and ×0.5 without dropping under the tire gate. */
    this._feelHurtLatch = false;
    /** Feel-only death strip. Live rolls never set this. */
    this._feelDeathKey = null;
    /** @type {Phaser.GameObjects.Text|null} */
    this._hpLabel = null;
    /** Eastward march used to lead a water shot. 0 while held or stopped. */
    this._marchVx = 0;
    this._showcaseToken = 0;

    registerZombieAnims(scene);
    const catalogSkin = zombieSkinDef(cfg.skin);
    this.skin = cfg.skin
      ? resolveSpawnSkin(scene, cfg.skin, this.variant)
      : takeZombieSkin(this.variant);
    // Copied before a missing walk sheet clears `skin`, so a brute
    // placeholder still refuses the hurt shove.
    this.noHurtKnockback = !!(catalogSkin?.noHurtKnockback || this.skin?.noHurtKnockback);
    const libraryWalk = zombieActionKey(this.skin, this.variant, 'walk');
    const legacyWalk = zombieSheetKey(this.variant, 'walk');
    const libraryReady = !!(
      this.skin &&
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

    // PIXELLAB_HOOK: rectangle stands in until the library `{group}-walk` strip is cached.
    // v0.36.25 profession bodies start on walk-normal or walk-tiremove.
    const startKey = (this._isSprite && this._locomotionAnimKey()) || walkKey;
    this.body = this._isSprite
      ? this._createSprite(scene, cfg.x, cfg.y, startKey)
      : this._createPlaceholder(scene, cfg.x, cfg.y);

    const metrics = this._barMetrics();
    this._barW = metrics.barW;
    this._barH = metrics.barH;
    this._barPad = metrics.pad;
    // ui-hp-bar-enemy (118×24) plus ui-hp-enemy-fill-*. Full HP stays hidden.
    this._hpBar = new KitHpBar(scene, 'enemy', cfg.x, metrics.barY, {
      scrollFactor: 1,
      depth: 0,
      visible: false,
      fallback: {
        w: metrics.barW,
        h: metrics.barH,
        track: HP_BAR_TRACK,
        fill: HP_BAR_FILL,
        outline: HP_BAR_OUTLINE,
      },
    });
    this.hpBarBg = this._hpBar.frame;
    this.hpBarFg = this._hpBar.fill;

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

  /**
   * World px/s along X (east positive). 0 while the booth holds the
   * body, it is biting, rooted, or sliding. Water uses this to aim
   * at the intercept. Y stays on the lane.
   * @returns {number}
   */
  marchVx() {
    return Number.isFinite(this._marchVx) ? this._marchVx : 0;
  }

  /** Screen Y of the HP tick (on the crown). */
  get hpBarAnchorY() {
    return this.hpBarBg ? this.hpBarBg.y : this._crownY() - layoutPx(4);
  }

  /**
   * Short tick sitting on the crown. Hidden at full HP (see applyHpBarDensity).
   * @returns {{ barW: number, barH: number, pad: number, barY: number }}
   */
  _barMetrics() {
    const bodyW = Math.max(layoutPx(12), this.displayHalf * 2);
    const barW = Math.round(Math.min(bodyW * 0.45, layoutPx(22)));
    const barH = Math.max(3, layoutPx(3));
    const pad = Math.max(1, layoutPx(1));
    const barY = this._crownY() - pad - barH / 2;
    return { barW, barH, pad, barY };
  }

  /**
   * World Y of the first opaque row (the head). Placeholder squares use
   * the top of the box. Sprite sheets skip transparent padding above the hair.
   */
  _crownY() {
    const top = this.visualTop;
    if (!this._isSprite || !this.body) return top;
    const h = Math.abs(this.body.displayHeight) || 0;
    const key = this.body.texture?.key;
    return top + h * crownFraction(this.scene, key);
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

  /** Display width used as the occupied footprint. */
  footprintWidth() {
    if (this._isSprite && this.body) return Math.abs(this.body.displayWidth) || 0;
    return this.baseSize * this.scale * this.variantScale;
  }

  /** Display height. Feet sit on `y`; the sprite extends upward. */
  footprintHeight() {
    if (this._isSprite && this.body) return Math.abs(this.body.displayHeight) || 0;
    return this.baseSize * this.scale * this.variantScale;
  }

  /**
   * Cell under 100×100 while the hurt window is open. March is exactly 0.
   * @returns {boolean}
   */
  hurtMarchLocked() {
    return (this._hurtMs > 0 || this._feelHurtLatch) && smallHurtLocksMove(this);
  }

  /**
   * Push from the footprint pass. March speed is unchanged.
   * A hurt-locked body stays planted and returns false so the other
   * sole takes the full separation.
   * @param {number} dx
   * @param {number} dy
   * @returns {boolean} false when this body refuses the push
   */
  shift(dx, dy) {
    if (!this.alive || !this.body) return false;
    if (this.hurtMarchLocked()) return false;
    if (dx) this.body.x += dx;
    if (dy) this.body.y += dy;
    this._lastX = this.body.x;
    this._lastY = this.body.y;
    this.laneY = this.body.y;
    return true;
  }

  /**
   * Keep a pushed body on the grass and on the barricade side of the halt.
   * Does not change barricade HP.
   * @param {{ contactXAt: (y: number) => number }|null|undefined} barricade
   */
  clampFoot(barricade) {
    if (!this.alive || !this.body) return;
    const yMin = grassYMin();
    const yMax = grassYMax();
    if (this.body.y < yMin) this.body.y = yMin;
    if (this.body.y > yMax) this.body.y = yMax;
    this.laneY = this.body.y;
    if (barricade && typeof barricade.contactXAt === 'function') {
      const halt = barricade.contactXAt(this.body.y) - this.displayHalf;
      if (this.body.x > halt) this.body.x = halt;
    }
    this._lastX = this.body.x;
    this._lastY = this.body.y;
    this._syncBars();
  }

  /** @param {boolean} shown */
  setHpBarShown(shown) {
    this._hpBar?.setVisible(!!shown);
  }

  /**
   * Shove the zombie left along its lane. Y stays on laneY.
   * Releases barricade lock and any bite tween so the shove is not snapped back.
   * Tanks apply knockbackMult (still the handgun / pellet distances from GameConfig).
   * Brute (`noHurtKnockback`) stays planted. Pet slides use beginPetSlide.
   * No-op if already dead or the body is gone.
   * @param {number} pixels
   */
  applyKnockback(pixels) {
    if (!this.alive || !this.body) return;
    if (skipsHurtKnockback(this)) return;
    const amount = Number(pixels) * (this.knockbackMult ?? 1);
    if (!(amount > 0) || !Number.isFinite(amount)) return;
    const atWall = this.atBarricade;
    const wallX = this.body.x;
    const wallY = this.body.y;
    if (this.scene?.tweens?.killTweensOf) {
      this.scene.tweens.killTweensOf(this.body);
    }
    this.body.x -= amount;
    if (Number.isFinite(this.laneY)) this.body.y = this.laneY;
    this._lastX = this.body.x;
    this._lastY = this.body.y;
    if (atWall) {
      // Bite timer restarts, so flush the integer already chewed. Leaving
      // it queued summed every knockback (handgun is faster than the 1s
      // bite) into one later `-N` that could reach the hundreds.
      const shown = this.popBarricadeDmgInt();
      this.atBarricade = false;
      this._haltX = null;
      this._attackCooldown = 1;
      this._attackBeat = false;
      this._clearAttackContact();
      if (shown >= 1) {
        showDamageText(this.scene, wallX, wallY - layoutPx(18), shown, DAMAGE_COLORS.barricade);
      }
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
   * @param {number} contactX barricade face. The halt math is unchanged.
   * @param {{ x: number, y: number, hp?: number, alive?: boolean, radius?: number }|null} [pet]
   */
  /**
   * Pet hit shove, left along the lane over `ms`. Separate from the short
   * weapon applyKnockback. Halt math is unchanged; a zombie on the posts
   * is released so the shove is not snapped back.
   * @param {number} pixels canvas px
   * @param {number} ms
   */
  beginPetSlide(pixels, ms) {
    if (!this.alive || !this.body) return;
    const amount = Number(pixels);
    const dur = Number(ms);
    if (!(amount > 0) || !(dur > 0) || !Number.isFinite(amount)) return;
    if (this.atBarricade) {
      const shown = this.popBarricadeDmgInt();
      const wallX = this.body.x;
      const wallY = this.body.y;
      this.atBarricade = false;
      this._haltX = null;
      this._attackCooldown = 1;
      this._attackBeat = false;
      this._clearAttackContact();
      if (shown >= 1) {
        showDamageText(this.scene, wallX, wallY - layoutPx(18), shown, DAMAGE_COLORS.barricade);
      }
    }
    this.petBiteTarget = null;
    this.scene?.tweens?.killTweensOf?.(this.body);
    this._petSlidePx = amount;
    this._petSlideMs = dur;
  }

  update(deltaSec, contactX, pet = null) {
    this._marchVx = 0;
    if (!this.alive) {
      this._syncHpReadout();
      return;
    }
    if (this.showcaseHold && !this.feelPace) {
      this._syncBars();
      return;
    }
    if (this.feelPace && this.showcaseHold) {
      this._tickFeelPace(deltaSec);
      return;
    }

    if (this._petSlideMs > 0 && this.body) {
      if (this.hurtMarchLocked()) {
        this._petSlideMs = 0;
        this._petSlidePx = 0;
        this._marchVx = 0;
      } else {
        const ms = Math.max(0, deltaSec * 1000);
        const use = Math.min(ms, this._petSlideMs);
        const dist = this._petSlidePx * (use / Math.max(this._petSlideMs, 0.001));
        this.body.x -= dist;
        this._petSlidePx -= dist;
        this._petSlideMs -= use;
        if (Number.isFinite(this.laneY)) this.body.y = this.laneY;
        this._lastX = this.body.x;
        this._lastY = this.body.y;
        this._syncLocomotion();
        this._applyDepth();
        this._syncBars();
        return;
      }
    }

    const chase = this._petToChase(pet, contactX);
    if (chase) {
      this._chasePet(deltaSec, chase, contactX);
    } else {
      this.petBiteTarget = null;
      if (!this.atBarricade) {
        // Wave speed is field px/s. LAYOUT_SCALE keeps time-to-contact on the wider canvas.
        // Professions use the HP 30 tire gate. Everyone else uses CRIT_SPEED_MULT.
        // A locked hurt cell contributes exactly 0, not the ×0.5 residual.
        const speed = this.hurtMarchLocked() ? 0 : this._marchSpeed();
        const march = speed * LAYOUT_SCALE;
        if (!(march > 0)) {
          this._marchVx = 0;
        } else {
          const nextX = this.body.x + march * deltaSec;
          const halt = contactX - this.displayHalf;
          if (nextX >= halt) {
            this.body.x = halt;
            this.atBarricade = true;
            this._haltX = halt;
            this._stopWalkAnim();
          } else {
            this.body.x = nextX;
            this._marchVx = march;
          }
        }
      }

      if (this.atBarricade) {
        this._attackCooldown -= deltaSec;
        if (this._attackCooldown <= 0) {
          this._attackCooldown += 1;
          if (this._attackCooldown < 0) this._attackCooldown = 0;
          this._playAttackPunch();
        }
      } else {
        this._syncLocomotion();
      }
    }

    this._applyDepth();
    this._syncBars();
  }

  /**
   * Nearest living pet already in front of the fence, or null.
   * @param {{ x: number, y: number, hp?: number, alive?: boolean, radius?: number }|null} pet
   * @param {number} contactX
   */
  _petToChase(pet, contactX) {
    if (!pet) return null;
    const halt = contactX - this.displayHalf;
    const radius = Number.isFinite(pet.radius) ? pet.radius : layoutPx(GAME_CONFIG.PETS.BITE_RADIUS);
    const reach = this.displayHalf + radius;
    if (!petReachableBeforeFence(pet, halt, reach)) return null;
    return pet;
  }

  /**
   * @param {{ x: number, y: number, radius?: number }} pet
   */
  _biteReach(pet) {
    const radius = Number.isFinite(pet.radius) ? pet.radius : layoutPx(GAME_CONFIG.PETS.BITE_RADIUS);
    return this.displayHalf + radius;
  }

  /**
   * Steer toward the pet and bite it. X never passes the barricade halt.
   * @param {number} deltaSec
   * @param {{ x: number, y: number, radius?: number }} pet
   * @param {number} contactX
   */
  _chasePet(deltaSec, pet, contactX) {
    if (this.hurtMarchLocked()) {
      this._marchVx = 0;
      return;
    }
    const reach = this._biteReach(pet);
    const dx = pet.x - this.body.x;
    const dy = pet.y - this.body.y;
    const dist = Math.hypot(dx, dy);
    if (this.atBarricade) {
      this.atBarricade = false;
      this._haltX = null;
      this._attackBeat = false;
      this._clearAttackContact();
      this.scene?.tweens?.killTweensOf?.(this.body);
    }
    if (dist <= reach) {
      this.petBiteTarget = pet;
      if (this._haltX == null) this._haltX = this.body.x;
      this._attackCooldown -= deltaSec;
      if (this._attackCooldown <= 0) {
        this._attackCooldown += 1;
        if (this._attackCooldown < 0) this._attackCooldown = 0;
        this._playAttackPunch();
      } else {
        this._stopWalkAnim();
      }
      return;
    }
    this.petBiteTarget = null;
    this._haltX = null;
    this.scene?.tweens?.killTweensOf?.(this.body);
    const speed = this._marchSpeed();
    const step = speed * LAYOUT_SCALE * deltaSec;
    if (dist > 0.001) {
      this.body.x += (dx / dist) * step;
      this.body.y += (dy / dist) * step;
      this._marchVx = (dx / dist) * speed * LAYOUT_SCALE;
    }
    const halt = contactX - this.displayHalf;
    if (this.body.x > halt) this.body.x = halt;
    const yMin = grassYMin();
    const yMax = grassYMax();
    if (this.body.y < yMin) this.body.y = yMin;
    if (this.body.y > yMax) this.body.y = yMax;
    this.laneY = this.body.y;
    this._syncLocomotion();
  }

  /**
   * Contact DPS while biting a pet. Barricade DPS stays on contactDamage.
   * @param {number} deltaSec
   * @returns {number}
   */
  petContactDamage(deltaSec) {
    if (!this.alive || !this.petBiteTarget) return 0;
    return this.dps * deltaSec;
  }

  /**
   * Brief march slow. Does not change barricade contact DPS.
   * A stronger or longer application replaces the one already running.
   * @param {number} mult
   * @param {number} durationMs
   */
  applySlow(mult, durationMs) {
    if (!this.alive) return;
    const factor = Math.min(1, Math.max(0.05, Number(mult) || 1));
    const dur = Math.max(0, Number(durationMs) || 0);
    if (!(this._slowMs > 0) || factor < this._slowMult || dur >= this._slowMs) {
      this._slowMult = factor;
      this._slowMs = dur;
    }
  }

  /**
   * Freeze or stun. Stops the march and a pet chase. A zombie already
   * biting the barricade keeps contact DPS — that halt math is unchanged.
   * @param {number} durationMs
   */
  applyRoot(durationMs) {
    if (!this.alive) return;
    const dur = Math.max(0, Number(durationMs) || 0);
    this._rootMs = Math.max(this._rootMs || 0, dur);
  }

  /**
   * Brief burn. Damage ticks from tickStatus, not from the bite.
   * @param {number} damage
   * @param {number} intervalMs
   * @param {number} durationMs
   */
  applyBurn(damage, intervalMs, durationMs) {
    if (!this.alive) return;
    const dmg = Math.max(0, Number(damage) || 0);
    const interval = Math.max(50, Number(intervalMs) || 450);
    const dur = Math.max(0, Number(durationMs) || 0);
    if (!(this._burnLeft > 0) || dmg >= this._burnDmg) {
      this._burnDmg = dmg;
      this._burnInterval = interval;
    }
    this._burnLeft = Math.max(this._burnLeft || 0, dur);
  }

  /** 0 while rooted or hurt-locked. Otherwise panda slow and the hurt-window half speed. */
  _slowFactor() {
    if (this._rootMs > 0) return 0;
    if ((this._hurtMs > 0 || this._feelHurtLatch) && smallHurtLocksMove(this)) return 0;
    let factor = 1;
    if (this._slowMs > 0) factor *= this._slowMult > 0 ? this._slowMult : 1;
    if (this._hurtMs > 0) factor *= ZOMBIE_HURT_SPEED_MUL;
    return factor;
  }

  /**
   * Decay slow and tick burn. Gold is only from a burn kill.
   * @param {number} deltaMs
   * @returns {{ gold: number, kills: number }}
   */
  tickStatus(deltaMs) {
    const dt = Number.isFinite(deltaMs) ? deltaMs : 0;
    if (this._slowMs > 0) {
      this._slowMs = Math.max(0, this._slowMs - dt);
      if (this._slowMs <= 0) this._slowMult = 1;
    }
    if (this._hurtMs > 0) this._hurtMs = Math.max(0, this._hurtMs - dt);
    if (this._rootMs > 0) this._rootMs = Math.max(0, this._rootMs - dt);
    if (!(this._burnLeft > 0) || !this.alive) return { gold: 0, kills: 0 };
    this._burnLeft -= dt;
    this._burnAcc += dt;
    let gold = 0;
    let kills = 0;
    const interval = this._burnInterval || 450;
    let guard = 0;
    while (this.alive && this._burnAcc >= interval && guard < 4) {
      guard += 1;
      this._burnAcc -= interval;
      const hx = this.x;
      const hy = Number.isFinite(this.visualTop) ? this.visualTop : this.y;
      const goldVal = this.goldValue || 0;
      const killed = this.takeDamage(this._burnDmg, { kind: 'pet' });
      showDamageText(this.scene, hx, hy, this._burnDmg, DAMAGE_COLORS.dragon, this.id);
      if (killed) {
        gold += goldVal;
        kills += 1;
        break;
      }
    }
    if (this._burnLeft <= 0 || !this.alive) {
      this._burnLeft = 0;
      this._burnAcc = 0;
    }
    return { gold, kills };
  }

  /**
   * True once, on the attack strip's contact frame, while this zombie is
   * biting the barricade. StageScene uses the beat for flash / claw / damage
   * text; DPS math stays per-frame. A body with no attack strip reports the
   * beat on the same update that starts the bite.
   */
  consumeAttackBeat() {
    const beat = this._attackBeat;
    this._attackBeat = false;
    return beat;
  }

  /** One floater's worth of contact DPS. Does not limit HP actually dealt. */
  _barricadeReadoutCap() {
    const dps = Number(this.dps);
    const perSec = Number.isFinite(dps) && dps > 0 ? dps : 1;
    return perSec * BARRICADE_READOUT_SEC;
  }

  /** Queue fractional barricade DPS for the next integer floating number. */
  addBarricadeDmg(amount) {
    if (!(amount > 0) || !Number.isFinite(amount)) return;
    const next = (Number.isFinite(this.barricadeDmgAccum) ? this.barricadeDmgAccum : 0) + amount;
    this.barricadeDmgAccum = Math.min(this._barricadeReadoutCap(), next);
  }

  /**
   * Whole HP lost since the last pop, capped to about one bite.
   * Remainder under 1 stays queued so the readout tracks applyDamage
   * without printing a fraction every frame. Anything above the cap is
   * dropped from the floater only.
   */
  popBarricadeDmgInt() {
    const cap = this._barricadeReadoutCap();
    let queued = Number.isFinite(this.barricadeDmgAccum) ? this.barricadeDmgAccum : 0;
    if (queued > cap) queued = cap;
    const shown = Math.floor(queued + 1e-6);
    if (shown <= 0) return 0;
    this.barricadeDmgAccum = queued - shown;
    return shown;
  }

  /** Stop the walk or run while the attack strip plays in place. */
  _stopWalkAnim() {
    if (!this._isSprite || !this.body?.anims) return;
    const key = this.body.anims.currentAnim?.key || '';
    if (this._isLocomotionKey(key)) this.body.anims.stop();
  }

  /**
   * Walk, run, stumble, walk-normal, and walk-tiremove.
   * @param {string} key
   */
  _isLocomotionKey(key) {
    return key.endsWith('-walk')
      || key.endsWith('-run')
      || key.endsWith('-stumble')
      || key.endsWith('-walk-normal')
      || key.endsWith('-walk-tiremove');
  }

  /**
   * Profession rule skins march at wave speed until HP drops under 30,
   * then at 30% (TireMove). Other skins keep the critical-HP ratio slow.
   * Hurt ×0.5 stacks on either march speed.
   */
  _marchSpeed() {
    const rules = this.skin?.ruleAnims;
    const base = rules
      ? tireMoveSpeed(this.speed, this.hp)
      : woundedMoveSpeed(this.speed, this.hp, this.maxHp);
    return base * this._slowFactor();
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
   * Profession rule skins: walk-normal at HP ≥ 30, walk-tiremove under 30.
   * Other skins: stumble loop when that sheet is registered and HP is
   * critical, otherwise the walk (runners use run).
   * @returns {string|null}
   */
  _locomotionAnimKey() {
    const rules = this.skin?.ruleAnims;
    if (rules) {
      const ruleKey = professionLocomotionKey(rules, this.hp);
      if (this._animReady(ruleKey)) return ruleKey;
    }
    const stumble = this._animKey('stumble');
    const walk = this._animKey('walk');
    const stumbleReady =
      !!stumble &&
      (this.skin ? this._animReady(stumble) : hasZombieAnim(this.scene, this.variant, 'stumble'));
    if (this.isCritical() && stumbleReady) return stumble;
    return walk;
  }

  /**
   * Keep the locomotion loop. No-op for rectangle placeholders and while biting.
   */
  _syncLocomotion() {
    if (!this._isSprite || !this.body?.anims || !this.alive || this.atBarricade) return;
    const hurt = this._hurtAnimKey();
    const current = this.body.anims.currentAnim?.key;
    // A hit just started the hurt strip. Do not replace it with walk this frame.
    if (hurt && current === hurt && this.body.anims.isPlaying) return;
    const key = this._locomotionAnimKey();
    if (!key || !this.scene.anims.exists(key)) return;
    if (current === key && this.body.anims.isPlaying) return;
    this.body.play(key);
  }

  /**
   * Bite strip for barricade and player contact.
   * v0.36.25 profession skins roll hit01 / hit02 50/50, including office
   * hit02 (ALIAS). Nurse attach stays a skill strip, not this bite.
   * Skins without ruleAnims keep attach, then the legacy attack key.
   * @returns {string|null}
   */
  _pickBiteKey() {
    const rules = this.skin?.ruleAnims;
    const rng = typeof this._attackRng === 'function' ? this._attackRng : Math.random;
    if (rules) {
      const rolled = pickProfessionAttackKey(rules, rng);
      if (this._animReady(rolled)) return rolled;
      const other = rolled === rules.hit01 ? rules.hit02 : rules.hit01;
      if (this._animReady(other)) return other;
    }
    const attachKey = this._animKey('attach');
    if (!rules && this._animReady(attachKey)) return attachKey;
    return this._animKey('attack');
  }

  /**
   * Play the bite strip without stepping forward. Feet stay on the halt X.
   * The wall flash waits for that strip's contact frame.
   */
  _playAttackPunch() {
    if (!this.alive || !this.body) return;
    const homeX = this._haltX ?? this.body.x;
    this.scene?.tweens?.killTweensOf?.(this.body);
    this.body.x = homeX;
    this._stopWalkAnim();
    const attackKey = this._pickBiteKey();
    const played = !!(this._isSprite && this._animReady(attackKey));
    if (played) this.body.play(attackKey);
    this._armBarricadeBeat(played ? attackKey : null);
  }

  /**
   * Mark the barricade beat when the playing strip reaches its contact frame.
   * No strip, or a bite that is not on the wall, does not wait.
   * @param {string|null} attackKey
   */
  _armBarricadeBeat(attackKey) {
    this._clearAttackContact();
    if (!this.alive || !this.atBarricade || this.petBiteTarget) return;
    const total = attackKey ? (this.scene?.anims?.get?.(attackKey)?.frames?.length || 0) : 0;
    const hitFrame = attackContactFrame(this.skin?.id, total, attackKey);
    const ready = !!(attackKey && this._animReady(attackKey) && Number.isInteger(hitFrame));
    if (!ready) {
      this._attackBeat = true;
      return;
    }
    this._armAttackContact(attackKey, hitFrame, () => {
      if (!this.alive || !this.atBarricade || this.petBiteTarget) return;
      this._attackBeat = true;
    });
  }

  /**
   * Deal contact DPS to barricade while stopped against it.
   * @param {number} deltaSec
   * @returns {number} damage dealt this frame
   */
  contactDamage(deltaSec) {
    if (!this.alive || !this.atBarricade) return 0;
    // The 90s clock is the survival test. Bodies already on the field
    // still have to die before the win, but a bite after the clock does
    // not chew the wall (no further spawns are queued past 90 either).
    if (this.scene?.waveManager?.isTimeUp?.()) return 0;
    return this.dps * deltaSec;
  }

  /**
   * @param {number} amount
   * @param {{ kind?: string, feel?: boolean, flashMs?: number, hurtStrip?: boolean, crit?: boolean, charge?: number }} [hit]
   * `hurtStrip` must be exactly true. Ranged feel hits leave it off so the
   * hurt sheet's baked yellow crescent never plays. Melee opts in.
   * @returns {boolean} true if killed
   */
  takeDamage(amount, hit = {}) {
    if (!this.alive) return false;
    this.hp -= amount;
    this._syncBars();
    const scripted = hit?.feel === true;
    const showcaseAudio = !!(
      this.skin?.id &&
      this.scene?.demoEnemyId &&
      this.skin.id === this.scene.demoEnemyId
    );
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this._beginDeath(amount, hit);
      if (showcaseAudio) this.scene.audio?.playEnemyCue?.(this.skin.id, 'die');
      else if (!this.scene.audio?.playS4Vocal?.(this.skin?.id, 'death')
        && !this.scene.audio?.playProfessionDeath?.(this.skin?.id)) this.scene.audio?.playZombieDeath();
      if (!scripted) this.scene.expOrbs?.onZombieDeath?.(this);
      return true;
    }
    this._playHitFlash(hit?.flashMs);
    if (amount > 0) {
      if (showcaseAudio) this.scene.audio?.playEnemyCue?.(this.skin.id, 'hit');
      else if (!this.scene.audio?.playS4Vocal?.(this.skin?.id, 'hit')) this.scene.audio?.playZombieHurt();
      this.scene.audio?.playS4Vocal?.(this.skin?.id, 'hurt');
      // Stage hits play the catalog hurt strip. Feel-booth ranged hits
      // still opt in with hurtStrip so a baked crescent is not forced on.
      if (!scripted || hit.hurtStrip === true) this._playHurtStrip();
      this._beginHurtSlow();
    }
    return false;
  }

  /**
   * Play one library strip, then the walk loop. Looping strips hold for
   * a single cycle. Missing strips return false.
   * @param {string} key
   * @returns {boolean}
   */
  playShowcaseStrip(key) {
    if (!this.alive || !this._isSprite || !this.body || !this._animReady(key)) return false;
    const token = (this._showcaseToken || 0) + 1;
    this._showcaseToken = token;
    try {
      this.body.play(key);
    } catch (_) {
      return false;
    }
    const restore = () => {
      if (this._showcaseToken !== token || !this.alive || !this.body) return;
      const walk = this._locomotionAnimKey();
      if (!this._animReady(walk)) return;
      try {
        this.body.play(walk);
      } catch (_) {
        /* leave the last frame */
      }
    };
    let holdMs = 0;
    try {
      const anim = this.scene?.anims?.get?.(key);
      if (anim?.repeat === -1) {
        const frames = anim.frames?.length || 1;
        const rate = anim.frameRate > 0 ? anim.frameRate : 10;
        holdMs = Math.round((frames / rate) * 1000);
      }
    } catch (_) {
      holdMs = 0;
    }
    if (holdMs > 0) this.scene?.time?.delayedCall?.(holdMs, restore);
    else this.body.once?.(`animationcomplete-${key}`, restore);
    return true;
  }

  /**
   * Key 2. Attack strip in place (not the nurse attach skill, and not a
   * step toward the barricade). `onContact` runs when `hitFrame` is the
   * frame on screen. A missing strip, or no hit frame, runs it immediately —
   * there is no strike to wait for. The contact is the anim update, not a timer.
   * @param {number|null|undefined} hitFrame
   * @param {(() => void)|undefined} onContact
   * @returns {boolean}
   */
  playShowcaseAttack(hitFrame, onContact) {
    if (!this.alive || !this.body) return false;
    this._clearAttackContact();
    const attackKey = this._pickBiteKey();
    const played = attackKey ? this.playShowcaseStrip(attackKey) : false;
    const ruleFrame = ruleAttackContactFrame(attackKey);
    const frame = ruleFrame != null ? ruleFrame : hitFrame;
    this._armAttackContact(played ? attackKey : null, frame, onContact);
    return played;
  }

  /** Drop a pending key-2 contact so a replay or a despawn cannot flinch late. */
  _clearAttackContact() {
    const handler = this._attackContactHandler;
    this._attackContactHandler = null;
    if (handler && this.body?.off) this.body.off('animationupdate', handler);
    this._attackContactToken = (this._attackContactToken || 0) + 1;
  }

  /**
   * Fire `onContact` once, on the attack frame that is actually showing.
   * @param {string|null} attackKey
   * @param {number|null|undefined} hitFrame
   * @param {(() => void)|undefined} onContact
   */
  _armAttackContact(attackKey, hitFrame, onContact) {
    if (typeof onContact !== 'function') return;
    const token = this._attackContactToken;
    const fire = () => {
      if (this._attackContactToken !== token) return;
      const handler = this._attackContactHandler;
      this._attackContactHandler = null;
      if (handler && this.body?.off) this.body.off('animationupdate', handler);
      this._attackContactToken = token + 1;
      onContact();
    };
    const ready = !!(
      attackKey &&
      this._animReady(attackKey) &&
      Number.isInteger(hitFrame) &&
      hitFrame >= 0
    );
    if (!ready) {
      fire();
      return;
    }
    const total = this.scene?.anims?.get?.(attackKey)?.frames?.length || 0;
    // Phaser 3.80 sets AnimationFrame.index = i + 1. The last cell is `total`.
    // An 8-frame bite contacts on index 6; index 7 is the end pose (Fail #117).
    if (total > 0 && hitFrame > total) {
      fire();
      return;
    }
    const onUpdate = (anim, animFrame) => {
      if (this._attackContactToken !== token) return;
      if (anim?.key !== attackKey) return;
      const index = shownPhaserIndex(animFrame);
      if (index !== hitFrame) return;
      fire();
    };
    this._attackContactHandler = onUpdate;
    this.body.on('animationupdate', onUpdate);
    const showing = this.body.anims?.currentAnim?.key === attackKey
      ? shownPhaserIndex(this.body.anims.currentFrame)
      : undefined;
    if (showing === hitFrame) fire();
  }

  /**
   * Fire each mark once, when that 1-based Phaser index is showing.
   * Used by the feel-booth smash: shock and the pixel-contact check are different frames.
   * A missing strip does not fire — there is no pose to sync to.
   * @param {string|null} attackKey
   * @param {{ index: number, fn: () => void }[]} marks
   */
  armShowcaseMarks(attackKey, marks) {
    this._clearAttackContact();
    const pending = [];
    for (const mark of marks || []) {
      if (!mark || typeof mark.fn !== 'function') continue;
      if (!Number.isInteger(mark.index) || mark.index < 1) continue;
      pending.push({ index: mark.index, fn: mark.fn, fired: false });
    }
    if (!pending.length) return;
    const token = this._attackContactToken;
    const ready = !!(attackKey && this._animReady(attackKey));
    if (!ready || !this.body?.on) return;
    const finishIfDone = () => {
      if (!pending.every((item) => item.fired)) return;
      if (this._attackContactToken !== token) return;
      const handler = this._attackContactHandler;
      this._attackContactHandler = null;
      if (handler && this.body?.off) this.body.off('animationupdate', handler);
      this._attackContactToken = token + 1;
    };
    const fireOne = (mark) => {
      if (this._attackContactToken !== token || mark.fired) return;
      mark.fired = true;
      mark.fn();
      finishIfDone();
    };
    // `>=` so a hitch that skips the exact cell still fires once the
    // strip has reached it. Shock (index 9) and the AoE (index 14) stay
    // ordered: an earlier mark cannot wait for a later one.
    const due = (index) => {
      if (!Number.isInteger(index)) return;
      for (const mark of pending) {
        if (!mark.fired && index >= mark.index) fireOne(mark);
      }
    };
    const onUpdate = (anim, animFrame) => {
      if (this._attackContactToken !== token) return;
      if (anim?.key !== attackKey) return;
      due(shownPhaserIndex(animFrame));
    };
    this._attackContactHandler = onUpdate;
    this.body.on('animationupdate', onUpdate);
    const showing = this.body.anims?.currentAnim?.key === attackKey
      ? shownPhaserIndex(this.body.anims.currentFrame)
      : undefined;
    due(showing);
  }

  /**
   * Hurt strip after the white flash. No-op when that sheet is not loaded.
   * v0.36.25 profession skins play `hurt-normal`. Office is 5 frames @ 10.
   * Delivery, chef, and nurse stay 4 @ 10. Other skins keep `{prefix}-hurt`.
   */
  _playHurtStrip() {
    const hurt = this._hurtAnimKey();
    if (!hurt) return false;
    return this.playShowcaseStrip(hurt);
  }

  /**
   * Profession hurt-normal when that strip is loaded, otherwise the skin hurt key.
   * @returns {string|null}
   */
  _hurtAnimKey() {
    const rules = this.skin?.ruleAnims;
    if (rules?.hurtNormal && this._animReady(rules.hurtNormal)) return rules.hurtNormal;
    return this._animKey('hurt');
  }

  /** Half march speed for the hurt window. Bite DPS does not read this. */
  _beginHurtSlow() {
    this._hurtMs = ZOMBIE_HURT_MS;
  }

  /**
   * Pure white, then the previous fill / tint.
   * Feel hits pass 40ms. Everyone else keeps JUICE.HIT_FLASH_MS.
   * Safe to call on the killing blow; death mode decides whether it restores.
   * @param {number} [ms]
   */
  _playHitFlash(ms) {
    const body = this.body;
    if (!body?.active) return;
    const token = (this._flashToken || 0) + 1;
    this._flashToken = token;
    const juice = GAME_CONFIG.JUICE;
    const dur = Number(ms) > 0 ? Number(ms) : juice.HIT_FLASH_MS;
    if (this._isSprite && typeof body.setTintFill === 'function') {
      body.setTintFill(juice.HIT_FLASH_COLOR);
    } else if (typeof body.setFillStyle === 'function') {
      body.setFillStyle(juice.HIT_FLASH_COLOR);
      if (typeof body.setStrokeStyle === 'function') body.setStrokeStyle(1, juice.HIT_FLASH_COLOR);
    }
    this.scene.time?.delayedCall?.(dur, () => {
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
   * @param {{ kind?: string, flashMs?: number }} hit
   */
  _beginDeath(amount, hit) {
    const body = this.body;
    if (!body) return;
    this._lastX = body.x;
    this._lastY = body.y;
    this.atBarricade = false;
    this._attackBeat = false;
    this._clearAttackContact();
    this._releaseBars();
    if (this.scene?.tweens?.killTweensOf) this.scene.tweens.killTweensOf(body);

    const overkill = isOverkillHit(hit?.kind, amount);
    this._deathMode = overkill ? 'overkill' : 'normal';
    this._playHitFlash(hit?.flashMs);

    const deathKey = this._libraryDeathKey(overkill, hit);
    if (deathKey) {
      if (overkill) {
        beginHitlag(this.scene);
      } else {
        spawnBlood(this.scene, body.x, body.y);
      }
      this._playLibraryDeath(body, deathKey, overkill);
      return;
    }

    if (overkill) {
      beginHitlag(this.scene);
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
   * v0.36.25 profession skins use Peter's gates: crit → die-critical-hit,
   * water L3 → die-disappear, else deathwalk 10% / normal01 45% / normal02 45%.
   * Crit is the existing pet crit roll (`hit.crit`). L3 is `hit.charge` ≥ 3.
   * Neither flag changes the damage number. Other skins still roll die1 / die2.
   * @param {boolean} overkill
   * @param {{ crit?: boolean, charge?: number }} [hit]
   * @returns {string|null}
   */
  _libraryDeathKey(overkill, hit) {
    if (!this._isSprite || !this.skin) return null;
    if (overkill) {
      const blast = this._animKey('blast');
      if (this._animReady(blast)) return blast;
    }
    if (this._feelDeathKey && this._animReady(this._feelDeathKey)) return this._feelDeathKey;
    if (this.skin.ruleAnims) {
      const picked = pickProfessionDeathKey(
        this.skin.ruleAnims,
        { crit: hit?.crit === true, charge: Number(hit?.charge) || 0 },
        (key) => this._animReady(key),
      );
      if (picked) return picked;
    }
    /** @type {string[]} */
    const ready = [];
    for (const key of zombieDeathKeys(this.skin)) {
      if (this._animReady(key) && !ready.includes(key)) ready.push(key);
    }
    const primary = this._animKey('death');
    if (primary && this._animReady(primary) && !ready.includes(primary)) ready.push(primary);
    // PIXELLAB_HOOK: random die1 / die2 when both strips are loaded.
    return pickDeathKey(ready);
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
    if (!this._hpBar || !this.body) {
      this._syncHpReadout();
      return;
    }
    const h = this._hpBar.displayHeight;
    const barY = this._crownY() - layoutPx(2) - h / 2;
    const ratio = this.maxHp > 0 ? Math.max(0, this.hp / this.maxHp) : 0;
    this._barW = this._hpBar.displayWidth;
    this._barH = h;
    this._hpBar.setPosition(this.body.x, barY);
    this._hpBar.setRatio(ratio);
    this._syncHpReadout();
  }

  /**
   * Feel booth, or `?showHp=1`. A number near the sprite. Display only.
   */
  _syncHpReadout() {
    const scene = this.scene;
    if (!scene?.showZombieHp || !this.body?.active) {
      this._releaseHpLabel();
      return;
    }
    if (!this._hpLabel?.active) {
      const label = scene.add?.text?.(0, 0, '', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '14px',
        color: '#ffe7a0',
        stroke: '#1a1208',
        strokeThickness: 4,
      });
      if (!label) return;
      label.setOrigin?.(0.5, 1);
      this._hpLabel = label;
    }
    this._hpLabel.setText(this._hpReadoutTag());
    const top = Number.isFinite(this.visualTop) ? this.visualTop : this.body.y;
    this._hpLabel.setPosition(this.body.x, top - layoutPx(6));
    if (typeof this._hpLabel.setDepth === 'function') {
      this._hpLabel.setDepth((this.body.depth || 0) + 12);
    }
  }

  /** Short debug line: HP, the speed gate, and the strip that is playing. */
  _hpReadoutTag() {
    const hp = Math.max(0, Math.ceil(Number(this.hp) || 0));
    const bits = [`HP ${hp}`];
    if (this.skin?.ruleAnims) {
      if (Number(this.hp) < ZOMBIE_TIRE_HP) bits.push(`tire×${ZOMBIE_TIRE_SPEED_MUL}`);
      if (this._hurtMs > 0 || this._feelHurtLatch) {
        bits.push(smallHurtLocksMove(this) ? 'hurt-lock' : `hurt×${ZOMBIE_HURT_SPEED_MUL}`);
      }
    }
    const key = this.body?.anims?.currentAnim?.key || '';
    if (key.includes('die-')) bits.push(key.slice(key.indexOf('die-')));
    else if (key.includes('walk-tire')) bits.push('walk-tiremove');
    else if (key.includes('hurt')) bits.push('hurt-normal');
    else if (key.includes('walk')) bits.push('walk-normal');
    return bits.join(' ');
  }

  _releaseHpLabel() {
    this._hpLabel?.destroy?.();
    this._hpLabel = null;
  }

  /**
   * Feel-only walk between two X values at the live march speed.
   * Does not reach the barricade and does not change DPS.
   * @param {number} deltaSec
   */
  _tickFeelPace(deltaSec) {
    if (!this.body) return;
    if (this._feelHurtLatch) {
      this._hurtMs = ZOMBIE_HURT_MS;
      const hurt = this._hurtAnimKey();
      const current = this.body.anims?.currentAnim?.key;
      const playing = !!this.body.anims?.isPlaying;
      if (hurt && (current !== hurt || !playing)) this._playHurtStrip();
    }
    const speed = this.hurtMarchLocked() ? 0 : this._marchSpeed() * LAYOUT_SCALE;
    const dt = Number.isFinite(deltaSec) ? deltaSec : 0;
    if (!(speed > 0)) {
      this._applyDepth();
      this._syncBars();
      return;
    }
    const next = this.body.x + speed * dt;
    const maxX = Number.isFinite(this._paceMax) ? this._paceMax : this.body.x;
    const minX = Number.isFinite(this._paceMin) ? this._paceMin : this.body.x;
    this.body.x = next >= maxX ? minX : next;
    if (!this._feelHurtLatch) this._syncLocomotion();
    this._applyDepth();
    this._syncBars();
  }

  /** Stop the feel march. The next sample can start a new one. */
  stopFeelPace() {
    this.feelPace = false;
    this._feelHurtLatch = false;
    this._hurtMs = 0;
  }

  /**
   * Pace west of the fence at the current march speed.
   * Waves never call this.
   */
  beginFeelPace() {
    if (!this.body) return;
    this.feelPace = true;
    this.showcaseHold = true;
    this._paceMax = this.body.x;
    this._paceMin = this.body.x - layoutPx(140);
    this.body.x = this._paceMin;
    this._syncBars();
  }

  /**
   * HP under 30, no hurt latch. walk-tiremove at ×0.3.
   * maxHp and gold stay on the wave row.
   */
  applyFeelTire() {
    if (!this.alive) return false;
    this.stopFeelPace();
    this._feelDeathKey = null;
    const under = ZOMBIE_TIRE_HP - 1;
    this.hp = Math.min(this.hp, under);
    if (!(this.hp > 0)) this.hp = under;
    this._syncLocomotion();
    this.beginFeelPace();
    return true;
  }

  /**
   * Hurt-normal and ×0.5 while HP stays on the walk-normal side of the gate.
   */
  applyFeelHurt() {
    if (!this.alive) return false;
    this.stopFeelPace();
    this._feelDeathKey = null;
    if (Number(this.hp) < ZOMBIE_TIRE_HP) this.hp = ZOMBIE_TIRE_HP;
    this._feelHurtLatch = true;
    this._hurtMs = ZOMBIE_HURT_MS;
    this._playHurtStrip();
    this.beginFeelPace();
    return true;
  }

  /**
   * Feel-only kill sample. `crit` and `disappear` use the live gates
   * (pet crit, water charge ≥ 3) and do not spawn a projectile.
   * The three settle names play that strip once. Weights stay 10/45/45.
   * @param {'deathwalk'|'normal01'|'normal02'|'crit'|'disappear'} mode
   */
  feelKill(mode) {
    if (!this.alive || !this.body) return false;
    this.stopFeelPace();
    this.showcaseHold = true;
    const rules = this.skin?.ruleAnims;
    if (mode === 'crit') {
      this._feelDeathKey = null;
      this.takeDamage(this.hp, { feel: true, kind: 'pet', crit: true, hurtStrip: false });
      return true;
    }
    if (mode === 'disappear') {
      this._feelDeathKey = null;
      this.takeDamage(this.hp, { feel: true, kind: 'water', charge: 3, hurtStrip: false });
      return true;
    }
    const key = mode === 'deathwalk'
      ? rules?.dieDeathwalk
      : mode === 'normal01'
        ? rules?.dieNormal01
        : mode === 'normal02'
          ? rules?.dieNormal02
          : null;
    if (!key) return false;
    this._feelDeathKey = key;
    this.takeDamage(this.hp, { feel: true, kind: 'feel', hurtStrip: false });
    return true;
  }

  _releaseBars() {
    this._hpBar?.destroy();
    this._hpBar = null;
    this.hpBarBg = null;
    this.hpBarFg = null;
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
    this._clearAttackContact();
    if (this.body) {
      this._lastX = this.body.x;
      this._lastY = this.body.y;
      this.scene.tweens.killTweensOf(this.body);
      this.body.destroy();
      this.body = null;
    }
    this._releaseBars();
    this._releaseHpLabel();
  }
}

/** Vertical gap under which two enemy frames read as one stripe. */
const HP_BAR_STACK_Y = 36;
/** Horizontal gap under which two 118×24 enemy frames collide. */
const HP_BAR_STACK_X = 106;

/**
 * Full-HP zombies stay unmarked. Damaged ticks sit on the crown; hide one
 * when it would paint on top of a nearer (or more wounded) bar.
 * @param {Zombie[]} zombies
 */
export function applyHpBarDensity(zombies) {
  const list = [];
  for (const z of zombies) {
    if (!z?.alive || !z.hpBarBg || !(z.hp < z.maxHp)) {
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

/** Fraction of frame height from the top to the first opaque pixel. */
const CROWN_FRACTION = new Map();

/**
 * @param {Phaser.Scene} scene
 * @param {string|undefined} textureKey
 */
function crownFraction(scene, textureKey) {
  if (!textureKey) return 0.08;
  if (CROWN_FRACTION.has(textureKey)) return CROWN_FRACTION.get(textureKey);
  const fraction = measureCrownFraction(scene, textureKey);
  CROWN_FRACTION.set(textureKey, fraction);
  return fraction;
}

/**
 * Scan frame 0 so a slime's empty canvas top does not float the bar,
 * and a humanoid's hair gets the tick instead of the belly.
 * @param {Phaser.Scene} scene
 * @param {string} textureKey
 */
function measureCrownFraction(scene, textureKey) {
  const fallback = 0.08;
  try {
    const tex = scene?.textures?.get?.(textureKey);
    if (!tex || tex.key === '__MISSING') return fallback;
    const src = tex.getSourceImage?.();
    if (!src || typeof document === 'undefined') return fallback;
    const frame = tex.get?.(0);
    const fw = frame?.width || frame?.cutWidth;
    const fh = frame?.height || frame?.cutHeight;
    if (!fw || !fh) return fallback;
    const canvas = document.createElement('canvas');
    canvas.width = fw;
    canvas.height = fh;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return fallback;
    const sx = frame.cutX ?? frame.x ?? 0;
    const sy = frame.cutY ?? frame.y ?? 0;
    ctx.drawImage(src, sx, sy, fw, fh, 0, 0, fw, fh);
    const data = ctx.getImageData(0, 0, fw, fh).data;
    for (let y = 0; y < fh; y++) {
      const row = y * fw * 4;
      for (let x = 0; x < fw; x++) {
        if (data[row + x * 4 + 3] > 24) return y / fh;
      }
    }
  } catch (_) {
    return fallback;
  }
  return fallback;
}
