import { GAME_WIDTH, GAME_HEIGHT } from '../data/waves.js';

/**
 * 2.5D banded side-view.
 *
 * X is the march (left spawn → right barricade).
 * Y is the depth / lane axis: smaller Y is farther (toward the horizon,
 * higher on screen, slightly smaller); larger Y is nearer the camera.
 *
 * World is wider than the viewport so the camera can sit on the base.
 * Logical combat X (spawn −10, BARRICADE_X 650) is shifted by WORLD_SHIFT_X
 * so travel distance — and therefore contact timing — stays the same.
 */

export const WORLD_WIDTH = 1320;
export const WORLD_HEIGHT = GAME_HEIGHT;
export const WORLD_SHIFT_X = WORLD_WIDTH - GAME_WIDTH;

/** Logical spawn X from the original 800-wide field (just off the left edge). */
export const SPAWN_LOGICAL_X = -10;

export const HORIZON_Y = 92;
/** Dark walk lanes split evenly across the grass band (upper → lower). */
export const LANE_COUNT = 9;
/** Spawn jitter so a lane's zombies are not glued to one pixel row. */
export const LANE_JITTER_PX = 8;

/** Padding inset from horizon / bottom for playable grass band. */
const GRASS_PAD_TOP = 8;
const GRASS_PAD_BOTTOM = 10;

/** Z samples for the ground plane (larger Z = farther). */
const GROUND_Z_FAR = 2.45;
const GROUND_Z_NEAR = 0.78;

const BAND_COUNT = 6;
const BAND_COLORS = [0x24362c, 0x2e4334, 0x38543c, 0x446848, 0x507a52, 0x5c8c5e];

export const SCALE_FAR = 0.74;
export const SCALE_NEAR = 1.14;

/** Depth reserved above every lane so HUD / overlays always win. */
export const HUD_DEPTH = 20000;

export function worldX(logicalX) {
  return logicalX + WORLD_SHIFT_X;
}

export function spawnWorldX() {
  return worldX(SPAWN_LOGICAL_X);
}

/**
 * Project a ground-plane Z into screen/world Y.
 * Far (large Z) → near HORIZON_Y. Near (small Z) → toward WORLD_HEIGHT.
 * Equal Z steps spread out as they approach the camera.
 */
export function yFromZ(z) {
  const invFar = 1 / GROUND_Z_FAR;
  const invNear = 1 / GROUND_Z_NEAR;
  const n = (1 / z - invFar) / (invNear - invFar);
  const clamped = Math.min(1, Math.max(0, n));
  return HORIZON_Y + clamped * (WORLD_HEIGHT - HORIZON_Y);
}

/** Trapezoid left/right at this Y. Far = narrower, near = full world width. */
export function groundEdgesAtY(y) {
  const span = WORLD_HEIGHT - HORIZON_Y;
  const t = span <= 0 ? 1 : (y - HORIZON_Y) / span;
  const clamped = Math.min(1, Math.max(0, t));
  const inset = (1 - clamped) * WORLD_WIDTH * 0.2;
  return { left: inset, right: WORLD_WIDTH - inset };
}

/**
 * Playable grass Y band (shared by barricade posts, player clamp, pet clamp).
 * Single source of truth — do not duplicate these literals elsewhere.
 */
export function grassYMin() {
  return HORIZON_Y + GRASS_PAD_TOP;
}

export function grassYMax() {
  return WORLD_HEIGHT - GRASS_PAD_BOTTOM;
}

/**
 * Grass right-edge X at Y (slanted barricade centerline before post inset).
 * Pass halfPostWidth to inset so a post of that half-width sits ON the edge.
 */
export function barricadeXAtY(y, halfPostWidth = 0) {
  return groundEdgesAtY(y).right - halfPostWidth;
}

/**
 * Horizontal depth bands as trapezoids (far strip higher and narrower).
 * @returns {{ color: number, y0: number, y1: number, e0: {left:number,right:number}, e1: {left:number,right:number} }[]}
 */
export function depthBands() {
  const bands = [];
  for (let i = 0; i < BAND_COUNT; i++) {
    const z0 = GROUND_Z_FAR + (GROUND_Z_NEAR - GROUND_Z_FAR) * (i / BAND_COUNT);
    const z1 = GROUND_Z_FAR + (GROUND_Z_NEAR - GROUND_Z_FAR) * ((i + 1) / BAND_COUNT);
    const y0 = yFromZ(z0);
    const y1 = yFromZ(z1);
    bands.push({
      color: BAND_COLORS[i % BAND_COLORS.length],
      y0,
      y1,
      e0: groundEdgesAtY(y0),
      e1: groundEdgesAtY(y1),
    });
  }
  return bands;
}

/**
 * Lane center Ys, far → near (top → bottom).
 * The grass band is split into LANE_COUNT strips; each value is that strip's center
 * so guides stay inside the grass and ±LANE_JITTER_PX cannot leave the band.
 */
export function laneCenters() {
  const y0 = grassYMin();
  const y1 = grassYMax();
  const span = y1 - y0;
  const ys = [];
  for (let i = 0; i < LANE_COUNT; i++) {
    const t = (i + 0.5) / LANE_COUNT;
    ys.push(y0 + span * t);
  }
  return ys;
}

export function randomLaneY(rng = Math.random) {
  const lanes = laneCenters();
  const i = Math.min(lanes.length - 1, Math.floor(rng() * lanes.length));
  return lanes[i];
}

/**
 * Even lane pick. `cycle` is `{ order: number[] }` owned by the spawner.
 * Each pass visits every lane once (shuffled) before any lane repeats,
 * then adds ±LANE_JITTER_PX and clamps to the grass band.
 * @param {{ order?: number[] }} cycle
 * @param {() => number} [rng]
 */
export function takeEvenLaneY(cycle, rng = Math.random) {
  if (!cycle.order) cycle.order = [];
  if (cycle.order.length === 0) {
    const n = laneCenters().length;
    cycle.order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = cycle.order[i];
      cycle.order[i] = cycle.order[j];
      cycle.order[j] = tmp;
    }
  }
  const lanes = laneCenters();
  const idx = cycle.order.pop();
  const jitter = (rng() * 2 - 1) * LANE_JITTER_PX;
  const y = lanes[idx] + jitter;
  return Math.min(grassYMax(), Math.max(grassYMin(), y));
}

/**
 * Occlusion key. Lower on screen (larger Y, closer to the camera) draws on top.
 * `bias` is only for stacking parts of the same actor (body vs bar); it is
 * smaller than one pixel of Y so it never beats a nearer lane.
 */
export function depthFromY(y, bias = 0) {
  return 100 + Math.round(y * 10) + bias;
}

/** Far lanes slightly smaller, near lanes slightly larger. */
export function scaleFromY(y) {
  const lanes = laneCenters();
  const min = lanes[0];
  const max = lanes[lanes.length - 1];
  const span = max - min;
  const t = span <= 0 ? 1 : (y - min) / span;
  const clamped = Math.min(1, Math.max(0, t));
  return SCALE_FAR + (SCALE_NEAR - SCALE_FAR) * clamped;
}

/**
 * Opening scroll: barricade sits on the right of the viewport,
 * spawn (logical −10) falls just left of the camera.
 */
export function cameraScrollX(barricadeWorldX, viewWidth = GAME_WIDTH) {
  const max = Math.max(0, WORLD_WIDTH - viewWidth);
  const desired = barricadeWorldX - Math.round(viewWidth * 0.82);
  return Math.min(max, Math.max(0, desired));
}
