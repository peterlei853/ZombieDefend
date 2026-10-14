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
/** PIXELLAB_HOOK: prop-water-mount — gun sprite on the fence post. */
export const WATER_MOUNT_KEY = 'prop-water-mount';
/** Drawn when the mount sheet is not in the library yet. */
export const WATER_MOUNT_FALLBACK_KEY = 'player-girl-front-water-still';

/**
 * Field px. Half the fence gap is ~28, so 18 leaves a dead zone between
 * slots. Nearest-slot alone would free-fire the whole wall.
 */
export const WATER_MOUNT_ALIGN_FIELD = 18;

/** `fx-water-impact` is 6 frames at 12 fps (500ms), played once. */
export const WATER_IMPACT_FRAMES = 6;
export const WATER_IMPACT_FPS = 12;
/** HP drops at the middle of that sheet (frame 3). */
export const WATER_IMPACT_BEAT = 0.5;

/** Gun sits this fraction of the post height above the sole. */
export const WATER_MOUNT_GUN_RISE = 0.62;
/** West of the post center, field px. The slug leaves the nozzle. */
export const WATER_MOUNT_MUZZLE_FIELD = 16;

/**
 * @param {number} [durationMs] full impact length; defaults to the authored sheet
 * @returns {number}
 */
export function waterImpactBeatMs(durationMs) {
  const authored = (WATER_IMPACT_FRAMES / WATER_IMPACT_FPS) * 1000;
  const full = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : authored;
  return full * WATER_IMPACT_BEAT;
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
    const gunY = anchor.groundY - anchor.postH * WATER_MOUNT_GUN_RISE;
    return {
      index,
      x: anchor.x,
      y,
      gunX: anchor.x,
      gunY,
      muzzleX: anchor.x - muzzle,
      muzzleY: gunY,
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
