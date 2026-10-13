/**
 * Stage enemy roster (v0.28).
 *
 * Stage 1 spawns the first three profession skins. Each later stage appends
 * the next id. Visual only: HP, speed, DPS, and gold-by-HP stay on the wave
 * row. `office-worker` (64px `zombie-office-*`) is not in this list; it is
 * the fallback when a preferred strip is missing.
 */

/** @type {string[]} */
export const STAGE_ROSTER = [
  'office-worker-v2',
  'delivery',
  'chef',
  'nurse',
  'clown',
  'cyborg',
  'slime',
  'exploder',
  'sprinter',
  'brute',
  'trashcan',
  'riot',
];

/** Stage 1 width. Stage N shows this many plus (N - 1), capped by the list. */
export const STAGE1_TYPE_COUNT = 3;

/**
 * @param {number} stage
 * @returns {number}
 */
export function rosterCountForStage(stage) {
  const n = Math.max(1, Math.floor(Number(stage) || 1));
  return Math.min(STAGE_ROSTER.length, STAGE1_TYPE_COUNT + (n - 1));
}

/**
 * Skin ids for this stage, in roster order.
 * @param {number} stage
 * @returns {string[]}
 */
export function rosterForStage(stage) {
  return STAGE_ROSTER.slice(0, rosterCountForStage(stage));
}
