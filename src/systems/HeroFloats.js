import { depthFromY } from './DepthView.js';
import { playLibraryAnim } from '../assets/libraryAssets.js';
import {
  WEAPON_TRAITS,
  MUZZLE_WEST_FRAC,
  deployOffset,
  frontArcFor,
  frontKey,
} from '../assets/heroDeploy.js';

/** Front-float frame. Muzzle sits 0.35 of this width west of center. */
const FRONT_FRAME = 56;

/**
 * Guns drawn in front of the unarmed girl.
 * Water lock draws only the water gun, already settled, and leaves it there.
 * No cradle, rack, or other weapon is attached to that float.
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
    /**
     * true: a lone water or sling demo draws that gun on the fence.
     * 'all': the composite row owns every gun, so the arc stays empty.
     * @type {boolean|'all'}
     */
    this._fenceMounts = false;
    /** Stage draws only the highlighted gun, at the one-gun front slot. */
    this._solo = false;
    /** One water gun, always visible. Other guns and the cradle stay off. */
    this._waterLock = false;
  }

  /**
   * @param {boolean|'all'} on
   */
  setFenceMounts(on) {
    this._fenceMounts = on === 'all' ? 'all' : !!on;
  }

  /**
   * One gun in front of the girl. The others stay hidden.
   * @param {boolean} on
   */
  setSolo(on) {
    this._solo = !!on;
  }

  /**
   * Only the water float. Move, hold, and the gap between shots leave it out.
   * @param {boolean} on
   */
  setWaterLock(on) {
    this._waterLock = !!on;
  }

  /**
   * @param {string[]} ids shop order
   */
  setWeapons(ids) {
    this.destroy();
    this.missing = [];
    const raw = Array.isArray(ids) ? ids : [];
    const list = this._waterLock ? raw.filter((id) => id === 'water') : raw;
    for (const id of list) {
      const key = frontKey(id);
      const sprite = this._makeSprite(key, WEAPON_TRAITS[id]?.tint || 0xffffff);
      if (!sprite) continue;
      sprite.setVisible(!!this._waterLock);
      sprite.setAlpha(this._waterLock ? 1 : 0);
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
    const loneId = this._guns.length === 1 ? this._guns[0].id : null;
    const loneFence =
      this._fenceMounts === true && (loneId === 'water' || loneId === 'sling');
    const hidden = this._waterLock
      ? false
      : this._fenceMounts === 'all' || loneFence || phase === 'move' || phase === 'hold';
    const scale = Math.abs(girl.scaleX || 1) || 1;
    const shown = this._guns.filter((gun) => {
      if (this._waterLock) return gun.id === 'water';
      return !this._solo || !this._selected || gun.id === this._selected;
    });
    const arc = frontArcFor(shown.length);
    const settled = this._waterLock || phase === 'fire';
    const t = settled ? 1 : phase === 'deploy' ? deploy.t || 0 : 0;
    const depth = (girl.depth ?? depthFromY(girl.y)) + 2;

    for (let i = 0; i < this._guns.length; i++) {
      const gun = this._guns[i];
      const sprite = gun.sprite;
      if (!sprite?.active) continue;
      const shownAt = shown.indexOf(gun);
      if (hidden || shownAt < 0) {
        sprite.setVisible(false);
        sprite.setAlpha(0);
        continue;
      }
      // PIXELLAB_HOOK: lone water float Y is WATER_FLOAT_EYE_Y (eye height).
      const off = settled ? { ...arc[shownAt], alpha: 1 } : deployOffset(shownAt, shown.length, t);
      const selected = this._waterLock || !this._selected || gun.id === this._selected;
      sprite.setVisible(true);
      sprite.setAlpha(phase === 'fire' && !selected ? off.alpha * 0.92 : off.alpha);
      sprite.setScale(scale);
      sprite.setPosition(girl.x + off.x * scale, girl.y + off.y * scale);
      sprite.setDepth(depth + i);
      this._syncBob(gun, phase === 'fire' ? 'fire' : 'float');
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
        x: sprite.x - FRONT_FRAME * scale * MUZZLE_WEST_FRAC,
        y: sprite.y,
      });
    }
    return out;
  }

  /**
   * Water lock still has a muzzle when the sprite is hidden for a frame,
   * so W/S cannot drop the charge slot. A visible gun uses its sprite.
   * @param {string} id
   * @param {{ x?: number, y?: number, scaleX?: number }|null|undefined} girl
   * @returns {{ id: string, x: number, y: number }|null}
   */
  muzzleOf(id, girl) {
    const found = this.muzzles().find((muzzle) => muzzle.id === id);
    if (found) return found;
    if (!this._waterLock || id !== 'water' || !girl) return null;
    if (!Number.isFinite(girl.x) || !Number.isFinite(girl.y)) return null;
    const scale = Math.abs(girl.scaleX || 1) || 1;
    const off = frontArcFor(1)[0] || { x: -36, y: -8 };
    const gunX = girl.x + off.x * scale;
    const gunY = girl.y + off.y * scale;
    return {
      id: 'water',
      x: gunX - FRONT_FRAME * scale * MUZZLE_WEST_FRAC,
      y: gunY,
    };
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
    const still = `${gun.key}-still`;
    if (phase === 'fire' && anims?.exists?.(gun.key)) {
      if (sprite.texture?.key !== gun.key && typeof sprite.setTexture === 'function') {
        sprite.setTexture(gun.key, 0);
      }
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
    if (this.scene.textures?.exists?.(still) && typeof sprite.setTexture === 'function') {
      if (sprite.texture?.key !== still) sprite.setTexture(still);
      return;
    }
    if (typeof sprite.setFrame === 'function' && this.scene.textures?.exists?.(gun.key)) {
      sprite.setFrame(0);
    }
  }
}
