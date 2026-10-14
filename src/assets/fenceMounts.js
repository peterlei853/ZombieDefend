/**
 * Composite fence mounts (v0.33).
 *
 * Six slots share the water fence geometry (0.85 scale, 4px lift,
 * alignment). Top to bottom they are OWNED_WEAPON_ORDER: water, sling,
 * bubble, lightning, frost, flame. Each slot is an empty cradle plus
 * that weapon's still (or icon). The gun is not baked into the cradle.
 *
 * Water uses prop-water-mount-hi-vis. Sling uses prop-sling-mount-hi-vis.
 * The other four prefer prop-<id>-mount-hi-vis, then the sling hi-vis
 * cradle, then the water hi-vis cradle. The slot she is stopped behind
 * uses prop-<id>-mount-front-alt when that sheet is loaded.
 *
 * Fire points only. contactXAt, gold, and saves do not read this module.
 */

import { OWNED_WEAPON_ORDER } from './heroDeploy.js';
import {
  WATER_MOUNT_ALIGN_FIELD,
  WATER_MOUNT_ALT_KEY,
  WATER_MOUNT_COUNT,
  WATER_MOUNT_HI_VIS_KEY,
  WATER_MOUNT_KEY,
  WATER_MOUNT_ORIGIN,
  buildWaterMountSlots,
  nearestWaterMount,
} from './waterMounts.js';
import {
  SLING_MOUNT_ALT_KEY,
  SLING_MOUNT_HI_VIS_KEY,
  SLING_MOUNT_KEY,
} from './slingMounts.js';

export const FENCE_MOUNT_COUNT = WATER_MOUNT_COUNT;
export const FENCE_MOUNT_ALIGN_FIELD = WATER_MOUNT_ALIGN_FIELD;
export const FENCE_MOUNT_ORIGIN = WATER_MOUNT_ORIGIN;

/** Top → bottom. Same order as the shop and the stage-1 grant. */
export const FENCE_WEAPON_ORDER = OWNED_WEAPON_ORDER;

/**
 * Empty cradles, brightest first. No gun is in these sheets.
 * @param {string} id
 * @returns {string[]}
 */
export function fenceCradleCandidates(id) {
  if (id === 'water') return [WATER_MOUNT_HI_VIS_KEY, WATER_MOUNT_KEY];
  if (id === 'sling') {
    return [SLING_MOUNT_HI_VIS_KEY, SLING_MOUNT_KEY, WATER_MOUNT_HI_VIS_KEY, WATER_MOUNT_KEY];
  }
  return [
    `prop-${id}-mount-hi-vis`,
    SLING_MOUNT_HI_VIS_KEY,
    WATER_MOUNT_HI_VIS_KEY,
    SLING_MOUNT_KEY,
    WATER_MOUNT_KEY,
  ];
}

/**
 * First loaded cradle, or null when none of the chain is present.
 * @param {string} id
 * @param {(key: string) => boolean} [exists]
 * @returns {string|null}
 */
export function fenceRowKey(id, exists) {
  for (const key of fenceCradleCandidates(id)) {
    if (typeof exists === 'function' && exists(key)) return key;
  }
  return null;
}

/**
 * Front dual-post for the slot she is stopped behind.
 * Only the weapon's own alt — a sling alt is not borrowed for bubble.
 * @param {string} id
 * @param {(key: string) => boolean} [exists]
 * @returns {string|null}
 */
export function fenceActiveKey(id, exists) {
  if (id === 'water' && typeof exists === 'function' && exists(WATER_MOUNT_ALT_KEY)) {
    return WATER_MOUNT_ALT_KEY;
  }
  if (id === 'sling' && typeof exists === 'function' && exists(SLING_MOUNT_ALT_KEY)) {
    return SLING_MOUNT_ALT_KEY;
  }
  const own = `prop-${id}-mount-front-alt`;
  if (typeof exists === 'function' && exists(own)) return own;
  return null;
}

/**
 * Still in the cradle, then the shop icon, then the bob strip.
 * @param {string} id
 * @returns {string[]}
 */
export function fenceFloatCandidates(id) {
  return [`player-girl-front-${id}-still`, `icon-${id}`, `player-girl-front-${id}`];
}

/**
 * @param {string} id
 * @param {(key: string) => boolean} [exists]
 * @returns {string|null}
 */
export function fenceFloatKey(id, exists) {
  for (const key of fenceFloatCandidates(id)) {
    if (typeof exists === 'function' && exists(key)) return key;
  }
  return null;
}

/**
 * @param {(y: number) => { x: number, groundY: number, postH: number }} anchorAt
 * @param {number} [yMin]
 * @param {number} [yMax]
 */
export function buildFenceMountSlots(anchorAt, yMin, yMax) {
  return buildWaterMountSlots(anchorAt, yMin, yMax).map((slot, index) => ({
    ...slot,
    weaponId: FENCE_WEAPON_ORDER[index] || FENCE_WEAPON_ORDER[0],
  }));
}

/**
 * @param {number} y
 * @param {{ y: number }[]} slots
 * @param {number} alignPx
 */
export function nearestFenceMount(y, slots, alignPx) {
  return nearestWaterMount(y, slots, alignPx);
}
