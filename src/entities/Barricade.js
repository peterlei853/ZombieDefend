import { BARRICADE_X, BARRICADE_MAX_HP } from '../data/waves.js';
import {
  WORLD_HEIGHT,
  HORIZON_Y,
  HUD_DEPTH,
  depthFromY,
  laneCenters,
  scaleFromY,
} from '../systems/DepthView.js';

/**
 * Right-side defensive wall. Zombies stop at contactX and deal DPS here.
 * World-anchored; optional lane posts for Z-sort. Contact X / HP / DPS unchanged.
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
    this.top = HORIZON_Y + 8;
    this.bottom = WORLD_HEIGHT - 10;
    this.height = this.bottom - this.top;

    this.posts = [];
    this.contactMarkers = [];

    const lanes = laneCenters();
    // Segment posts by lane so nearer lanes occlude farther ones.
    for (let i = 0; i < lanes.length; i++) {
      const y = lanes[i];
      const s = scaleFromY(y);
      const postH = Math.max(36, 52 * s);
      const postW = this.width * (0.85 + 0.2 * s);
      const d = depthFromY(y, -2);

      // PIXELLAB_HOOK: replace with sprite barricade
      const post = scene.add.rectangle(this.x, y - postH * 0.15, postW, postH, 0x6b4f35);
      post.setStrokeStyle(2, 0x9a9a9a);
      post.setDepth(d);
      this.posts.push(post);

      const marker = scene.add.rectangle(
        this.x - postW / 2 - 1,
        y - postH * 0.15,
        3,
        postH * 0.9,
        0xc4c4c4,
        0.85
      );
      marker.setDepth(d + 1);
      this.contactMarkers.push(marker);
    }

    // Continuous contact silhouette behind posts (far depth) so the wall reads as one mass.
    this.gfx = scene.add.rectangle(
      this.x,
      this.top + this.height / 2,
      this.width * 0.7,
      this.height,
      0x4a3724,
      0.55
    );
    this.gfx.setDepth(depthFromY(lanes[0], -4));

    // Thin "XXXXX line" contact marker spanning the wall face
    this.contactLine = scene.add.rectangle(
      this.x - this.width / 2 - 1,
      this.top + this.height / 2,
      3,
      this.height,
      0xc4c4c4,
      0.35
    );
    this.contactLine.setDepth(depthFromY(lanes[0], -3));

    // HP bar: camera-fixed near top of wall (scrollFactor 0)
    const cam = scene.cameras.main;
    const screenX = this.x - cam.scrollX;
    const barY = 48;
    this.hpBarBg = scene.add
      .rectangle(screenX, barY, 80, 8, 0x222222)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 10);
    this.hpBarFg = scene.add
      .rectangle(screenX - 40, barY, 80, 8, 0x3ecf5a)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 11);
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
    for (const p of this.posts) p.destroy();
    for (const m of this.contactMarkers) m.destroy();
    this.posts = [];
    this.contactMarkers = [];
    this.hpBarBg.destroy();
    this.hpBarFg.destroy();
  }
}
