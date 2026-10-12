import {
  barricadeXAtY,
  depthFromY,
  displayScaleFromY,
  grassYMax,
  grassYMin,
  layoutPx,
} from '../systems/DepthView.js';

/**
 * First form only: baby idle strips (48×48, feet origin, face west).
 * Young / ancient forms and pet FX stay on disk.
 * Order is far → near along the fence.
 */
export const PET_LINEUP = [
  { id: 'phoenix', key: 'pet-phoenix-baby-idle' },
  { id: 'panda', key: 'pet-panda-baby-idle' },
  { id: 'lion', key: 'pet-lion-baby-idle' },
  { id: 'dragon', key: 'pet-dragon-baby-idle' },
];

export const PET_LINEUP_KEYS = new Set(PET_LINEUP.map((pet) => pet.key));

/**
 * Canvas px to the right of the grass edge (the fence's safe-side face).
 * The hero lane is layoutPx(32), so this rank stands between the posts
 * and the defender — behind the barricade, not glued to the hero's back.
 * The near fence is already close to the camera's right edge, so the
 * offset stays small enough that the bottom pet remains on screen.
 */
export const PET_SAFE_OFFSET = layoutPx(14);

/**
 * Stage load filter. Non-pet categories pass through. Only the four
 * baby idle keys are queued from `pets`.
 * @param {{ category?: string, key?: string }} asset
 */
export function stageLibraryFilter(asset) {
  if (!asset) return false;
  if (asset.category !== 'pets') return true;
  return PET_LINEUP_KEYS.has(asset.key);
}

/**
 * Even slots along the slanted fence, safe side (larger X than the posts).
 * The band is inset so the near pet's tail stays inside the camera; the
 * near fence already sits close to the right edge of the view.
 */
export function petLineupSlots() {
  const y0 = grassYMin();
  const y1 = grassYMax();
  const span = y1 - y0;
  const n = PET_LINEUP.length;
  const edge = 0.06;
  return PET_LINEUP.map((pet, i) => {
    const t = edge + (1 - 2 * edge) * ((i + 0.5) / n);
    const y = y0 + t * span;
    return {
      ...pet,
      y,
      x: barricadeXAtY(y) + PET_SAFE_OFFSET,
    };
  });
}

export function petDisplayScale(y) {
  return displayScaleFromY(y);
}

/** Just behind a body on the same lane so the hero draws in front. */
export function petDepth(y) {
  return depthFromY(y, -1);
}
