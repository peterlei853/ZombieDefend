/**
 * Water-gun fence mounts (v0.31).
 *
 * Six fixed slots sit on the barricade. They are fire-point anchors only:
 * contactXAt, gold, and saves do not read this module.
 * Water fires only while the hero is stopped and aligned with a slot.
 * The shot travels west toward the nearest living enemy.
 */

import { grassYMax, grassYMin, layoutPx } from '../systems/DepthView.js';

export const WATER_MOUNT_COUNT = 6;
/**
 * Brighter steel Y-fork. The six fence slots use this when it is loaded.
 * Feet origin (0.5, 0.9375), same cradle as the fallback.
 */
export const WATER_MOUNT_HI_VIS_KEY = 'prop-water-mount-hi-vis';
/** Same silhouette with less cyan. Row texture when the hi-vis sheet is missing. */
export const WATER_MOUNT_KEY = 'prop-water-mount';
/** Front dual-post. Used for the mount the hero is stopped behind. */
export const WATER_MOUNT_ALT_KEY = 'prop-water-mount-front-alt';
/**
 * The 64px frame scaled to the full post puts the fork through the picket
 * tip and the gaps beside it. 0.85 keeps the cradle inside the stake.
 */
export const WATER_MOUNT_SCALE = 0.85;
/**
 * Source px above the post sole, applied before WATER_MOUNT_SCALE.
 * With the scale above, 4px seats the fork on the stake.
 */
export const WATER_MOUNT_LIFT = 4;
/** Seated in the cradle. Not a substitute for the mount post. */
export const WATER_MOUNT_GUN_KEY = 'player-girl-front-water-still';
/** @deprecated use WATER_MOUNT_GUN_KEY. Kept so older checks still name the still. */
export const WATER_MOUNT_FALLBACK_KEY = WATER_MOUNT_GUN_KEY;

/** Frame px. Origin y is 60/64. Cradle pixel (32, 12) is 48px above the feet. */
export const WATER_MOUNT_FRAME = 64;
export const WATER_MOUNT_CRADLE_UP = 48;
export const WATER_MOUNT_ORIGIN = [0.5, 0.9375];

/**
 * Field px. Half the fence gap is ~28, so 18 leaves a dead zone between
 * slots. Nearest-slot alone would free-fire the whole wall.
 */
export const WATER_MOUNT_ALIGN_FIELD = 18;

/** `fx-water-splash-big` is 8 frames at 12 fps, played once. Legacy impact is 6. */
export const WATER_SPLASH_FRAMES = 8;
export const WATER_SPLASH_FPS = 12;
export const WATER_IMPACT_FRAMES = 6;
export const WATER_IMPACT_FPS = 12;
/** HP drops at the middle of the splash sheet. */
export const WATER_IMPACT_BEAT = 0.5;

/** Preferred splash, then the v0.22 impact. */
export const WATER_SPLASH_KEYS = ['fx-water-splash-big', 'fx-water-impact'];
/** Preferred puddle, then the v0.22 wet sheet. */
export const WATER_WET_KEYS = ['fx-water-wet-ground', 'fx-water-wet'];

/** Gun sits this fraction of the post height above the sole. */
export const WATER_MOUNT_GUN_RISE = 0.62;
/** West of the post center, field px. The slug leaves the nozzle. */
export const WATER_MOUNT_MUZZLE_FIELD = 16;

/**
 * @param {number} [durationMs] full splash length. Defaults to fx-water-splash-big.
 * @returns {number}
 */
export function waterImpactBeatMs(durationMs) {
  const authored = (WATER_SPLASH_FRAMES / WATER_SPLASH_FPS) * 1000;
  const full = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : authored;
  return full * WATER_IMPACT_BEAT;
}

/**
 * Frame count used when the library index is not cached.
 * @param {string} key
 * @returns {{ frames: number, frameRate: number }}
 */
export function waterSheetFallback(key) {
  if (key === 'fx-water-impact') return { frames: WATER_IMPACT_FRAMES, frameRate: WATER_IMPACT_FPS };
  if (key === 'fx-water-wet' || key === 'fx-water-wet-ground') return { frames: 6, frameRate: 8 };
  return { frames: WATER_SPLASH_FRAMES, frameRate: WATER_SPLASH_FPS };
}

/**
 * First key whose texture is loaded, else the preferred name.
 * @param {(key: string) => boolean} [exists]
 * @param {string[]} keys
 */
export function resolveLibraryKey(exists, keys) {
  for (const key of keys) {
    if (typeof exists === 'function' && exists(key)) return key;
  }
  return keys[0];
}

/** @param {(key: string) => boolean} [exists] */
export function waterSplashKey(exists) {
  return resolveLibraryKey(exists, WATER_SPLASH_KEYS);
}

/** @param {(key: string) => boolean} [exists] */
export function waterWetKey(exists) {
  return resolveLibraryKey(exists, WATER_WET_KEYS);
}

/**
 * Lane Y of each mount, top to bottom, centers of six equal fence bands.
 * @param {number} [yMin]
 * @param {number} [yMax]
 * @param {number} [count]
 * @returns {number[]}
 */
export function waterMountYs(yMin = grassYMin(), yMax = grassYMax(), count = WATER_MOUNT_COUNT) {
  const n = Math.max(1, count | 0);
  const span = yMax - yMin;
  const ys = [];
  for (let i = 0; i < n; i++) {
    ys.push(yMin + span * ((i + 0.5) / n));
  }
  return ys;
}

/**
 * @param {(y: number) => { x: number, groundY: number, postH: number }} anchorAt
 * @param {number} [yMin]
 * @param {number} [yMax]
 */
export function buildWaterMountSlots(anchorAt, yMin = grassYMin(), yMax = grassYMax()) {
  const muzzle = layoutPx(WATER_MOUNT_MUZZLE_FIELD);
  return waterMountYs(yMin, yMax).map((y, index) => {
    const anchor = anchorAt(y);
    const postH = anchor.postH > 0 ? anchor.postH : WATER_MOUNT_FRAME;
    const frameScale = postH / WATER_MOUNT_FRAME;
    const scale = frameScale * WATER_MOUNT_SCALE;
    const feetY = anchor.groundY - WATER_MOUNT_LIFT * frameScale;
    const cradleY = feetY - WATER_MOUNT_CRADLE_UP * scale;
    return {
      index,
      x: anchor.x,
      y,
      feetY,
      scale,
      gunX: anchor.x,
      gunY: cradleY,
      muzzleX: anchor.x - muzzle,
      muzzleY: cradleY,
    };
  });
}

/**
 * Closest slot, or null when it is farther than `alignPx`.
 * Pass `Infinity` to always take the nearest (spawn snap).
 * @param {number} y
 * @param {{ y: number }[]} slots
 * @param {number} alignPx
 */
export function nearestWaterMount(y, slots, alignPx) {
  if (!Number.isFinite(y) || !Array.isArray(slots) || slots.length === 0) return null;
  let best = null;
  let bestD = Infinity;
  for (const slot of slots) {
    const d = Math.abs(slot.y - y);
    if (d < bestD) {
      best = slot;
      bestD = d;
    }
  }
  if (!best || bestD > alignPx) return null;
  return best;
}

/**
 * West shot toward a body. A target that is not west of the muzzle
 * falls back to straight west so the gun never fires back into the wall.
 * @param {number} fromX
 * @param {number} fromY
 * @param {{ x: number, y: number }|null|undefined} target
 * @param {number} speed
 * @returns {{ vx: number, vy: number }}
 */
export function waterAimVelocity(fromX, fromY, target, speed) {
  const s = Math.abs(Number(speed) || 0);
  const west = { vx: -s, vy: 0 };
  if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return west;
  const dx = target.x - fromX;
  const dy = target.y - fromY;
  if (!(dx < -0.5)) return west;
  const len = Math.hypot(dx, dy);
  if (!(len > 0) || !Number.isFinite(len)) return west;
  return { vx: (dx / len) * s, vy: (dy / len) * s };
}
