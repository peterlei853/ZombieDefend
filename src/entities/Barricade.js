import { BARRICADE_MAX_HP } from '../data/waves.js';
import {
  HUD_DEPTH,
  depthFromY,
  scaleFromY,
  grassYMin,
  grassYMax,
  barricadeXAtY,
} from '../systems/DepthView.js';

/**
 * Slanted defensive wall along the grass right edge (2.5D trapezoid).
 * Posts follow barricadeXAtY(y); zombies halt at contactXAt(zombie.y).
 * HP / applyDamage API unchanged.
 */
export class Barricade {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ maxHp?: number }} [opts]
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.maxHp = opts.maxHp ?? BARRICADE_MAX_HP;
    this.hp = this.maxHp;
    /** Base post width before scale (shared by draw + contactXAt). */
    this.baseWidth = 28;

    this.posts = [];
    this.contactMarkers = [];

    const yMin = grassYMin();
    const yMax = grassYMax();

    // Seamless posts along the slanted grass edge (step ≈ post height with overlap).
    let y = yMin;
    let guard = 0;
    while (y <= yMax + 0.5 && guard < 80) {
      guard += 1;
      const s = scaleFromY(y);
      const postH = Math.max(36, 52 * s);
      const postW = this._postWidthAt(y);
      const cx = barricadeXAtY(y, postW / 2);
      const d = depthFromY(y, -2);
      const drawY = y - postH * 0.15;

      // PIXELLAB_HOOK: replace with sprite barricade
      const post = scene.add.rectangle(cx, drawY, postW, postH, 0x6b4f35);
      post.setStrokeStyle(2, 0x9a9a9a);
      post.setDepth(d);
      post.setData('logicalY', y);
      post.setData('baseFill', 0x6b4f35);
      this.posts.push(post);

      const marker = scene.add.rectangle(
        cx - postW / 2 - 1,
        drawY,
        3,
        postH * 0.9,
        0xc4c4c4,
        0.85
      );
      marker.setDepth(d + 1);
      this.contactMarkers.push(marker);

      // Slight overlap so no visible gaps between posts
      y += postH * 0.52;
    }

    // Slanted silhouette / contact strip following the polyline (not a vertical rect).
    this.gfx = scene.add.graphics().setDepth(depthFromY(yMin, -4));
    this._drawSilhouette(yMin, yMax);

    // HP bar: camera-fixed near top of wall (scrollFactor 0)
    const cam = scene.cameras.main;
    const midY = (yMin + yMax) / 2;
    const screenX = barricadeXAtY(midY) - cam.scrollX;
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

  /** Post width at Y (same formula for draw + collision). */
  _postWidthAt(y) {
    const s = scaleFromY(y);
    return this.baseWidth * (0.85 + 0.2 * s);
  }

  _drawSilhouette(yMin, yMax) {
    const samples = [];
    for (let y = yMin; y <= yMax; y += 3) {
      const postW = this._postWidthAt(y);
      const cx = barricadeXAtY(y, postW / 2);
      const half = postW * 0.35;
      samples.push({ y, left: cx - half, right: cx + half, face: cx - postW / 2 });
    }
    if (samples.length < 2) return;

    this.gfx.clear();
    this.gfx.fillStyle(0x4a3724, 0.55);
    this.gfx.beginPath();
    this.gfx.moveTo(samples[0].left, samples[0].y);
    for (const s of samples) this.gfx.lineTo(s.right, s.y);
    for (let i = samples.length - 1; i >= 0; i--) {
      this.gfx.lineTo(samples[i].left, samples[i].y);
    }
    this.gfx.closePath();
    this.gfx.fillPath();

    // Thin contact face along the slanted left edge
    this.gfx.lineStyle(3, 0xc4c4c4, 0.35);
    this.gfx.beginPath();
    this.gfx.moveTo(samples[0].face, samples[0].y);
    for (const s of samples) this.gfx.lineTo(s.face, s.y);
    this.gfx.strokePath();
  }

  /**
   * Left face of the post at this Y — zombies halt here.
   * Matches drawn posts (same barricadeXAtY + _postWidthAt).
   * @param {number} y
   */
  contactXAt(y) {
    const postW = this._postWidthAt(y);
    // Post center = barricadeXAtY(y, postW/2); left face = center - postW/2
    return barricadeXAtY(y, postW / 2) - postW / 2;
  }

  applyDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    this._refreshHpBar();
    return this.hp <= 0;
  }

  /**
   * Red flash on the posts around this Y for 0.1s.
   * Rects use setTint; fill is restored with the tint so the hit reads bright red.
   * @param {number} y
   */
  flashAtY(y) {
    let nearest = null;
    let nearestD = Infinity;
    for (const post of this.posts) {
      const py = post.getData('logicalY');
      const d = Math.abs(py - y);
      if (d < nearestD) {
        nearestD = d;
        nearest = post;
      }
    }
    if (!nearest) return;
    const band = Math.max(24, nearest.height * 0.55);
    for (const post of this.posts) {
      const py = post.getData('logicalY');
      if (Math.abs(py - y) <= band) this._flashPost(post);
    }
  }

  _flashPost(post) {
    const token = (post.getData('flashToken') || 0) + 1;
    post.setData('flashToken', token);
    post.setFillStyle(0xff2a2a);
    post.setTint(0xff0000);
    this.scene.time.delayedCall(100, () => {
      if (!post.active) return;
      if (post.getData('flashToken') !== token) return;
      post.clearTint();
      post.setFillStyle(post.getData('baseFill') ?? 0x6b4f35);
    });
  }

  /**
   * Short red claw / spark at the contact point. Removed after 0.15s.
   * @param {number} x
   * @param {number} y
   */
  spawnImpact(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    // PIXELLAB_HOOK: replace with sprite claw impact
    const g = this.scene.add.graphics();
    g.lineStyle(2, 0xff2200, 1);
    g.beginPath();
    g.moveTo(x - 8, y - 7);
    g.lineTo(x - 1, y + 1);
    g.lineTo(x - 7, y + 8);
    g.moveTo(x - 2, y - 9);
    g.lineTo(x + 5, y - 1);
    g.lineTo(x - 1, y + 9);
    g.moveTo(x + 3, y - 7);
    g.lineTo(x + 9, y + 1);
    g.lineTo(x + 4, y + 8);
    g.strokePath();
    g.fillStyle(0xff5522, 0.95);
    g.fillCircle(x + 1, y, 2.5);
    g.setDepth(depthFromY(y, 6));
    this.scene.time.delayedCall(150, () => {
      if (g.active) g.destroy();
    });
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
    if (this.gfx) this.gfx.destroy();
    for (const p of this.posts) p.destroy();
    for (const m of this.contactMarkers) m.destroy();
    this.posts = [];
    this.contactMarkers = [];
    this.hpBarBg.destroy();
    this.hpBarFg.destroy();
  }
}
