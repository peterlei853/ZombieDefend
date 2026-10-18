/**
 * Main-stage enemy roster (v0.36.24).
 *
 * Five stages. Stages 2–5 still spawn one skin: stage N is id N from the
 * feel-booth order (the first five of DEMO_ENEMY_IDS). Stage 1 randomly
 * spawns types 1 / 2 / 3 (`office-worker-v2`, `delivery`, `chef`). #5 is
 * brute. HP, speed, DPS, counts, and gold-by-HP stay on the wave row. A
 * missing strip falls back to `office-worker-v2` only. The removed 64px
 * `zombie-office-*` group is not a skin and not a fallback.
 */

/** How many main stages exist. Stage select and shop Next stop here. */
export const STAGE_COUNT = 5;

/**
 * Stage 1 → stage 5, in play order. Must stay the first five DEMO_ENEMY_IDS.
 * Stage 1's live pool is STAGE_1_MIX, not only the first id.
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
 * Stage 1 spawn pool. Types 1 / 2 / 3 only. Later stages do not use this.
 * @type {string[]}
 */
export const STAGE_1_MIX = ['office-worker-v2', 'delivery', 'chef'];

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
 * The headline skin for this stage. Stage 1's headline is type 1.
 * The stage 1 spawn pool is {@link rosterForStage}.
 * @param {number} stage
 * @returns {string}
 */
export function skinForStage(stage) {
  return STAGE_ROSTER[clampStage(stage) - 1];
}

/**
 * Skin ids this stage may spawn. Stage 1 is types 1 / 2 / 3.
 * Stages 2–5 stay a single id.
 * @param {number} stage
 * @returns {string[]}
 */
export function rosterForStage(stage) {
  if (clampStage(stage) === 1) return STAGE_1_MIX.slice();
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
