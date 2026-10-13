import {
  barricadeXAtY,
  depthFromY,
  displayScaleFromY,
  grassYMax,
  grassYMin,
  layoutPx,
} from '../systems/DepthView.js';

/**
 * First form only. Baby idle + skill strips (48×48, feet origin, face west)
 * and the baby skill FX. Young / ancient forms stay on disk.
 * Order is far → near along the fence. Combat reads `id`; placement uses
 * `key` plus the slot math below — pets are not moved behind the hero.
 */
export const PET_LINEUP = [
  {
    id: 'phoenix',
    key: 'pet-phoenix-baby-idle',
    skill: 'pet-phoenix-baby-skill',
    projectile: 'fx-pet-phoenix-spark-feather',
    impact: 'fx-pet-phoenix-spark-feather-hit',
  },
  {
    id: 'panda',
    key: 'pet-panda-baby-idle',
    skill: 'pet-panda-baby-skill',
    windup: 'fx-pet-panda-roll-dust',
    impact: 'fx-pet-panda-roll-impact',
  },
  {
    id: 'lion',
    key: 'pet-lion-baby-idle',
    skill: 'pet-lion-baby-skill',
    impact: 'fx-pet-lion-pounce-slash',
  },
  {
    id: 'dragon',
    key: 'pet-dragon-baby-idle',
    skill: 'pet-dragon-baby-skill',
    breath: 'fx-pet-dragon-smoke-breath',
  },
];

/** Idle, skill, and the baby FX each role actually casts. */
export const PET_STAGE_KEYS = new Set(
  PET_LINEUP.flatMap((pet) =>
    [pet.key, pet.skill, pet.projectile, pet.windup, pet.impact, pet.breath].filter(Boolean)
  )
);

/**
 * Canvas px to the right of the grass edge (the fence's safe-side face).
 * The hero lane is layoutPx(32), so this rank stands between the posts
 * and the defender — behind the barricade, not glued to the hero's back.
 * The near fence is already close to the camera's right edge, so the
 * offset stays small enough that the bottom pet remains on screen.
 */
export const PET_SAFE_OFFSET = layoutPx(14);

/**
 * Stage load filter. Non-pet categories pass through. From `pets`, only
 * the four baby idle/skill strips and their phase-1 FX are queued.
 * @param {{ category?: string, key?: string }} asset
 */
export function stageLibraryFilter(asset) {
  if (!asset) return false;
  if (asset.category !== 'pets') return true;
  return PET_STAGE_KEYS.has(asset.key);
}

/** @param {string} id */
export function petRole(id) {
  return PET_LINEUP.find((pet) => pet.id === id) ?? null;
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
