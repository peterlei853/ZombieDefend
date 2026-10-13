import {
  barricadeXAtY,
  depthFromY,
  displayScaleFromY,
  grassYMax,
  grassYMin,
  layoutPx,
} from '../systems/DepthView.js';

/**
 * First form only. Baby idle / move / skill / hurt strips (48×48, feet origin,
 * face west) and the baby skill FX. Young / ancient forms stay on disk.
 * Order is party order: far → near, and the portrait column top → bottom.
 * Pets are not spawned with the stage. Portraits summon them.
 * `portrait` is the 48×48 library head icon (`ui-pet-*-head`). Bright, dim,
 * and grey states are tint and alpha on that texture.
 */
export const PET_LINEUP = [
  {
    id: 'phoenix',
    element: 'fire',
    elementZh: '火',
    key: 'pet-phoenix-baby-idle',
    move: 'pet-phoenix-baby-move',
    skill: 'pet-phoenix-baby-skill',
    hurt: 'pet-phoenix-baby-hurt',
    projectile: 'fx-pet-phoenix-spark-feather',
    impact: 'fx-pet-phoenix-spark-feather-hit',
    portrait: 'ui-pet-phoenix-head',
  },
  {
    id: 'panda',
    element: 'ice',
    elementZh: '冰',
    key: 'pet-panda-baby-idle',
    move: 'pet-panda-baby-move',
    skill: 'pet-panda-baby-skill',
    hurt: 'pet-panda-baby-hurt',
    windup: 'fx-pet-panda-roll-dust',
    impact: 'fx-pet-panda-roll-impact',
    portrait: 'ui-pet-panda-head',
  },
  {
    id: 'lion',
    element: 'electric',
    elementZh: '電',
    key: 'pet-lion-baby-idle',
    move: 'pet-lion-baby-move',
    skill: 'pet-lion-baby-skill',
    hurt: 'pet-lion-baby-hurt',
    impact: 'fx-pet-lion-pounce-slash',
    portrait: 'ui-pet-lion-head',
  },
  {
    id: 'dragon',
    element: 'poison',
    elementZh: '毒',
    key: 'pet-dragon-baby-idle',
    move: 'pet-dragon-baby-move',
    skill: 'pet-dragon-baby-skill',
    hurt: 'pet-dragon-baby-hurt',
    breath: 'fx-pet-dragon-smoke-breath',
    portrait: 'ui-pet-dragon-head',
  },
];

/** Rim / bar tint for the four elements. Dragon's element is poison. */
export const PET_ELEMENT_TINT = {
  fire: 0xff7043,
  ice: 0x81d4fa,
  electric: 0xffee58,
  poison: 0x9ccc65,
};

/** Idle, move, skill, hurt, the HUD head icon, and the baby FX each role casts. */
export const PET_STAGE_KEYS = new Set(
  PET_LINEUP.flatMap((pet) =>
    [
      pet.key,
      pet.move,
      pet.skill,
      pet.hurt,
      pet.portrait,
      pet.projectile,
      pet.windup,
      pet.impact,
      pet.breath,
    ].filter(Boolean)
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
 * Stage load filter. Non-pet categories pass through (hero icons included).
 * From `pets`, only the four baby strips, their phase-1 FX, and the four
 * `ui-pet-*-head` icons are queued. The loader still reads path and type
 * from the asset index.
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
 * Legacy fence ranks (safe side of the posts). v0.20 does not spawn these.
 * Summon placement starts behind the player and walks toward the threat.
 * Kept so slot math stays available for tooling.
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
