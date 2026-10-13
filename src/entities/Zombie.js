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
import { depthFromY, displayScaleFromY, grassYMax, grassYMin, LAYOUT_SCALE, layoutPx } from '../systems/DepthView.js';
import { petReachableBeforeFence } from '../systems/petAggro.js';
import { beginHitlag, spawnBlood, spawnFragments } from '../systems/combatJuice.js';
import { DAMAGE_COLORS, showDamageText } from '../ui/damageText.js';

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
    /** Panda slow. March speed only — barricade bite DPS is untouched. */
    this._slowMs = 0;
    this._slowMult = 1;
    /** Dragon smoke burn. Ticked by tickStatus; does not change contact DPS. */
    this._burnLeft = 0;
    this._burnAcc = 0;
    this._burnDmg = 0;
    this._burnInterval = 450;
    /** Seconds until the next barricade bite (punch + hit VFX). */
    this._attackCooldown = 1;
    this._attackBeat = false;
    /** Halt X while chewing, so the lunge tween can return here. */
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
    this._barPad = metrics.pad;
    this.hpBarBg = scene.add.rectangle(cfg.x, metrics.barY, metrics.barW, metrics.barH, HP_BAR_TRACK);
    this.hpBarBg.setStrokeStyle(metrics.pad, HP_BAR_OUTLINE);
    this.hpBarFg = scene.add
      .rectangle(cfg.x - metrics.barW / 2, metrics.barY, metrics.barW, metrics.barH, HP_BAR_FILL)
      .setOrigin(0, 0.5);
    // Full HP stays hidden. applyHpBarDensity shows the tick once damaged.
    this.setHpBarShown(false);

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
  update(deltaSec, contactX, pet = null) {
    if (!this.alive) return;

    const chase = this._petToChase(pet, contactX);
    if (chase) {
      this._chasePet(deltaSec, chase, contactX);
    } else {
      this.petBiteTarget = null;
      if (!this.atBarricade) {
        // Wave speed is field px/s. LAYOUT_SCALE keeps time-to-contact on the wider canvas.
        // Critical HP uses CRIT_SPEED_MULT (stumble sheet or not).
        const speed = woundedMoveSpeed(this.speed, this.hp, this.maxHp) * this._slowFactor();
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
    const reach = this._biteReach(pet);
    const dx = pet.x - this.body.x;
    const dy = pet.y - this.body.y;
    const dist = Math.hypot(dx, dy);
    if (this.atBarricade) {
      this.atBarricade = false;
      this._haltX = null;
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
        this._attackBeat = true;
      } else {
        this._stopWalkAnim();
      }
      return;
    }
    this.petBiteTarget = null;
    this._haltX = null;
    this.scene?.tweens?.killTweensOf?.(this.body);
    const speed = woundedMoveSpeed(this.speed, this.hp, this.maxHp) * this._slowFactor();
    const step = speed * LAYOUT_SCALE * deltaSec;
    if (dist > 0.001) {
      this.body.x += (dx / dist) * step;
      this.body.y += (dy / dist) * step;
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

  /** 1 while unslowed. */
  _slowFactor() {
    if (!(this._slowMs > 0)) return 1;
    return this._slowMult > 0 ? this._slowMult : 1;
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
   * True once on each ~1s bite while this zombie is dealing contact DPS.
   * StageScene uses the beat for flash / claw / damage text; DPS math stays per-frame.
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
      this.scene.audio?.playZombieDeath();
      return true;
    }
    this._playHitFlash();
    if (amount > 0) this.scene.audio?.playZombieHurt();
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
    const { barW, barH, pad, barY } = this._barMetrics();
    this._barW = barW;
    this._barH = barH;
    this._barPad = pad;
    this.hpBarBg.setSize(barW, barH);
    this.hpBarBg.setStrokeStyle(pad, HP_BAR_OUTLINE);
    this.hpBarBg.x = this.body.x;
    this.hpBarBg.y = barY;
    this.hpBarFg.setFillStyle(HP_BAR_FILL);
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
