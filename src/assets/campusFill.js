import {
  depthFromY,
  displayScaleFromY,
  grassYMax,
  grassYMin,
  WORLD_SHIFT_X,
} from '../systems/DepthView.js';

/**
 * Nov 17 campus fill. Decorative only: no Arcade bodies, no gold, no save.
 * Recommended path sets from the 入庫 manifest. Near-duplicate sets
 * (gravel A/B, dark asphalt yellow + v2, and the rest) stay in the catalog.
 * PIXELLAB_HOOK: path-campus, path-campus-lawn, path-concrete-sidewalk,
 * path-asphalt-yellow, path-cobble-street, path-dirt, path-metal-grate-walkway.
 */
export const CAMPUS_FILL_SETS = Object.freeze([
  'path-campus',
  'path-campus-lawn',
  'path-concrete-sidewalk',
  'path-asphalt-yellow',
  'path-cobble-street',
  'path-dirt',
  'path-metal-grate-walkway',
]);

/** Floor decals. Everything else in the street pack stands on its feet. */
const FLOOR_DECALS = new Set(['prop-manhole', 'prop-street-grate']);

/**
 * Left margin of the parked camera (world X starts at WORLD_SHIFT_X).
 * The grass trapezoid's left edge is off-screen, so fractions of that
 * trapezoid never reached the view. Slots stay on the spawn side, clear
 * of the barricade.
 * @type {string[]}
 */
const PROP_STAMPS = [
  'fence-damage-none',
  'prop-fence-intact',
  'prop-street-lamp',
  'prop-bench',
  'prop-bollard',
  'prop-fire-hydrant',
  'prop-trash-can',
  'prop-traffic-cone',
  'prop-street-grate',
  'prop-dumpster',
  'prop-manhole',
  'prop-dumpster-green',
];

/**
 * Paint a near sidewalk from the recommended sets, a short façade row,
 * and a handful of street props. Returns false when the tiles are not loaded.
 * @param {Phaser.Scene} scene
 * @returns {boolean}
 */
export function drawCampusFill(scene) {
  if (!scene?.add?.image || !scene.textures?.exists) return false;
  const paths = drawPathBand(scene);
  const walls = drawFacades(scene);
  const props = drawStreetProps(scene);
  return paths || walls || props;
}

/**
 * One sample of each recommended set, bottom-left of the grass.
 * A full-width band covered the near lane and the pet, so the fill
 * stays in the left margin. Origin (0, 0). Depth is above the campus
 * plate and below the actors.
 * @param {Phaser.Scene} scene
 */
function drawPathBand(scene) {
  const scale = 2;
  const step = 32 * scale;
  const y = grassYMax() - step - 56;
  let x = WORLD_SHIFT_X + 16;
  let drew = false;
  CAMPUS_FILL_SETS.forEach((set, i) => {
    const key = `${set}-${String(i).padStart(2, '0')}`;
    if (!scene.textures.exists(key)) return;
    scene.add.image(x, y, key).setOrigin(0, 0).setScale(scale).setDepth(7);
    x += step;
    drew = true;
  });
  return drew;
}

/**
 * Apartment façades, not a floor. A short row on the left skyline.
 * PIXELLAB_HOOK: wall-brick-apartment-00 … 79, 52×87, origin (0.5, 1).
 * @param {Phaser.Scene} scene
 */
function drawFacades(scene) {
  if (!scene.textures.exists('wall-brick-apartment-00')) return false;
  const y = grassYMin();
  const scale = displayScaleFromY(y);
  for (let i = 0; i < 6; i += 1) {
    const key = `wall-brick-apartment-${String(i).padStart(2, '0')}`;
    if (!scene.textures.exists(key)) continue;
    const x = WORLD_SHIFT_X + 36 + i * Math.round(52 * scale);
    scene.add.image(x, y, key).setOrigin(0.5, 1).setScale(scale).setDepth(6.2);
  }
  return true;
}

/**
 * Decorative props. Upright origin (0.5, 1). Decals use (0.5, 0.5).
 * Depth is behind a zombie on the same lane. No collision.
 * @param {Phaser.Scene} scene
 */
function drawStreetProps(scene) {
  let drew = false;
  const y0 = grassYMin();
  const y1 = grassYMax();
  const n = PROP_STAMPS.length;
  PROP_STAMPS.forEach((key, i) => {
    if (!scene.textures.exists(key)) return;
    const t = n <= 1 ? 0.5 : i / (n - 1);
    const y = y0 + (y1 - y0) * (0.16 + t * 0.48);
    const x = WORLD_SHIFT_X + 56 + (i % 2) * 28;
    const decal = FLOOR_DECALS.has(key);
    scene.add
      .image(x, y, key)
      .setOrigin(0.5, decal ? 0.5 : 1)
      .setScale(displayScaleFromY(y) * (decal ? 1 : 0.85))
      .setDepth(depthFromY(y, -6));
    drew = true;
  });
  return drew;
}
