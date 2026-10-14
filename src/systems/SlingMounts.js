import { depthFromY, layoutPx, scaleFromY } from './DepthView.js';
import { libraryAsset, playLibraryAnim } from '../assets/libraryAssets.js';
import { WATER_MOUNT_ORIGIN } from '../assets/waterMounts.js';
import {
  SLING_MOUNT_ALIGN_FIELD,
  SLING_MOUNT_ALT_KEY,
  SLING_MOUNT_GUN_KEY,
  buildSlingMountSlots,
  nearestSlingMount,
  slingActiveKey,
  slingRowKey,
} from '../assets/slingMounts.js';

/**
 * Six sling cradles on the fence. Visual + muzzle anchors.
 * Barricade HP, contactXAt, gold, and saves are not modified.
 * The row is prop-sling-mount-hi-vis, then prop-sling-mount,
 * then prop-water-mount-hi-vis. The front alt is the slot she
 * is stopped behind.
 */
export class SlingMounts {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ postAnchorAt: (y: number) => { x: number, groundY: number, postH: number } }} barricade
   */
  constructor(scene, barricade) {
    this.scene = scene;
    this.slots = buildSlingMountSlots((y) => barricade.postAnchorAt(y));
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
    return nearestSlingMount(heroY, this.slots, layoutPx(SLING_MOUNT_ALIGN_FIELD));
  }

  /**
   * Closest slot, including the gaps. Used to park the sling-only demo.
   * @param {number} heroY
   */
  nearest(heroY) {
    return nearestSlingMount(heroY, this.slots, Infinity);
  }

  /**
   * Front alt on the active slot. The other five stay the row cradle.
   * @param {number} index -1 clears the highlight
   */
  setActive(index) {
    const exists = (key) => !!this.scene?.textures?.exists?.(key);
    const row = slingRowKey(exists);
    const active = slingActiveKey(exists);
    if (!row && !active) return;
    for (let i = 0; i < this.sprites.length; i++) {
      const sprite = this.sprites[i];
      if (!sprite || typeof sprite.setTexture !== 'function') continue;
      const want = i === index && active ? active : row;
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
    const exists = (key) => !!tex?.exists?.(key);
    const cradle = slingRowKey(exists) || (exists(SLING_MOUNT_ALT_KEY) ? SLING_MOUNT_ALT_KEY : null);
    if (cradle && scene.add?.sprite) {
      const mount = scene.add.sprite(slot.x, slot.feetY, cradle);
      this._applyOrigin(mount, cradle);
      mount.setScale(slot.scale);
      mount.setDepth(depth);
      playLibraryAnim(mount, cradle, scene);
      let gun = null;
      if (tex?.exists?.(SLING_MOUNT_GUN_KEY)) {
        gun = scene.add.sprite(slot.gunX, slot.gunY, SLING_MOUNT_GUN_KEY);
        gun.setOrigin(0.5, 0.5);
        gun.setScale(slot.scale * 0.5);
        gun.setDepth(depth + 1);
      }
      return { mount, gun };
    }
    if (tex?.exists?.(SLING_MOUNT_GUN_KEY) && scene.add?.sprite) {
      const mount = scene.add.sprite(slot.gunX, slot.gunY, SLING_MOUNT_GUN_KEY);
      mount.setOrigin(0.5, 0.5);
      mount.setScale(scaleFromY(slot.y) * 0.72);
      mount.setDepth(depth);
      return { mount, gun: null };
    }
    const w = layoutPx(18);
    const h = layoutPx(8);
    const rect = scene.add.rectangle(slot.gunX, slot.gunY, w, h, 0x37474f);
    rect.setStrokeStyle?.(Math.max(1, layoutPx(1)), 0x263238);
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
