/**
 * Sling fence mounts (v0.32).
 *
 * Six slots share the water fence geometry (scale, lift, alignment).
 * They are fire-point anchors only: contactXAt, gold, and saves do not
 * read this module. Sling fires from a slot only while the hero is
 * stopped behind it, toward the nearest living enemy.
 *
 * Row order: prop-sling-mount-hi-vis, prop-sling-mount, then
 * prop-water-mount-hi-vis. The slot she is stopped behind uses
 * prop-sling-mount-front-alt when that sheet is loaded. These names
 * are the catalog keys; this module does not ship the PNGs.
 */

import {
  WATER_MOUNT_ALIGN_FIELD,
  WATER_MOUNT_COUNT,
  WATER_MOUNT_HI_VIS_KEY,
  buildWaterMountSlots,
  nearestWaterMount,
  resolveLibraryKey,
  waterAimVelocity,
} from './waterMounts.js';

export const SLING_MOUNT_COUNT = WATER_MOUNT_COUNT;
export const SLING_MOUNT_ALIGN_FIELD = WATER_MOUNT_ALIGN_FIELD;

/** Primary cradle. PIXELLAB_HOOK: prop-sling-mount-hi-vis */
export const SLING_MOUNT_HI_VIS_KEY = 'prop-sling-mount-hi-vis';
/** Same silhouette, less contrast. PIXELLAB_HOOK: prop-sling-mount */
export const SLING_MOUNT_KEY = 'prop-sling-mount';
/** Dual-post cradle for the slot she is stopped behind. */
export const SLING_MOUNT_ALT_KEY = 'prop-sling-mount-front-alt';
/** Drawable when neither sling cradle is loaded. */
export const SLING_MOUNT_FALLBACK_KEY = WATER_MOUNT_HI_VIS_KEY;
export const SLING_MOUNT_KEYS = [SLING_MOUNT_HI_VIS_KEY, SLING_MOUNT_KEY, SLING_MOUNT_FALLBACK_KEY];

/** Seated in the cradle. Not a substitute for the mount post. */
export const SLING_MOUNT_GUN_KEY = 'player-girl-front-sling-still';

/** `fx-sling-impact` is 6 frames at 14 fps, played once. */
export const SLING_IMPACT_FRAMES = 6;
export const SLING_IMPACT_FPS = 14;
/** `fx-sling-pellet` is the traveling shot and the impact fallback. */
export const SLING_PELLET_FRAMES = 4;
export const SLING_PELLET_FPS = 14;
/** HP and knockback land at the middle of the impact sheet. */
export const SLING_IMPACT_BEAT = 0.5;

/** Preferred burst, then the pellet sheet. */
export const SLING_IMPACT_KEYS = ['fx-sling-impact', 'fx-sling-pellet'];

/**
 * @param {number} [durationMs] full impact length. Defaults to fx-sling-impact.
 * @returns {number}
 */
export function slingImpactBeatMs(durationMs) {
  const authored = (SLING_IMPACT_FRAMES / SLING_IMPACT_FPS) * 1000;
  const full = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : authored;
  return full * SLING_IMPACT_BEAT;
}

/**
 * Frame count used when the library index is not cached.
 * @param {string} key
 * @returns {{ frames: number, frameRate: number }}
 */
export function slingSheetFallback(key) {
  if (key === 'fx-sling-pellet') return { frames: SLING_PELLET_FRAMES, frameRate: SLING_PELLET_FPS };
  return { frames: SLING_IMPACT_FRAMES, frameRate: SLING_IMPACT_FPS };
}

/**
 * First key whose texture is loaded, else the preferred name.
 * @param {(key: string) => boolean} [exists]
 */
export function slingImpactKey(exists) {
  return resolveLibraryKey(exists, SLING_IMPACT_KEYS);
}

/**
 * First loaded mount texture, or null when none of the chain is present.
 * @param {(key: string) => boolean} [exists]
 * @returns {string|null}
 */
export function slingMountKey(exists) {
  for (const key of SLING_MOUNT_KEYS) {
    if (typeof exists === 'function' && exists(key)) return key;
  }
  return null;
}

/**
 * Idle row. Hi-vis first, then the plain sling cradle, then water hi-vis.
 * @param {(key: string) => boolean} [exists]
 * @returns {string|null}
 */
export function slingRowKey(exists) {
  return slingMountKey(exists);
}

/**
 * Active slot. Front alt when it is loaded, otherwise the row key.
 * @param {(key: string) => boolean} [exists]
 * @returns {string|null}
 */
export function slingActiveKey(exists) {
  if (typeof exists === 'function' && exists(SLING_MOUNT_ALT_KEY)) return SLING_MOUNT_ALT_KEY;
  return slingRowKey(exists);
}

/**
 * @param {(y: number) => { x: number, groundY: number, postH: number }} anchorAt
 * @param {number} [yMin]
 * @param {number} [yMax]
 */
export function buildSlingMountSlots(anchorAt, yMin, yMax) {
  return buildWaterMountSlots(anchorAt, yMin, yMax);
}

/**
 * @param {number} y
 * @param {{ y: number }[]} slots
 * @param {number} alignPx
 */
export function nearestSlingMount(y, slots, alignPx) {
  return nearestWaterMount(y, slots, alignPx);
}

/**
 * West shot toward a body. An east target falls back to straight west.
 * @param {number} fromX
 * @param {number} fromY
 * @param {{ x: number, y: number }|null|undefined} target
 * @param {number} speed
 */
export function slingAimVelocity(fromX, fromY, target, speed) {
  return waterAimVelocity(fromX, fromY, target, speed);
}
