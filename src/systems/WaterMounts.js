import { depthFromY, layoutPx, scaleFromY } from './DepthView.js';
import { libraryAsset, playLibraryAnim } from '../assets/libraryAssets.js';
import {
  WATER_MOUNT_ALIGN_FIELD,
  WATER_MOUNT_ALT_KEY,
  WATER_MOUNT_GUN_KEY,
  WATER_MOUNT_KEY,
  WATER_MOUNT_ORIGIN,
  buildWaterMountSlots,
  nearestWaterMount,
} from '../assets/waterMounts.js';

/**
 * Six water cradles on the fence. Visual + muzzle anchors.
 * Barricade HP, contactXAt, and the post list are not modified.
 * The side mount is the row. The front alt is the slot she is stopped behind.
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
    this.sprites = [];
    /** @type {Phaser.GameObjects.GameObject[]} */
    this.guns = [];
    for (const slot of this.slots) {
      const made = this._make(scene, slot);
      this.sprites.push(made.mount);
      if (made.gun) this.guns.push(made.gun);
    }
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

  /**
   * Front dual-post on the active slot. The other five stay the side cradle.
   * @param {number} index -1 clears the highlight
   */
  setActive(index) {
    const tex = this.scene?.textures;
    const alt = tex?.exists?.(WATER_MOUNT_ALT_KEY) ? WATER_MOUNT_ALT_KEY : null;
    const side = tex?.exists?.(WATER_MOUNT_KEY) ? WATER_MOUNT_KEY : null;
    if (!side && !alt) return;
    for (let i = 0; i < this.sprites.length; i++) {
      const sprite = this.sprites[i];
      if (!sprite || typeof sprite.setTexture !== 'function') continue;
      const want = i === index && alt ? alt : side;
      if (!want || sprite.texture?.key === want) continue;
      sprite.setTexture(want);
      this._applyOrigin(sprite, want);
    }
  }

  destroy() {
    for (const sprite of [...this.sprites, ...this.guns]) {
      try {
        sprite?.destroy?.();
      } catch (_) {
        /* already destroyed */
      }
    }
    this.sprites = [];
    this.guns = [];
    this.slots = [];
  }

  /**
   * @param {Phaser.Scene} scene
   * @param {{ x: number, feetY: number, scale: number, gunX: number, gunY: number, y: number }} slot
   * @returns {{ mount: Phaser.GameObjects.GameObject, gun: Phaser.GameObjects.GameObject|null }}
   */
  _make(scene, slot) {
    const tex = scene.textures;
    const depth = depthFromY(slot.y, 8);
    const cradle = tex?.exists?.(WATER_MOUNT_KEY)
      ? WATER_MOUNT_KEY
      : tex?.exists?.(WATER_MOUNT_ALT_KEY)
        ? WATER_MOUNT_ALT_KEY
        : null;
    if (cradle && scene.add?.sprite) {
      const mount = scene.add.sprite(slot.x, slot.feetY, cradle);
      this._applyOrigin(mount, cradle);
      mount.setScale(slot.scale);
      mount.setDepth(depth);
      playLibraryAnim(mount, cradle, scene);
      let gun = null;
      if (tex?.exists?.(WATER_MOUNT_GUN_KEY)) {
        gun = scene.add.sprite(slot.gunX, slot.gunY, WATER_MOUNT_GUN_KEY);
        gun.setOrigin(0.5, 0.5);
        gun.setScale(slot.scale * 0.5);
        gun.setDepth(depth + 1);
      }
      return { mount, gun };
    }
    if (tex?.exists?.(WATER_MOUNT_GUN_KEY) && scene.add?.sprite) {
      const mount = scene.add.sprite(slot.gunX, slot.gunY, WATER_MOUNT_GUN_KEY);
      mount.setOrigin(0.5, 0.5);
      mount.setScale(scaleFromY(slot.y) * 0.72);
      mount.setDepth(depth);
      return { mount, gun: null };
    }
    const w = layoutPx(22);
    const h = layoutPx(10);
    const rect = scene.add.rectangle(slot.gunX, slot.gunY, w, h, 0x4fc3f7);
    rect.setStrokeStyle?.(Math.max(1, layoutPx(1)), 0x01579b);
    rect.setDepth?.(depth);
    return { mount: rect, gun: null };
  }

  /**
   * @param {Phaser.GameObjects.Sprite} sprite
   * @param {string} key
   */
  _applyOrigin(sprite, key) {
    const asset = libraryAsset(this.scene, key);
    const origin = asset?.origin || WATER_MOUNT_ORIGIN;
    sprite.setOrigin?.(origin[0], origin[1]);
  }
}
