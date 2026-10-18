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
    /**
     * true: a lone water or sling demo draws that gun on the fence.
     * 'all': the composite row owns every gun, so the arc stays empty.
     * @type {boolean|'all'}
     */
    this._fenceMounts = false;
    /** Stage draws only the highlighted gun, at the one-gun front slot. */
    this._solo = false;
    /** @type {Phaser.GameObjects.Sprite|null} */
    this._cradle = null;
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
    const loneId = this._guns.length === 1 ? this._guns[0].id : null;
    const loneFence =
      this._fenceMounts === true && (loneId === 'water' || loneId === 'sling');
    const hidden = this._fenceMounts === 'all' || loneFence || phase === 'move' || phase === 'hold';
    const scale = Math.abs(girl.scaleX || 1) || 1;
    const shown = this._guns.filter(
      (gun) => !this._solo || !this._selected || gun.id === this._selected
    );
    const arc = frontArcFor(shown.length);
    const t = phase === 'fire' ? 1 : phase === 'deploy' ? deploy.t || 0 : 0;
    const depth = (girl.depth ?? depthFromY(girl.y)) + 2;
    let cradleGun = null;

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
      const off =
        phase === 'fire' ? { ...arc[shownAt], alpha: 1 } : deployOffset(shownAt, shown.length, t);
      const selected = !this._selected || gun.id === this._selected;
      sprite.setVisible(true);
      sprite.setAlpha(phase === 'fire' && !selected ? off.alpha * 0.92 : off.alpha);
      sprite.setScale(scale);
      sprite.setPosition(girl.x + off.x * scale, girl.y + off.y * scale);
      sprite.setDepth(depth + i);
      this._syncBob(gun, phase);
      if (gun.id === 'water') cradleGun = gun;
    }
    this._syncCradle(cradleGun, scale, depth);
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
    try {
      this._cradle?.destroy();
    } catch (_) {
      /* already destroyed */
    }
    this._cradle = null;
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

  /**
   * Optional steel cradle behind the water float. Feet origin, so the
   * cradle pixel sits on the gun center.
   * @param {{ id: string, sprite: Phaser.GameObjects.Sprite }|null} gun
   * @param {number} scale
   * @param {number} depth
   */
  _syncCradle(gun, scale, depth) {
    const scene = this.scene;
    if (!this._cradle && scene?.textures?.exists?.('prop-water-mount-front-alt') && scene.add?.sprite) {
      this._cradle = scene.add.sprite(0, 0, 'prop-water-mount-front-alt');
      this._cradle.setOrigin(0.5, 0.9375);
      this._cradle.setVisible(false);
    }
    const cradle = this._cradle;
    if (!cradle?.active) return;
    const sprite = gun?.sprite;
    if (!sprite?.visible || gun.id !== 'water') {
      cradle.setVisible(false);
      return;
    }
    cradle.setVisible(true);
    cradle.setAlpha(sprite.alpha);
    cradle.setScale(scale);
    cradle.setPosition(sprite.x, sprite.y + 48 * scale);
    cradle.setDepth(Math.max(0, depth - 1));
  }
}
