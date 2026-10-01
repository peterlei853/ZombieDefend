import { getGoldByHP } from '../data/economy.js';
import { depthFromY, scaleFromY } from '../systems/DepthView.js';

let _zombieId = 0;

/**
 * Red-square zombie placeholder that walks right until barricade contact.
 * Scale and draw-order follow lane Y (2.5D DepthView).
 */
export class Zombie {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ x: number, y: number, hp: number, speed: number, dps: number, wave?: number }} cfg
   */
  constructor(scene, cfg) {
    this.scene = scene;
    this.id = ++_zombieId;
    this.maxHp = cfg.hp;
    this.hp = cfg.hp;
    this.speed = cfg.speed;
    this.dps = cfg.dps;
    this.wave = cfg.wave || 1;
    this.baseSize = cfg.hp >= 150 ? 26 : cfg.hp >= 100 ? 22 : 18;
    this.alive = true;
    this.atBarricade = false;
    /** Seconds until the next barricade bite (punch + hit VFX). */
    this._attackCooldown = 1;
    this._attackBeat = false;
    /** Halt X while chewing, so the punch tween can return here. */
    this._haltX = null;
    /** Fractional contact DPS waiting to be shown as an integer. */
    this.barricadeDmgAccum = 0;
    this.goldValue = getGoldByHP(this.maxHp);
    this.laneY = cfg.y;
    this.scale = scaleFromY(cfg.y);

    // PIXELLAB_HOOK: replace with sprite zombie
    this.body = scene.add.rectangle(cfg.x, cfg.y, this.baseSize, this.baseSize, 0xd32f2f);
    this.body.setStrokeStyle(1, 0x7a1010);
    this.body.setScale(this.scale);

    const barW = Math.max(20, this.baseSize + 6) * this.scale;
    this.hpBarBg = scene.add.rectangle(cfg.x, cfg.y - this.displayHalf - 8 * this.scale, barW, 5 * this.scale, 0x1a1a1a);
    this.hpBarFg = scene.add
      .rectangle(cfg.x - barW / 2, cfg.y - this.displayHalf - 8 * this.scale, barW, 5 * this.scale, 0xff5252)
      .setOrigin(0, 0.5);
    this._barW = barW;

    this._applyDepth();
  }

  /** Half-extent of the scaled body (hitbox / contact). */
  get displayHalf() {
    return (this.baseSize * this.scale) / 2;
  }

  /** @deprecated use baseSize / displayHalf — kept as alias for callers expecting .size */
  get size() {
    return this.baseSize * this.scale;
  }

  get x() {
    return this.body.x;
  }

  get y() {
    return this.body.y;
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
      const nextX = this.body.x + this.speed * deltaSec;
      const halt = contactX - this.displayHalf;
      if (nextX >= halt) {
        this.body.x = halt;
        this.atBarricade = true;
        this._haltX = halt;
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

  /** 6px punch into the barricade, then tween back to the halt X. */
  _playAttackPunch() {
    if (!this.alive || !this.body) return;
    const homeX = this._haltX ?? this.body.x;
    this.scene.tweens.killTweensOf(this.body);
    this.body.x = homeX;
    this.scene.tweens.add({
      targets: this.body,
      x: homeX + 6,
      duration: 80,
      yoyo: true,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        if (this.alive) this._syncBars();
      },
      onComplete: () => {
        if (this.alive && this.body) {
          this.body.x = homeX;
          this._syncBars();
        }
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
   * @returns {boolean} true if killed
   */
  takeDamage(amount) {
    if (!this.alive) return false;
    this.hp -= amount;
    this._syncBars();
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.destroyVisuals();
      return true;
    }
    // Hit flash
    this.body.setFillStyle(0xffaaaa);
    this.scene.time.delayedCall(60, () => {
      if (this.alive && this.body.active) this.body.setFillStyle(0xd32f2f);
    });
    return false;
  }

  _syncBars() {
    if (!this.hpBarBg || !this.hpBarFg) return;
    const barY = this.body.y - this.displayHalf - 8 * this.scale;
    this.hpBarBg.x = this.body.x;
    this.hpBarBg.y = barY;
    this.hpBarFg.x = this.body.x - this._barW / 2;
    this.hpBarFg.y = barY;
    const ratio = this.maxHp > 0 ? Math.max(0, this.hp / this.maxHp) : 0;
    this.hpBarFg.width = this._barW * ratio;
  }

  /** Axis-aligned hitbox for bullet tests (matches scaled visual size). */
  getBounds() {
    const h = this.displayHalf;
    return {
      left: this.body.x - h,
      right: this.body.x + h,
      top: this.body.y - h,
      bottom: this.body.y + h,
    };
  }

  destroyVisuals() {
    if (this.body) {
      this.scene.tweens.killTweensOf(this.body);
      this.body.destroy();
      this.body = null;
    }
    if (this.hpBarBg) {
      this.hpBarBg.destroy();
      this.hpBarBg = null;
    }
    if (this.hpBarFg) {
      this.hpBarFg.destroy();
      this.hpBarFg = null;
    }
  }
}
