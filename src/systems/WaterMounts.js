import { depthFromY, layoutPx, scaleFromY } from './DepthView.js';
import { playLibraryAnim } from '../assets/libraryAssets.js';
import {
  WATER_MOUNT_ALIGN_FIELD,
  WATER_MOUNT_FALLBACK_KEY,
  WATER_MOUNT_KEY,
  buildWaterMountSlots,
  nearestWaterMount,
} from '../assets/waterMounts.js';

/**
 * Six water guns on the fence. Visual + muzzle anchors.
 * Barricade HP, contactXAt, and the post list are not modified.
 */
export class WaterMounts {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ postAnchorAt: (y: number) => { x: number, groundY: number, postH: number } }} barricade
   */
  constructor(scene, barricade) {
    this.scene = scene;
    this.slots = buildWaterMountSlots((y) => barricade.postAnchorAt(y));
    /** @type {Phaser.GameObjects.GameObject[]} */
    this.sprites = this.slots.map((slot) => this._make(scene, slot));
  }

  /**
   * Slot the hero is standing behind, or null when she is between mounts.
   * @param {number} heroY
   */
  aligned(heroY) {
    return nearestWaterMount(heroY, this.slots, layoutPx(WATER_MOUNT_ALIGN_FIELD));
  }

  /**
   * Closest slot, including the gaps. Used to park the water-only demo.
   * @param {number} heroY
   */
  nearest(heroY) {
    return nearestWaterMount(heroY, this.slots, Infinity);
  }

  destroy() {
    for (const sprite of this.sprites) {
      try {
        sprite?.destroy?.();
      } catch (_) {
        /* already destroyed */
      }
    }
    this.sprites = [];
    this.slots = [];
  }

  /**
   * @param {Phaser.Scene} scene
   * @param {{ gunX: number, gunY: number, y: number }} slot
   */
  _make(scene, slot) {
    const tex = scene.textures;
    // PIXELLAB_HOOK: prop-water-mount — topmost water gun on the fence post.
    // Fallback is the unarmed front-float still. Do not author a held-hero sheet.
    const key = tex?.exists?.(WATER_MOUNT_KEY)
      ? WATER_MOUNT_KEY
      : tex?.exists?.(WATER_MOUNT_FALLBACK_KEY)
        ? WATER_MOUNT_FALLBACK_KEY
        : null;
    const depth = depthFromY(slot.y, 8);
    const scale = scaleFromY(slot.y) * 0.72;
    if (key && scene.add?.sprite) {
      const sprite = scene.add.sprite(slot.gunX, slot.gunY, key);
      sprite.setOrigin(0.5, 0.5);
      sprite.setScale(scale);
      sprite.setDepth(depth);
      playLibraryAnim(sprite, key, scene);
      return sprite;
    }
    const w = layoutPx(22);
    const h = layoutPx(10);
    const rect = scene.add.rectangle(slot.gunX, slot.gunY, w, h, 0x4fc3f7);
    rect.setStrokeStyle?.(Math.max(1, layoutPx(1)), 0x01579b);
    rect.setDepth?.(depth);
    return rect;
  }
}
