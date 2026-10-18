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

/** Hold this long for a level-2 charge. Under it, the shot stays L1. */
export const WATER_CHARGE_L2_MS = 2500;
/** Hold this long for a level-3 charge. */
export const WATER_CHARGE_L3_MS = 5000;
/** L2 explosion stays on the contact pixel this long, then leaves. */
export const WATER_L2_AOE_MS = 4000;
/** Shared AOE contact tick while opaque pixels still overlap. */
export const WATER_AOE_TICK_MS = 200;
export const WATER_AOE_TICK_DMG = 6;
/** Each new body an L3 shot enters. Stacks. */
export const WATER_L3_ENTER_SLOW = 0.8;
/** Each L3 damage tick shifts the body this far east. */
export const WATER_L3_NUDGE_PX = 2;
/** Steering never leaves this many degrees off horizontal. */
export const WATER_HOMING_DEG = 10;

export const WATER_CHARGE_FX = {
  aura: 'fx-water-charge-aura',
  auraL2: 'fx-water-charge-aura-l2',
  auraL3: 'fx-water-charge-aura-l3',
  proj: { 2: 'fx-water-proj-t2', 3: 'fx-water-proj-t3' },
  // PIXELLAB_HOOK: catalog v2.1. L2 explosion and the shared white X.
  aoe: 'fx-water-t2-aoe',
  touch: 'fx-aoe-touch-x',
};

/**
 * Cyan under 2.5s, yellow from 2.5s, red from 5s. The sheet is the color.
 * @param {number} tier
 */
export function waterAuraKey(tier) {
  if (tier >= 3) return WATER_CHARGE_FX.auraL3;
  if (tier >= 2) return WATER_CHARGE_FX.auraL2;
  return WATER_CHARGE_FX.aura;
}

/**
 * 1 under 2.5s, 2 from 2.5s, 3 from 5s. A tap is still level 1.
 * @param {number} ms
 */
export function waterChargeTier(ms) {
  const t = Number(ms) || 0;
  if (t >= WATER_CHARGE_L3_MS) return 3;
  if (t >= WATER_CHARGE_L2_MS) return 2;
  return 1;
}

/**
 * Bodies a charge shot may hit before it is spent.
 * Level 2 stops on the first body. Level 3 keeps going across the field.
 * @param {number} tier
 */
export function waterPierceFor(tier) {
  if (tier >= 3) return Infinity;
  return 1;
}

/**
 * Authored hit box in field px. L2 is a 128-wide cell and L3 is a
 * 512-wide cell, so the AABB stays large enough for the opaque test.
 * layoutPx(320) is 512 at the 1.6 field scale.
 * @param {number} tier
 */
export function waterHitSizeFor(tier) {
  if (tier >= 3) return 320;
  if (tier === 2) return 80;
  return 16;
}

/**
 * West heading, steered toward `target`, clamped to ±10° off horizontal.
 * A body outside that cone is held on the cone edge. No body, or a body
 * that is not west of the muzzle, stays flat west.
 * @param {number} fromX
 * @param {number} fromY
 * @param {{ x: number, y: number }|null|undefined} target
 * @param {number} speed
 * @returns {{ vx: number, vy: number }}
 */
export function waterConeVelocity(fromX, fromY, target, speed) {
  const s = Math.abs(Number(speed) || 0);
  const west = { vx: -s, vy: 0 };
  if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return west;
  const dx = target.x - fromX;
  const dy = target.y - fromY;
  if (!(dx < -0.5)) return west;
  const ang = Math.atan2(dy, dx);
  let pitch = ang > 0 ? ang - Math.PI : ang + Math.PI;
  const max = (WATER_HOMING_DEG * Math.PI) / 180;
  if (pitch > max) pitch = max;
  if (pitch < -max) pitch = -max;
  const aim = pitch >= 0 ? -Math.PI + pitch : Math.PI + pitch;
  return { vx: Math.cos(aim) * s, vy: Math.sin(aim) * s };
}

/**
 * Where to aim so a shot at `bulletSpeed` meets a body moving at
 * `targetVx` (world px/s, east positive). A held or stopped body
 * (`targetVx` near 0) stays on its current point. Y is not led:
 * marchers keep their lane.
 * @param {number} fromX
 * @param {number} fromY
 * @param {number} targetX
 * @param {number} targetY
 * @param {number} targetVx
 * @param {number} bulletSpeed
 * @returns {{ x: number, y: number }}
 */
export function waterLeadAim(fromX, fromY, targetX, targetY, targetVx, bulletSpeed) {
  const here = { x: targetX, y: targetY };
  const s = Math.abs(Number(bulletSpeed) || 0);
  const vz = Number(targetVx) || 0;
  if (!(s > 0) || Math.abs(vz) < 1) return here;
  if (!Number.isFinite(fromX) || !Number.isFinite(fromY)) return here;
  if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return here;
  const dx = targetX - fromX;
  const dy = targetY - fromY;
  const a = vz * vz - s * s;
  const b = 2 * dx * vz;
  const c = dx * dx + dy * dy;
  /** @type {number[]} */
  const times = [];
  if (Math.abs(a) < 1e-4) {
    if (Math.abs(b) > 1e-4) times.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return here;
    const root = Math.sqrt(disc);
    times.push((-b - root) / (2 * a), (-b + root) / (2 * a));
  }
  let t = 0;
  for (const candidate of times) {
    if (candidate > 0.02 && candidate < 5 && (t === 0 || candidate < t)) t = candidate;
  }
  if (!(t > 0)) return here;
  return { x: targetX + vz * t, y: targetY };
}

/**
 * Chest Y when the body has one, otherwise `y`.
 * @param {{ y?: number, bodyCenterY?: number }} z
 */
function waterAimY(z) {
  return Number.isFinite(z.bodyCenterY) ? z.bodyCenterY : (Number.isFinite(z.y) ? z.y : 0);
}

/**
 * Living body a water shot should fly toward. Sticks to `guideId`
 * while that body is still west of the shot. A new pick stays on the
 * shot's lane (closest chest Y) and, on that lane, takes the nearest
 * walker. A steep shot at a closer body on another lane is what lets
 * the core skim past.
 * @param {{ id?: number, x: number, y?: number, bodyCenterY?: number, alive?: boolean }[]} zombies
 * @param {number} x
 * @param {number} y
 * @param {number|null|undefined} guideId
 */
export function pickWaterGuide(zombies, x, y, guideId) {
  /** @type {{ id?: number, x: number, y?: number, bodyCenterY?: number }[]} */
  const ahead = [];
  for (const z of zombies || []) {
    if (!z || z.alive === false) continue;
    if (!Number.isFinite(z.x) || !(z.x < x - 4)) continue;
    ahead.push(z);
  }
  if (guideId != null) {
    const stuck = ahead.find((z) => z.id === guideId);
    if (stuck) return stuck;
  }
  let best = null;
  let bestDy = Infinity;
  let bestDx = Infinity;
  for (const z of ahead) {
    const dy = Math.abs(waterAimY(z) - y);
    const dx = x - z.x;
    const closerLane = dy < bestDy - 12;
    const sameLane = Math.abs(dy - bestDy) <= 12 && dx < bestDx;
    if (!best || closerLane || sameLane) {
      best = z;
      bestDy = dy;
      bestDx = dx;
    }
  }
  return best;
}
