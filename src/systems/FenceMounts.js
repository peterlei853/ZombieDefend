import { depthFromY, layoutPx, scaleFromY } from './DepthView.js';
import { libraryAsset, playLibraryAnim } from '../assets/libraryAssets.js';
import { WEAPON_TRAITS } from '../assets/heroDeploy.js';
import {
  FENCE_MOUNT_ALIGN_FIELD,
  FENCE_MOUNT_ORIGIN,
  buildFenceMountSlots,
  fenceActiveKey,
  fenceFloatKey,
  fenceRowKey,
  nearestFenceMount,
} from '../assets/fenceMounts.js';

/**
 * Six fence cradles, one weapon each, top to bottom.
 * Visual + muzzle anchors. Barricade HP, contactXAt, gold, and saves
 * are not modified. The gun still floats in the cradle; it is not
 * baked into the cradle sheet.
 */
export class FenceMounts {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ postAnchorAt: (y: number) => { x: number, groundY: number, postH: number } }} barricade
   */
  constructor(scene, barricade) {
    this.scene = scene;
    this.slots = buildFenceMountSlots((y) => barricade.postAnchorAt(y));
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
    return nearestFenceMount(heroY, this.slots, layoutPx(FENCE_MOUNT_ALIGN_FIELD));
  }

  /**
   * Closest slot, including the gaps. Used to park the opening stance.
   * @param {number} heroY
   */
  nearest(heroY) {
    return nearestFenceMount(heroY, this.slots, Infinity);
  }

  /**
   * Front alt on the active slot when that weapon has one.
   * The other five stay their row cradle.
   * @param {number} index -1 clears the highlight
   */
  setActive(index) {
    const exists = (key) => !!this.scene?.textures?.exists?.(key);
    for (let i = 0; i < this.sprites.length; i++) {
      const sprite = this.sprites[i];
      const id = this.slots[i]?.weaponId;
      if (!sprite || !id || typeof sprite.setTexture !== 'function') continue;
      const row = fenceRowKey(id, exists);
      if (!row) continue;
      const alt = i === index ? fenceActiveKey(id, exists) : null;
      const want = alt || row;
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
   * @param {{ weaponId: string, x: number, feetY: number, scale: number, gunX: number, gunY: number, y: number }} slot
   * @returns {{ mount: Phaser.GameObjects.GameObject, gun: Phaser.GameObjects.GameObject|null }}
   */
  _make(scene, slot) {
    const tex = scene.textures;
    const depth = depthFromY(slot.y, 8);
    const exists = (key) => !!tex?.exists?.(key);
    const cradle = fenceRowKey(slot.weaponId, exists);
    const alt = fenceActiveKey(slot.weaponId, exists);
    const floatKey = fenceFloatKey(slot.weaponId, exists);
    const cradleKey = cradle || alt;
    if (cradleKey && scene.add?.sprite) {
      const mount = scene.add.sprite(slot.x, slot.feetY, cradleKey);
      this._applyOrigin(mount, cradleKey);
      mount.setScale(slot.scale);
      mount.setDepth(depth);
      playLibraryAnim(mount, cradleKey, scene);
      let gun = null;
      if (floatKey) {
        gun = scene.add.sprite(slot.gunX, slot.gunY, floatKey);
        gun.setOrigin(0.5, 0.5);
        gun.setScale(slot.scale * 0.5);
        gun.setDepth(depth + 1);
      }
      return { mount, gun };
    }
    if (floatKey && scene.add?.sprite) {
      const mount = scene.add.sprite(slot.gunX, slot.gunY, floatKey);
      mount.setOrigin(0.5, 0.5);
      mount.setScale(scaleFromY(slot.y) * 0.72);
      mount.setDepth(depth);
      return { mount, gun: null };
    }
    const tint = WEAPON_TRAITS[slot.weaponId]?.tint || 0xffffff;
    const w = layoutPx(22);
    const h = layoutPx(10);
    const rect = scene.add.rectangle(slot.gunX, slot.gunY, w, h, tint);
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
    const origin = asset?.origin || FENCE_MOUNT_ORIGIN;
    sprite.setOrigin?.(origin[0], origin[1]);
  }
}
