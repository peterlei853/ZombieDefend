import { depthFromY } from './DepthView.js';
import { playLibraryAnim } from '../assets/libraryAssets.js';
import {
  WEAPON_TRAITS,
  deployOffset,
  frontArcFor,
  frontKey,
} from '../assets/heroDeploy.js';

/** Front-float frame. Muzzle sits 0.35 of this width west of center. */
const FRONT_FRAME = 56;

/**
 * Owned guns drawn in front of the unarmed girl.
 * MOVE / hold: hidden. DEPLOY: lerp into the arc. FIRE: bob strips.
 */
export class HeroFloats {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    /** @type {{ id: string, sprite: Phaser.GameObjects.Sprite|Phaser.GameObjects.Rectangle, key: string }[]} */
    this._guns = [];
    /** @type {string|null} */
    this._selected = null;
    /** @type {string[]} */
    this.missing = [];
    /** Water-only demo draws the guns on the fence, not in the front arc. */
    this._fenceMounts = false;
  }

  /**
   * @param {boolean} on
   */
  setFenceMounts(on) {
    this._fenceMounts = !!on;
  }

  /**
   * @param {string[]} ids shop order
   */
  setWeapons(ids) {
    this.destroy();
    this.missing = [];
    const list = Array.isArray(ids) ? ids : [];
    for (const id of list) {
      const key = frontKey(id);
      const sprite = this._makeSprite(key, WEAPON_TRAITS[id]?.tint || 0xffffff);
      if (!sprite) continue;
      sprite.setVisible(false);
      sprite.setAlpha(0);
      this._guns.push({ id, sprite, key });
    }
  }

  /** @param {string|null|undefined} id */
  setSelected(id) {
    this._selected = id || null;
  }

  /**
   * @param {Phaser.GameObjects.Sprite|Phaser.GameObjects.Rectangle} girl
   * @param {{ phase: string, t: number }} deploy
   */
  sync(girl, deploy) {
    if (!girl?.active || !this._guns.length) return;
    const phase = deploy?.phase || 'move';
    const loneWater =
      this._fenceMounts && this._guns.length === 1 && this._guns[0].id === 'water';
    const hidden = loneWater || phase === 'move' || phase === 'hold';
    const scale = Math.abs(girl.scaleX || 1) || 1;
    const arc = frontArcFor(this._guns.length);
    const t = phase === 'fire' ? 1 : phase === 'deploy' ? deploy.t || 0 : 0;
    const depth = (girl.depth ?? depthFromY(girl.y)) + 2;

    for (let i = 0; i < this._guns.length; i++) {
      const gun = this._guns[i];
      const sprite = gun.sprite;
      if (!sprite?.active) continue;
      if (hidden) {
        sprite.setVisible(false);
        sprite.setAlpha(0);
        continue;
      }
      const off = phase === 'fire' ? { ...arc[i], alpha: 1 } : deployOffset(i, this._guns.length, t);
      const selected = !this._selected || gun.id === this._selected;
      sprite.setVisible(true);
      sprite.setAlpha(phase === 'fire' && !selected ? off.alpha * 0.92 : off.alpha);
      sprite.setScale(scale);
      sprite.setPosition(girl.x + off.x * scale, girl.y + off.y * scale);
      sprite.setDepth(depth + i);
      this._syncBob(gun, phase);
    }
  }

  /**
   * Muzzle of each visible gun, west of the float center.
   * @returns {{ id: string, x: number, y: number }[]}
   */
  muzzles() {
    /** @type {{ id: string, x: number, y: number }[]} */
    const out = [];
    for (const gun of this._guns) {
      const sprite = gun.sprite;
      if (!sprite?.active || !sprite.visible || sprite.alpha <= 0.05) continue;
      const scale = Math.abs(sprite.scaleX || 1);
      out.push({
        id: gun.id,
        x: sprite.x - FRONT_FRAME * scale * 0.35,
        y: sprite.y,
      });
    }
    return out;
  }

  destroy() {
    for (const gun of this._guns) {
      try {
        gun.sprite?.destroy();
      } catch (_) {
        /* already destroyed */
      }
    }
    this._guns = [];
  }

  /**
   * @param {string} key
   * @param {number} tint
   */
  _makeSprite(key, tint) {
    const scene = this.scene;
    if (scene.textures?.exists?.(key)) {
      const sprite = scene.add.sprite(0, 0, key, 0);
      sprite.setOrigin(0.5, 0.5);
      return sprite;
    }
    this.missing.push(key);
    if (!scene.add?.rectangle) return null;
    const rect = scene.add.rectangle(0, 0, 22, 10, tint);
    rect.setOrigin(0.5, 0.5);
    return rect;
  }

  /**
   * @param {{ key: string, sprite: Phaser.GameObjects.Sprite }} gun
   * @param {string} phase
   */
  _syncBob(gun, phase) {
    const sprite = gun.sprite;
    if (typeof sprite.play !== 'function') return;
    const anims = this.scene?.anims;
    if (phase === 'fire' && anims?.exists?.(gun.key)) {
      const current = sprite.anims?.currentAnim?.key;
      if (current !== gun.key || !sprite.anims?.isPlaying) {
        playLibraryAnim(sprite, gun.key, this.scene);
      }
      return;
    }
    try {
      sprite.anims?.stop?.();
    } catch (_) {
      /* rectangle */
    }
    if (typeof sprite.setFrame === 'function' && this.scene.textures?.exists?.(gun.key)) {
      sprite.setFrame(0);
    }
  }
}
