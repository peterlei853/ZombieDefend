import { HUD_DEPTH } from './DepthView.js';
import { libraryAsset } from '../assets/libraryAssets.js';

/** Inside the 0.8–1.2s letterbox window. */
export const ULT_MS = 1000;
const IMPACT_AT = 0.65;

/** PIXELLAB_HOOK: assets/library/fx/v026/ults/vfx-ult-{role}.png */
export const ULT_KEYS = Object.freeze({
  phoenix: 'vfx-ult-phoenix',
  panda: 'vfx-ult-panda',
  lion: 'vfx-ult-lion',
  dragon: 'vfx-ult-dragon',
});

/**
 * Tier-3 cutscene. Freezes combat while the overlay is up, then the
 * impact callback applies the half-screen AoE and themed skill.
 */
export class UltCutscene {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.playing = false;
    this._left = 0;
    this._elapsed = 0;
    /** @type {Phaser.GameObjects.GameObject[]} */
    this._nodes = [];
    this._impacted = false;
    /** @type {(() => void)|null} */
    this._onImpact = null;
    /** @type {((value?: unknown) => void)|null} */
    this._resolve = null;
    this._role = null;
  }

  /**
   * @param {string|{ id?: string }|null|undefined} role phoenix|panda|lion|dragon
   * @param {() => void} [onImpact] half-screen AoE, fired once before resume
   * @returns {Promise<void>}
   */
  play(role, onImpact) {
    const id = normalizeRole(role);
    if (this.playing) this._finish();
    this.playing = true;
    this._role = id;
    this._left = ULT_MS;
    this._elapsed = 0;
    this._impacted = false;
    this._onImpact = typeof onImpact === 'function' ? onImpact : null;
    this._show(id);
    this.scene?.events?.emit?.('pet:ult-start', { role: id });
    this.scene?.audio?.playUlt?.(id);
    return new Promise((resolve) => {
      this._resolve = resolve;
    });
  }

  /** @param {number} dt ms, real time (not hitlag) */
  update(dt) {
    if (!this.playing) return;
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this._elapsed += step;
    this._left -= step;
    const fade = Math.min(1, this._elapsed / 160);
    for (const node of this._nodes) {
      if (node?.active && node.setAlpha && node.getData?.('ultFade')) node.setAlpha(fade);
    }
    if (!this._impacted && this._elapsed >= ULT_MS * IMPACT_AT) {
      this._impacted = true;
      const hit = this._onImpact;
      this._onImpact = null;
      hit?.();
    }
    if (this._left <= 0) this._finish();
  }

  _finish() {
    if (!this.playing && !this._resolve) return;
    const role = this._role;
    this.playing = false;
    this._onImpact = null;
    this._clear();
    this.scene?.events?.emit?.('pet:ult-end', { role });
    const resolve = this._resolve;
    this._resolve = null;
    resolve?.();
  }

  /** @param {string|null} role */
  _show(role) {
    const scene = this.scene;
    if (!scene?.add) return;
    const cam = scene.cameras?.main;
    const width = cam?.width ?? 1280;
    const height = cam?.height ?? 720;
    // scrollFactor 0 keeps the letterbox in screen space.
    const cx = width / 2;
    const cy = height / 2;
    const band = Math.round(height * 0.12);
    const dim = addRect(scene, cx, cy, width, height, 0x07060c, 0.55);
    const top = addRect(scene, cx, band / 2, width, band, 0x05060a, 1);
    const bot = addRect(scene, cx, height - band / 2, width, band, 0x05060a, 1);
    for (const node of [dim, top, bot]) {
      if (!node) continue;
      pin(node);
      node.setDepth?.(HUD_DEPTH + 90);
      this._nodes.push(node);
    }
    const key = role ? ULT_KEYS[role] : null;
    // PIXELLAB_HOOK: vfx-ult-phoenix|panda|lion|dragon — 384×216 cinematic still
    if (key && scene.textures?.exists?.(key)) {
      const make = scene.add.image || scene.add.sprite;
      const art = make?.call(scene.add, cx, cy, key);
      if (art) {
        const origin = libraryAsset(scene, key)?.origin ?? [0.5, 0.5];
        art.setOrigin?.(origin[0], origin[1]);
        const fit = Math.min(width * 0.72 / 384, height * 0.56 / 216);
        art.setScale?.(fit);
        art.setAlpha?.(0);
        art.setData?.('ultFade', true);
        pin(art);
        art.setDepth?.(HUD_DEPTH + 92);
        this._nodes.push(art);
      }
    }
  }

  _clear() {
    for (const node of this._nodes) {
      if (node?.active !== false) node.destroy?.();
    }
    this._nodes = [];
  }
}

/** @param {string|{ id?: string }|null|undefined} role */
export function normalizeRole(role) {
  const raw = typeof role === 'string' ? role : role?.id;
  if (!raw) return null;
  const id = raw.startsWith('ult-') ? raw.slice(4) : raw;
  return ULT_KEYS[id] ? id : null;
}

/**
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} color
 * @param {number} alpha
 */
function addRect(scene, x, y, w, h, color, alpha) {
  if (!scene.add?.rectangle) return null;
  return scene.add.rectangle(x, y, w, h, color, alpha);
}

/** @param {Phaser.GameObjects.GameObject} node */
function pin(node) {
  node.setScrollFactor?.(0);
}
