import {
  barricadeXAtY,
  depthFromY,
  displayScaleFromY,
  grassYMax,
  grassYMin,
  layoutPx,
} from '../systems/DepthView.js';

/**
 * Field body is form 1. Baby idle / move / hurt strips (48×48, feet origin,
 * face west) stay on the pet. Each orb plays its own cast strip plus FX:
 * orb 1 baby, orb 2 young, orb 3 ancient. Young / ancient idle, move, hurt,
 * and evolve FX stay on disk — this is not an evolution skin swap.
 * Order is party order: far → near, and the HUD column top → bottom.
 * Pets are not spawned with the stage. The bar summons and recalls them.
 * `hudBar` is the 64×32 bar (head already composited on the left).
 * `hudHead` is the 48×48 icon that art baked into that bar.
 * Orb keys are 16×16 dark / lit / flash. The CD ring is drawn in code.
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
    skillYoung: 'pet-phoenix-young-skill',
    skillAncient: 'pet-phoenix-ancient-skill',
    rainBolt: 'fx-pet-phoenix-rain-bolt',
    rainImpact: 'fx-pet-phoenix-rain-impact',
    rebirth: 'fx-pet-phoenix-blazing-rebirth',
    hudBar: 'ui-pet-phoenix-bar',
    hudHead: 'ui-pet-phoenix-head',
    orbDark: 'ui-pet-orb-phoenix-dark',
    orbLit: 'ui-pet-orb-phoenix-lit',
    orbFlash: 'ui-pet-orb-phoenix-flash',
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
    skillYoung: 'pet-panda-young-skill',
    skillAncient: 'pet-panda-ancient-skill',
    sweep: 'fx-pet-panda-bamboo-sweep',
    chi: 'fx-pet-panda-chi-blast',
    hudBar: 'ui-pet-panda-bar',
    hudHead: 'ui-pet-panda-head',
    orbDark: 'ui-pet-orb-panda-dark',
    orbLit: 'ui-pet-orb-panda-lit',
    orbFlash: 'ui-pet-orb-panda-flash',
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
    skillYoung: 'pet-lion-young-skill',
    skillAncient: 'pet-lion-ancient-skill',
    roar: 'fx-pet-lion-roar-wave',
    sunder: 'fx-pet-lion-sunder-strike',
    hudBar: 'ui-pet-lion-bar',
    hudHead: 'ui-pet-lion-head',
    orbDark: 'ui-pet-orb-lion-dark',
    orbLit: 'ui-pet-orb-lion-lit',
    orbFlash: 'ui-pet-orb-lion-flash',
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
    skillYoung: 'pet-dragon-young-skill',
    skillAncient: 'pet-dragon-ancient-skill',
    fireball: 'fx-pet-dragon-fireball',
    fireballImpact: 'fx-pet-dragon-fireball-impact',
    apocalypse: 'fx-pet-dragon-apocalypse-flame',
    hudBar: 'ui-pet-dragon-bar',
    hudHead: 'ui-pet-dragon-head',
    orbDark: 'ui-pet-orb-dragon-dark',
    orbLit: 'ui-pet-orb-dragon-lit',
    orbFlash: 'ui-pet-orb-dragon-flash',
  },
];

/** Rim / bar tint for the four elements. Dragon's element is poison. */
export const PET_ELEMENT_TINT = {
  fire: 0xff7043,
  ice: 0x81d4fa,
  electric: 0xffee58,
  poison: 0x9ccc65,
};

/**
 * Baby body strips, every orb's cast strip and FX, and the bar / head / orb
 * HUD icons. Young and ancient idle / move / hurt are not in this set.
 */
export const PET_STAGE_KEYS = new Set(
  PET_LINEUP.flatMap((pet) =>
    [
      pet.key,
      pet.move,
      pet.skill,
      pet.hurt,
      pet.projectile,
      pet.windup,
      pet.impact,
      pet.breath,
      pet.skillYoung,
      pet.skillAncient,
      pet.rainBolt,
      pet.rainImpact,
      pet.rebirth,
      pet.sweep,
      pet.chi,
      pet.roar,
      pet.sunder,
      pet.fireball,
      pet.fireballImpact,
      pet.apocalypse,
      pet.hudBar,
      pet.hudHead,
      pet.orbDark,
      pet.orbLit,
      pet.orbFlash,
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
 * Stage load filter. Non-pet categories pass through. From `pets`, only
 * the baby body strips, the baby / young / ancient cast strips, the FX
 * those casts play, and the HUD bar / head / orb icons are queued.
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
 * Legacy fence ranks (safe side of the posts). v0.21 does not spawn these.
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
