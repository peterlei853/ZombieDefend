import { getGoldByHP } from '../data/economy.js';

let _zombieId = 0;

/**
 * Red-square zombie placeholder that walks right until barricade contact.
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
    this.size = cfg.hp >= 150 ? 26 : cfg.hp >= 100 ? 22 : 18;
    this.alive = true;
    this.atBarricade = false;
    this.goldValue = getGoldByHP(this.maxHp);

    // PIXELLAB_HOOK: replace with sprite zombie
    this.body = scene.add.rectangle(cfg.x, cfg.y, this.size, this.size, 0xd32f2f);
    this.body.setStrokeStyle(1, 0x7a1010);
    this.body.setDepth(10);

    const barW = Math.max(20, this.size + 6);
    this.hpBarBg = scene.add.rectangle(cfg.x, cfg.y - this.size / 2 - 8, barW, 5, 0x1a1a1a).setDepth(11);
    this.hpBarFg = scene.add
      .rectangle(cfg.x - barW / 2, cfg.y - this.size / 2 - 8, barW, 5, 0xff5252)
      .setOrigin(0, 0.5)
      .setDepth(12);
    this._barW = barW;
  }

  get x() {
    return this.body.x;
  }

  get y() {
    return this.body.y;
  }

  /**
   * @param {number} deltaSec
   * @param {number} contactX
   */
  update(deltaSec, contactX) {
    if (!this.alive) return;

    if (!this.atBarricade) {
      const nextX = this.body.x + this.speed * deltaSec;
      if (nextX >= contactX - this.size / 2) {
        this.body.x = contactX - this.size / 2;
        this.atBarricade = true;
      } else {
        this.body.x = nextX;
      }
    }

    this._syncBars();
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
    this.hpBarBg.x = this.body.x;
    this.hpBarBg.y = this.body.y - this.size / 2 - 8;
    this.hpBarFg.x = this.body.x - this._barW / 2;
    this.hpBarFg.y = this.hpBarBg.y;
    const ratio = this.maxHp > 0 ? Math.max(0, this.hp / this.maxHp) : 0;
    this.hpBarFg.width = this._barW * ratio;
  }

  /** Axis-aligned hitbox for bullet tests. */
  getBounds() {
    const h = this.size / 2;
    return {
      left: this.body.x - h,
      right: this.body.x + h,
      top: this.body.y - h,
      bottom: this.body.y + h,
    };
  }

  destroyVisuals() {
    if (this.body) {
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
