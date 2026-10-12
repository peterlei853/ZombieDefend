import { BARRICADE_MAX_HP } from '../data/waves.js';
import {
  HUD_DEPTH,
  depthFromY,
  scaleFromY,
  grassYMin,
  grassYMax,
  barricadeXAtY,
  LAYOUT_SCALE,
  layoutPx,
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
    /** Base post width before depth taper (shared by draw + contactXAt). */
    this.baseWidth = 28 * LAYOUT_SCALE;

    this.posts = [];
    this.contactMarkers = [];
    /** Intact fence sheet. Damaged swap is visual only. */
    this._fenceKey = scene.textures?.exists?.('barricade-post') ? 'barricade-post' : null;
    this._fenceDamagedKey = scene.textures?.exists?.('barricade-post-damaged')
      ? 'barricade-post-damaged'
      : null;

    const yMin = grassYMin();
    const yMax = grassYMax();

    // Seamless posts along the slanted grass edge (step ≈ post height with overlap).
    let y = yMin;
    let guard = 0;
    while (y <= yMax + 0.5 && guard < 80) {
      guard += 1;
      const s = scaleFromY(y);
      const postH = Math.max(36, 52 * s) * LAYOUT_SCALE;
      const postW = this._postWidthAt(y);
      const cx = barricadeXAtY(y, postW / 2);
      const d = depthFromY(y, -2);
      const groundY = y;

      const post = this._fenceKey
        ? this._createFencePost(scene, cx, groundY, postW, postH)
        : this._createPlaceholderPost(scene, cx, groundY, postW, postH, d);
      post.setDepth(d);
      post.setData('logicalY', y);
      post.setData('baseFill', 0x6b4f35);
      this.posts.push(post);

      // Slight overlap so the slant reads as one fence. Spacing is visual;
      // contactXAt still uses _postWidthAt and does not depend on the sprite.
      y += postH * 0.52;
    }

    // Placeholder silhouette only. Fence art is gappy on purpose — a fill
    // behind the stakes would close the holes bullets are meant to read through.
    if (this._fenceKey) {
      this.gfx = null;
    } else {
      this.gfx = scene.add.graphics().setDepth(depthFromY(yMin, -4));
      this._drawSilhouette(yMin, yMax);
    }

    // HP bar: camera-fixed near top of wall (scrollFactor 0)
    const cam = scene.cameras.main;
    const midY = (yMin + yMax) / 2;
    const screenX = barricadeXAtY(midY) - cam.scrollX;
    const barY = layoutPx(48);
    const barW = layoutPx(80);
    const barH = layoutPx(8);
    this._barW = barW;
    this.hpBarBg = scene.add
      .rectangle(screenX, barY, barW, barH, 0x222222)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 10);
    this.hpBarFg = scene.add
      .rectangle(screenX - barW / 2, barY, barW, barH, 0x3ecf5a)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 11);
  }

  /**
   * Feet-anchored fence post. Collision stays on contactXAt (left face).
   * PIXELLAB_HOOK: barricade-post / barricade-post-damaged (32×64, origin 0.5, 1).
   * @param {Phaser.Scene} scene
   * @param {number} cx
   * @param {number} groundY
   * @param {number} postW
   * @param {number} postH
   */
  _createFencePost(scene, cx, groundY, postW, postH) {
    const post = scene.add.image(cx, groundY, this._fenceKey);
    post.setOrigin(0.5, 1);
    post.setDisplaySize(postW, postH);
    return post;
  }

  /**
   * Brown rectangle if the fence sheet failed to load.
   * @param {Phaser.Scene} scene
   * @param {number} cx
   * @param {number} groundY
   * @param {number} postW
   * @param {number} postH
   * @param {number} depth
   */
  _createPlaceholderPost(scene, cx, groundY, postW, postH, depth) {
    const drawY = groundY - postH * 0.15;
    const post = scene.add.rectangle(cx, drawY, postW, postH, 0x6b4f35);
    post.setStrokeStyle(layoutPx(2), 0x9a9a9a);
    const marker = scene.add.rectangle(
      cx - postW / 2 - layoutPx(1),
      drawY,
      layoutPx(3),
      postH * 0.9,
      0xc4c4c4,
      0.85
    );
    marker.setDepth(depth + 1);
    this.contactMarkers.push(marker);
    return post;
  }

  /** Post width at Y (same formula for draw + collision). */
  _postWidthAt(y) {
    const s = scaleFromY(y);
    return this.baseWidth * (0.85 + 0.2 * s);
  }

  _drawSilhouette(yMin, yMax) {
    const samples = [];
    for (let y = yMin; y <= yMax; y += layoutPx(3)) {
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
    this.gfx.lineStyle(layoutPx(3), 0xc4c4c4, 0.35);
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
   * Placeholder posts are Shapes (no tint component); fill is the red flash.
   * Sprites that replace them still get setTint(0xff0000).
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
    const band = Math.max(layoutPx(24), (nearest.displayHeight || nearest.height) * 0.55);
    for (const post of this.posts) {
      const py = post.getData('logicalY');
      if (Math.abs(py - y) <= band) this._flashPost(post);
    }
  }

  _flashPost(post) {
    const token = (post.getData('flashToken') || 0) + 1;
    post.setData('flashToken', token);
    if (typeof post.setFillStyle === 'function') post.setFillStyle(0xff0000);
    if (typeof post.setTint === 'function') post.setTint(0xff0000);
    this.scene.time.delayedCall(100, () => {
      if (!post.active) return;
      if (post.getData('flashToken') !== token) return;
      if (typeof post.clearTint === 'function') post.clearTint();
      if (typeof post.setFillStyle === 'function') {
        post.setFillStyle(post.getData('baseFill') ?? 0x6b4f35);
      }
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
    const u = LAYOUT_SCALE;
    const g = this.scene.add.graphics();
    g.lineStyle(2 * u, 0xff2200, 1);
    g.beginPath();
    g.moveTo(x - 8 * u, y - 7 * u);
    g.lineTo(x - 1 * u, y + 1 * u);
    g.lineTo(x - 7 * u, y + 8 * u);
    g.moveTo(x - 2 * u, y - 9 * u);
    g.lineTo(x + 5 * u, y - 1 * u);
    g.lineTo(x - 1 * u, y + 9 * u);
    g.moveTo(x + 3 * u, y - 7 * u);
    g.lineTo(x + 9 * u, y + 1 * u);
    g.lineTo(x + 4 * u, y + 8 * u);
    g.strokePath();
    g.fillStyle(0xff5522, 0.95);
    g.fillCircle(x + 1 * u, y, 2.5 * u);
    g.setDepth(depthFromY(y, 6));
    this.scene.time.delayedCall(150, () => {
      if (g.active) g.destroy();
    });
  }

  _refreshHpBar() {
    const ratio = this.maxHp > 0 ? this.hp / this.maxHp : 0;
    this.hpBarFg.width = this._barW * ratio;
    if (ratio > 0.5) this.hpBarFg.setFillStyle(0x3ecf5a);
    else if (ratio > 0.25) this.hpBarFg.setFillStyle(0xe0b040);
    else this.hpBarFg.setFillStyle(0xe04848);
    this._syncFenceDamage(ratio);
  }

  /**
   * Swap to the cracked sheet once the wall is at half HP or below.
   * Does not move posts or change contactXAt.
   * @param {number} ratio
   */
  _syncFenceDamage(ratio) {
    if (!this._fenceKey || !this._fenceDamagedKey) return;
    const key = ratio <= 0.5 ? this._fenceDamagedKey : this._fenceKey;
    for (const post of this.posts) {
      if (typeof post.setTexture !== 'function') continue;
      if (post.texture?.key === key) continue;
      post.setTexture(key);
      post.setOrigin(0.5, 1);
    }
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
