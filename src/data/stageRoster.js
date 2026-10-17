/**
 * Main-stage enemy roster (v0.36.11).
 *
 * Five stages, one skin each. Stage N spawns only id N from the feel-booth
 * order (the first five of DEMO_ENEMY_IDS). #5 is brute. HP, speed, DPS,
 * counts, and gold-by-HP stay on the wave row. A missing strip falls back
 * to `office-worker-v2` only. The removed 64px `zombie-office-*` group is
 * not a skin and not a fallback.
 */

/** How many main stages exist. Stage select and shop Next stop here. */
export const STAGE_COUNT = 5;

/**
 * Stage 1 → stage 5, in play order. Must stay the first five DEMO_ENEMY_IDS.
 * @type {string[]}
 */
export const STAGE_ROSTER = [
  'office-worker-v2',
  'delivery',
  'chef',
  'nurse',
  'brute',
];

/**
 * Clamp a stage number onto 1..STAGE_COUNT.
 * @param {number} stage
 * @returns {number}
 */
export function clampStage(stage) {
  const n = Math.floor(Number(stage) || 1);
  if (n < 1) return 1;
  if (n > STAGE_COUNT) return STAGE_COUNT;
  return n;
}

/**
 * The one skin id this stage spawns.
 * @param {number} stage
 * @returns {string}
 */
export function skinForStage(stage) {
  return STAGE_ROSTER[clampStage(stage) - 1];
}

/**
 * Skin ids for this stage. Length is always 1.
 * @param {number} stage
 * @returns {string[]}
 */
export function rosterForStage(stage) {
  return [skinForStage(stage)];
}

/**
 * `?stage=N` when N is a real main stage. Missing or unknown values
 * return null so the title still offers every stage.
 * @param {string} [search]
 * @returns {number|null}
 */
export function stageFromQuery(search) {
  try {
    const raw = search ?? (globalThis.location?.search || '');
    const value = new URLSearchParams(raw || '').get('stage');
    if (value == null || value.trim() === '') return null;
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < 1 || n > STAGE_COUNT) return null;
    return n;
  } catch (_) {
    return null;
  }
}
