import { GAME_CONFIG } from '../data/GameConfig.js';
import { GAME_WIDTH } from '../data/waves.js';
import { HUD_DEPTH, LAYOUT_SCALE, layoutPx } from '../systems/DepthView.js';

/** Texture size of `ui-pet-*-bar`. Origin is the left edge, vertical center. */
const BAR_TEX_W = 64;
const BAR_TEX_H = 32;
/** Texture size of `ui-pet-orb-*`. Origin is the center. */
const ORB_TEX = 16;

/**
 * Top-right column of four pet bars. Each bar is the 64×32 library image
 * (`ui-pet-*-bar`), which already composites the head on the left.
 * Three 16×16 orbs sit to the right of the bar. A code-drawn arc on top of
 * each unlocked orb is the cooldown ring. Locked orbs stay on the dark frame.
 * Tap the bar to summon or recall. Revive greys the bar and ignores taps.
 */
export class PetPortraitHud {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ views: () => BarView[], onSummon: (index: number) => { reason?: string }|void }} opts
   */
  constructor(scene, opts) {
    this.scene = scene;
    this._views = opts.views;
    this._onSummon = opts.onSummon;
    this._pulse = 0;
    /** @type {BarSlot[]} */
    this._slots = [];
    this._build();
  }

  /**
   * @param {number} deltaMs
   */
  update(deltaMs) {
    const dt = Number.isFinite(deltaMs) ? deltaMs : 0;
    this._pulse += dt;
    const views = this._views?.() || [];
    for (let i = 0; i < this._slots.length; i++) {
      const slot = this._slots[i];
      if (slot.hitLeft > 0) slot.hitLeft = Math.max(0, slot.hitLeft - dt);
      this._sync(slot, views[i]);
    }
  }

  destroy() {
    for (const slot of this._slots) {
      slot.hit?.destroy?.();
      slot.root?.destroy?.();
    }
    this._slots = [];
  }

  _build() {
    const views = this._views?.() || [];
    const scene = this.scene;
    const barW = Math.round(BAR_TEX_W * LAYOUT_SCALE);
    const barH = Math.round(BAR_TEX_H * LAYOUT_SCALE);
    const orb = Math.round(ORB_TEX * LAYOUT_SCALE);
    const orbGap = layoutPx(2);
    const clusterGap = layoutPx(3);
    const rowGap = layoutPx(4);
    const pad = layoutPx(8);
    const orbsW = orb * 3 + orbGap * 2;
    const barLeft = GAME_WIDTH - pad - (barW + clusterGap + orbsW);
    const y0 = layoutPx(44) + barH / 2;
    const depth = HUD_DEPTH + 16;
    for (let i = 0; i < views.length; i++) {
      const view = views[i];
      const y = y0 + i * (barH + rowGap);
      const root = scene.add.container(barLeft, y).setScrollFactor(0).setDepth(depth);
      const bar = this._bar(view, barW, barH);
      const hp = this._hpTrack(view, LAYOUT_SCALE);
      const orbs = [0, 1, 2].map((index) => {
        const ox = barW + clusterGap + orb / 2 + index * (orb + orbGap);
        return this._orb(view, index, ox);
      });
      const ring = scene.add.graphics();
      root.add([bar, hp.bg, hp.fg, ...orbs.map((orbSlot) => orbSlot.image), ring]);
      const hit = scene.add
        .rectangle(barLeft + barW / 2, y, barW, barH, 0xffffff, 0.001)
        .setScrollFactor(0)
        .setDepth(depth + 2)
        .setName(`pet-bar-${view.id}`)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => this._tap(i));
      this._slots.push({
        id: view.id,
        x: barLeft,
        y,
        barW,
        barH,
        orb,
        root,
        hit,
        bar,
        hp,
        orbs,
        ring,
        color: view.color,
        hitSeq: 0,
        hitLeft: 0,
      });
    }
  }

  /**
   * @param {BarView} view
   * @param {number} barW
   * @param {number} barH
   */
  _bar(view, barW, barH) {
    const scene = this.scene;
    const key = view.barKey;
    if (key && scene.textures?.exists?.(key) && scene.add?.image) {
      const img = scene.add.image(0, 0, key);
      img.setOrigin(0, 0.5);
      img.setScale(LAYOUT_SCALE);
      return img;
    }
    const fallback = scene.add.rectangle(0, 0, barW, barH, 0x102028, 0.94);
    fallback.setOrigin(0, 0.5);
    fallback.setStrokeStyle?.(layoutPx(2), view.color, 1);
    return fallback;
  }

  /**
   * HP sits on the open right side of the 64×32 bar (head occupies the left).
   * @param {BarView} view
   * @param {number} scale
   */
  _hpTrack(view, scale) {
    const x = 30 * scale;
    const w = 30 * scale;
    const h = Math.max(4, Math.round(6 * scale));
    const bg = this.scene.add.rectangle(x, 0, w, h, 0x14080a, 0.92).setOrigin(0, 0.5);
    const fg = this.scene.add.rectangle(x, 0, w, h, view.color, 1).setOrigin(0, 0.5);
    return { bg, fg, width: w };
  }

  /**
   * @param {BarView} view
   * @param {number} index
   * @param {number} x local, center of the orb
   */
  _orb(view, index, x) {
    const scene = this.scene;
    const spec = view.orbs?.[index];
    const key = spec?.dark;
    const size = layoutPx(ORB_TEX);
    /** @type {Phaser.GameObjects.Image|Phaser.GameObjects.Arc} */
    let image;
    if (key && scene.textures?.exists?.(key) && scene.add?.image) {
      image = scene.add.image(x, 0, key);
      image.setOrigin(0.5, 0.5);
      image.setScale(LAYOUT_SCALE);
    } else {
      image = scene.add.circle(x, 0, size / 2, view.color, 0.35);
    }
    return { image, x };
  }

  /** @param {number} index */
  _tap(index) {
    const views = this._views?.() || [];
    const view = views[index];
    const slot = this._slots[index];
    if (!view?.tappable || !slot) return;
    this._punch(slot.root);
    this._onSummon?.(index);
  }

  /** @param {Phaser.GameObjects.Container} root */
  _punch(root) {
    if (!root?.setScale) return;
    root.setScale(1);
    const tween = this.scene.tweens?.add?.({
      targets: root,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 80,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => root.setScale(1),
    });
    if (!tween) root.setScale(1);
  }

  /**
   * @param {BarSlot} slot
   * @param {BarView|undefined} view
   */
  _sync(slot, view) {
    if (!view) return;
    const tappable = !!view.tappable;
    const enabled = !!slot.hit.input?.enabled;
    if (tappable && !enabled) slot.hit.setInteractive({ useHandCursor: true });
    else if (!tappable && enabled) slot.hit.disableInteractive();
    const ratio = Number.isFinite(view.hp) ? Math.max(0, Math.min(1, view.hp)) : 0;
    const seq = view.hitSeq || 0;
    if (seq !== slot.hitSeq) {
      slot.hitSeq = seq;
      if (seq > 0) slot.hitLeft = GAME_CONFIG.PETS.HURT_BAR_MS;
    }
    const flashing = slot.hitLeft > 0 && !view.grey;
    const low = !!view.lowHp && !view.grey && !flashing && ratio > 0;
    const lowWave = low ? 0.5 + 0.5 * Math.sin(this._pulse / 90) : 0;
    slot.hp.fg.setScale(Math.max(ratio, 0.001), flashing ? 1.45 : 1 + lowWave * 0.55);
    slot.hp.fg.setVisible?.(ratio > 0.01);
    if (view.grey) slot.bar.setTint?.(0x8d8d8d);
    else if (flashing) slot.bar.setTint?.(0xff8a80);
    else if (low) slot.bar.setTint?.(lowWave > 0.5 ? 0xffab91 : 0xffcc80);
    else slot.bar.clearTint?.();
    slot.bar.setAlpha?.(low ? 0.72 + lowWave * 0.28 : 1);
    const fill = view.grey ? 0x9e9e9e : flashing ? 0xfff6e8 : view.color;
    slot.hp.fg.setFillStyle?.(fill);
    const blinkOn = Math.floor(this._pulse / 120) % 2 === 0;
    slot.ring.clear();
    const orbs = view.orbs || [];
    for (let i = 0; i < slot.orbs.length; i++) {
      const orbView = orbs[i];
      const orb = slot.orbs[i];
      if (!orbView || !orb) continue;
      const locked = !orbView.unlocked;
      const flashing = orbView.state === 'flash';
      const key = locked ? orbView.dark : flashing ? (blinkOn ? orbView.flash : orbView.lit) : orbView.dark;
      if (key && typeof orb.image.setTexture === 'function' && this.scene.textures?.exists?.(key)) {
        if (orb.image.texture?.key !== key) orb.image.setTexture(key);
      }
      orb.image.setAlpha?.(locked ? 0.45 : 1);
      if (locked) {
        this._lockMark(slot.ring, orb.x);
        continue;
      }
      const ringRatio = Number.isFinite(orbView.ratio) ? orbView.ratio : 0;
      if (ringRatio <= 0.02) continue;
      this._cdRing(slot.ring, orb.x, Math.min(0.999, ringRatio), view.color);
    }
    this._syncEvolve(slot, view);
  }

  /**
   * Tier stars and a thin EXP fill. Missing art leaves the bar unchanged.
   * PIXELLAB_HOOK: vfx-evolve-stars-1|2|3
   * @param {BarSlot} slot
   * @param {BarView} view
   */
  _syncEvolve(slot, view) {
    const scene = this.scene;
    const tier = Math.max(1, Math.min(3, Math.floor(view.tier) || 1));
    const key = `vfx-evolve-stars-${tier}`;
    if (slot.stars && slot.starsKey !== key && scene.textures?.exists?.(key) && slot.stars.setTexture) {
      slot.stars.setTexture(key);
      slot.starsKey = key;
    } else if (!slot.stars && scene.textures?.exists?.(key)) {
      const make = scene.add?.image || scene.add?.sprite;
      const node = make?.call(scene.add, 18 * LAYOUT_SCALE, -slot.barH / 2, key);
      if (node) {
        node.setOrigin?.(0.5, 1);
        node.setScrollFactor?.(0);
        slot.root?.add?.(node);
        slot.stars = node;
        slot.starsKey = key;
      }
    }
    if (!slot.exp && scene.add?.rectangle) {
      const w = 28 * LAYOUT_SCALE;
      const h = Math.max(2, layoutPx(2));
      const x = 30 * LAYOUT_SCALE;
      const y = slot.barH / 2 - h;
      const bg = scene.add.rectangle(x, y, w, h, 0x1a1208, 0.9).setOrigin(0, 0.5);
      const fg = scene.add.rectangle(x, y, w, h, 0xffd54f, 1).setOrigin(0, 0.5);
      slot.root?.add?.([bg, fg]);
      slot.exp = { bg, fg, width: w };
    }
    if (slot.exp?.fg?.setScale) {
      const ratio = Number.isFinite(view.expRatio) ? Math.max(0, Math.min(1, view.expRatio)) : 0;
      slot.exp.fg.setScale(Math.max(ratio, 0.001), 1);
      slot.exp.fg.setVisible?.(ratio > 0.02);
    }
  }

  /**
   * Clockwise arc from 12 o'clock. `ratio` 0 is empty, 1 is a full ring.
   * @param {Phaser.GameObjects.Graphics} ring
   * @param {number} x
   * @param {number} ratio
   * @param {number} color
   */
  _cdRing(ring, x, ratio, color) {
    const radius = layoutPx(ORB_TEX) / 2 + layoutPx(1);
    ring.lineStyle(Math.max(2, layoutPx(2)), color, 0.95);
    ring.beginPath();
    ring.arc(x, 0, radius, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2, false);
    ring.strokePath();
  }

  /**
   * @param {Phaser.GameObjects.Graphics} ring
   * @param {number} x
   */
  _lockMark(ring, x) {
    const arm = layoutPx(3);
    ring.lineStyle(Math.max(1, layoutPx(1)), 0x1a120c, 0.9);
    ring.beginPath();
    ring.moveTo(x - arm, -arm);
    ring.lineTo(x + arm, arm);
    ring.moveTo(x + arm, -arm);
    ring.lineTo(x - arm, arm);
    ring.strokePath();
  }
}

/**
 * @typedef {object} OrbView
 * @property {number} index
 * @property {boolean} unlocked
 * @property {'locked'|'cd'|'flash'} state
 * @property {number} ratio
 * @property {string} dark
 * @property {string} lit
 * @property {string} flash
 */

/**
 * @typedef {object} BarView
 * @property {string} id
 * @property {string} [element]
 * @property {string} [elementZh]
 * @property {number} color
 * @property {'ready'|'field'|'revive'} phase
 * @property {boolean} tappable
 * @property {boolean} grey
 * @property {number} hp
 * @property {number} [hitSeq]
 * @property {string} barKey
 * @property {string} headKey
 * @property {OrbView[]} orbs
 */

/**
 * @typedef {object} BarSlot
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} barW
 * @property {number} barH
 * @property {number} orb
 * @property {Phaser.GameObjects.Container} root
 * @property {Phaser.GameObjects.Rectangle} hit
 * @property {Phaser.GameObjects.GameObject} bar
 * @property {{ bg: Phaser.GameObjects.Rectangle, fg: Phaser.GameObjects.Rectangle, width: number }} hp
 * @property {{ image: Phaser.GameObjects.GameObject, x: number }[]} orbs
 * @property {Phaser.GameObjects.Graphics} ring
 * @property {number} color
 * @property {number} hitSeq
 * @property {number} hitLeft
 */
