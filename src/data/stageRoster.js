/**
 * Main-stage enemy roster (v0.36.31).
 *
 * Five stages. The clear loop is stages 1–5 (`PLAYABLE_STAGE_CAP`).
 * Stages 1–4 grow the skin pool. Stage 5 is the Balun boss stage.
 * A missing strip falls back to `office-worker-v2` only.
 */

/** How many main stages exist. Direct `?stage=` still accepts 1–5. */
export const STAGE_COUNT = 5;

/**
 * Title buttons and the shop Next loop stop here.
 * v0.36.31 opens stage 4 and the stage 5 boss for the demo.
 */
export const PLAYABLE_STAGE_CAP = 5;

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
 * Stage 1 spawn pool. Professions 1–3, the two early S4 groups, and slime.
 * Kept as the stage-1 alias. Later stages append; they do not drop these.
 * @type {string[]}
 */
export const STAGE_1_MIX = [
  'office-worker-v2',
  'delivery',
  'chef',
  's4-construction',
  's4-schoolgirl',
  'slime',
];

/** Stage 2 adds a runner and the exploder. Nurse stays off until stage 3. */
const STAGE_2_MIX = [...STAGE_1_MIX, 'sprinter', 'exploder'];

/** Stage 3 adds the nurse line plus cyborg and trashcan. */
const STAGE_3_MIX = [...STAGE_2_MIX, 'nurse', 'cyborg', 'trashcan'];

/** Stage 4 adds riot and the wired salaryman. Harder than stage 3. */
const STAGE_4_MIX = [...STAGE_3_MIX, 'riot', 's4-salaryman'];

/**
 * Stage 5 escorts. No nurse, so the stage-3 nurse line does not repeat.
 * The boss itself is named on the boss wave, not rolled from this list.
 * @type {string[]}
 */
export const STAGE_5_ESCORTS = ['sprinter', 'riot', 'trashcan', 'cyborg', 'exploder', 'slime', 's4-construction'];

/**
 * Pools by stage. Each stage is the previous mix plus new skins.
 * @type {Record<number, string[]>}
 */
export const EARLY_STAGE_POOLS = {
  1: STAGE_1_MIX,
  2: STAGE_2_MIX,
  3: STAGE_3_MIX,
  4: STAGE_4_MIX,
  5: ['lava-balon', ...STAGE_5_ESCORTS],
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
 * Stages 1–5 roll {@link EARLY_STAGE_POOLS}.
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
