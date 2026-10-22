/**
 * Main-stage enemy roster (v0.36.27).
 *
 * Five stages remain. The clear loop is stages 1–3 (`PLAYABLE_STAGE_CAP`).
 * Stages 4–5 stay on the roster and keep their single skin; the title
 * soft-gates those buttons. Stage 1–3 pools are lists, not a permanent
 * lock to four professions: append a catalog id when a new early monster
 * is wired. A missing strip falls back to `office-worker-v2` only.
 */

/** How many main stages exist. Direct `?stage=` still accepts 1–5. */
export const STAGE_COUNT = 5;

/**
 * Title buttons and the shop Next loop stop here.
 * Stages above this still have wave data. They are not the 3-loop test.
 */
export const PLAYABLE_STAGE_CAP = 3;

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
 * Stage 1 spawn pool. Types 1 / 2 / 3. Kept as the stage-1 alias.
 * @type {string[]}
 */
export const STAGE_1_MIX = ['office-worker-v2', 'delivery', 'chef'];

/**
 * Early-stage pools. New catalog ids append here. Stage 4+ does not use this.
 * @type {Record<number, string[]>}
 */
export const EARLY_STAGE_POOLS = {
  1: STAGE_1_MIX,
  2: ['office-worker-v2', 'delivery', 'chef'],
  3: ['office-worker-v2', 'delivery', 'chef', 'nurse'],
};

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
 * Skin ids this stage may spawn.
 * Stages 1–3 roll {@link EARLY_STAGE_POOLS}. Stages 4–5 stay one id.
 * @param {number} stage
 * @returns {string[]}
 */
export function rosterForStage(stage) {
  const n = clampStage(stage);
  const pool = EARLY_STAGE_POOLS[n];
  if (pool) return pool.slice();
  return [skinForStage(n)];
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
