import {
  barricadeXAtY,
  depthFromY,
  displayScaleFromY,
  grassYMax,
  grassYMin,
  layoutPx,
} from '../systems/DepthView.js';
import { PET_SKILL_LOAD_KEYS } from './petSkills.js';

/**
 * Baby bodies on the field. Idle / move / skill / sleep strips are
 * 48×48, feet origin, face west. Hurt is the Wave2 remake: panda 8×48,
 * lion 8×52, dragon and phoenix 8×64. Sleep is the recall bed:
 * sleep-start once, then the sleep loop. Young and ancient idle strips
 * stay on disk. All twelve cast strips and their skill FX load with
 * the stage. `attack` is the Wave2 8-frame basic attack, preloaded
 * beside `pet-*-baby-claw`. Combat still plays claw / the melee fan
 * until Gameplay swaps. `pet-dragon-baby-attack` is the v1.1 overhead
 * slam (8×64); the v1.0 subtle claw is replaced.
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
    // PIXELLAB_HOOK: 8×64 attack beside pet-phoenix-baby-claw. Not the played bite yet.
    attack: 'pet-phoenix-baby-attack',
    sleepStart: 'pet-phoenix-baby-sleep-start',
    sleep: 'pet-phoenix-baby-sleep',
    projectile: 'fx-pet-phoenix-spark-feather',
    impact: 'fx-pet-phoenix-spark-feather-hit',
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
    // PIXELLAB_HOOK: 8×48 attack beside pet-panda-baby-claw. Not the played bite yet.
    attack: 'pet-panda-baby-attack',
    sleepStart: 'pet-panda-baby-sleep-start',
    sleep: 'pet-panda-baby-sleep',
    windup: 'fx-pet-panda-roll-dust',
    impact: 'fx-pet-panda-roll-impact',
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
    // PIXELLAB_HOOK: 8×52 attack beside pet-lion-baby-claw. Not the played bite yet.
    attack: 'pet-lion-baby-attack',
    sleepStart: 'pet-lion-baby-sleep-start',
    sleep: 'pet-lion-baby-sleep',
    impact: 'fx-pet-lion-pounce-slash',
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
    // PIXELLAB_HOOK: 8×64 v1.1 overhead slam beside pet-dragon-baby-claw.
    attack: 'pet-dragon-baby-attack',
    sleepStart: 'pet-dragon-baby-sleep-start',
    sleep: 'pet-dragon-baby-sleep',
    breath: 'fx-pet-dragon-smoke-breath',
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
 * Baby body strips, the v0.21 bar / head / orb HUD icons, and every
 * form's cast strip plus skill FX (`PET_SKILL_LOAD_KEYS`).
 */
export const PET_STAGE_KEYS = new Set([
  ...PET_LINEUP.flatMap((pet) =>
    [
      pet.key,
      pet.move,
      pet.skill,
      pet.hurt,
      pet.attack,
      pet.sleepStart,
      pet.sleep,
      pet.projectile,
      pet.windup,
      pet.impact,
      pet.breath,
      pet.hudBar,
      pet.hudHead,
      pet.orbDark,
      pet.orbLit,
      pet.orbFlash,
    ].filter(Boolean)
  ),
  ...PET_SKILL_LOAD_KEYS,
]);

/**
 * Canvas px to the right of the grass edge (the fence's safe-side face).
 * The hero lane is layoutPx(32), so this rank stands between the posts
 * and the defender — behind the barricade, not glued to the hero's back.
 * The near fence is already close to the camera's right edge, so the
 * offset stays small enough that the bottom pet remains on screen.
 */
export const PET_SAFE_OFFSET = layoutPx(14);

/**
 * Stage load filter. Non-pet categories pass through. From `pets`, the
 * baby body strips (including the Wave2 attack keys), HUD icons, and all
 * twelve cast strips plus skill FX are queued. Young / ancient idle,
 * move, and hurt stay unloaded.
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
 * Safe-side ranks behind the posts, one per pet, spread down the grass.
 * Stage start does not spawn them. Recall claims a free rank and walks
 * there; the spots do not share a point.
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

/**
 * Asleep behind the fence. Posts use bias −2, so −4 draws the pet under them.
 * @param {number} y
 */
export function petSleepDepth(y) {
  return depthFromY(y, -4);
}
