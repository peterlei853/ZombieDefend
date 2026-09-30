import { BARRICADE_X, BARRICADE_MAX_HP, GAME_HEIGHT } from '../data/waves.js';

/**
 * Right-side defensive wall. Zombies stop at contactX and deal DPS here.
 */
export class Barricade {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ maxHp?: number, x?: number }} [opts]
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.x = opts.x ?? BARRICADE_X;
    this.maxHp = opts.maxHp ?? BARRICADE_MAX_HP;
    this.hp = this.maxHp;
    this.width = 28;
    this.top = 40;
    this.bottom = GAME_HEIGHT - 10;
    this.height = this.bottom - this.top;

    // PIXELLAB_HOOK: replace with sprite barricade
    this.gfx = scene.add.rectangle(
      this.x,
      this.top + this.height / 2,
      this.width,
      this.height,
      0x6b4f35
    );
    this.gfx.setStrokeStyle(2, 0x9a9a9a);
    this.gfx.setDepth(5);

    // Thin "XXXXX line" contact marker on the left face
    this.contactLine = scene.add.rectangle(
      this.x - this.width / 2 - 1,
      this.top + this.height / 2,
      3,
      this.height,
      0xc4c4c4,
      0.85
    );
    this.contactLine.setDepth(6);

    this.hpBarBg = scene.add.rectangle(this.x, this.top - 12, 80, 8, 0x222222).setDepth(20);
    this.hpBarFg = scene.add.rectangle(this.x - 40, this.top - 12, 80, 8, 0x3ecf5a).setOrigin(0, 0.5).setDepth(21);
  }

  /** X where zombies halt and start dealing DPS. */
  get contactX() {
    return this.x - this.width / 2;
  }

  applyDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    this._refreshHpBar();
    return this.hp <= 0;
  }

  _refreshHpBar() {
    const ratio = this.maxHp > 0 ? this.hp / this.maxHp : 0;
    this.hpBarFg.width = 80 * ratio;
    if (ratio > 0.5) this.hpBarFg.setFillStyle(0x3ecf5a);
    else if (ratio > 0.25) this.hpBarFg.setFillStyle(0xe0b040);
    else this.hpBarFg.setFillStyle(0xe04848);
  }

  isDestroyed() {
    return this.hp <= 0;
  }

  destroy() {
    this.gfx.destroy();
    this.contactLine.destroy();
    this.hpBarBg.destroy();
    this.hpBarFg.destroy();
  }
}
