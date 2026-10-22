/**
 * Twelve pet-form skills.
 *
 * castFrame, frames, frameRate, spawnOffset, and fx are copied from
 * assets/library/pets/<id>/<form>/manifest.json. Fan, rain, cone, beam
 * loop, and travel notes are copied from the matching fx/manifest.json.
 *
 * Distances on `rain`, `cone`, and `aoe` are field px. PetCombat applies
 * layoutPx. px/frame rates are the manifest's 60fps figures.
 * `travelOffset` is frame px (west negative) from that skill strip.
 * Roll Raid and Cub Pounce move the body by it; roll dust stays behind.
 */

/** @typedef {'baby'|'young'|'ancient'} PetForm */

/**
 * @typedef {object} PetSkillSpec
 * @property {string} id
 * @property {PetForm} form
 * @property {string} name
 * @property {number} castFrame
 * @property {number} frames
 * @property {number} frameRate
 * @property {[number, number]} spawnOffset
 * @property {string[]} fx
 * @property {[number, number]} [travelOffset] frame px, body move
 * @property {number[]} [fanDeg]
 * @property {{ count: number, westMin: number, westMax: number, upMin: number, upMax: number, vxFrame: number, vyFrame: number }} [rain]
 * @property {'self'|'ground'} [aoe]
 * @property {{ range: number, halfAngleDeg: number, stunMs: number }} [cone]
 * @property {{ pxPerFrame: number }} [projectile]
 * @property {{ loopFrom: number, loopTo: number, frames: number, frameRate: number }} [channel]
 */

/** @type {Record<string, PetSkillSpec>} */
export const PET_SKILL_SPECS = {
  'pet-phoenix-baby-skill': {
    id: 'phoenix',
    form: 'baby',
    name: 'Spark Feather',
    castFrame: 3,
    frames: 8,
    frameRate: 10,
    spawnOffset: [-18, -22],
    fx: ['fx-pet-phoenix-spark-feather', 'fx-pet-phoenix-spark-feather-hit'],
    fanDeg: [-8, 0, 8],
  },
  'pet-phoenix-young-skill': {
    id: 'phoenix',
    form: 'young',
    name: 'Phoenix Rain',
    castFrame: 3,
    frames: 8,
    frameRate: 10,
    spawnOffset: [-22, -28],
    fx: ['fx-pet-phoenix-rain-bolt', 'fx-pet-phoenix-rain-impact'],
    rain: { count: 7, westMin: 40, westMax: 140, upMin: 60, upMax: 90, vxFrame: -2, vyFrame: 6 },
  },
  'pet-phoenix-ancient-skill': {
    id: 'phoenix',
    form: 'ancient',
    name: 'Blazing Rebirth',
    castFrame: 4,
    frames: 8,
    frameRate: 10,
    spawnOffset: [-40, -50],
    fx: ['fx-pet-phoenix-blazing-rebirth'],
    aoe: 'self',
  },
  'pet-panda-baby-skill': {
    id: 'panda',
    form: 'baby',
    name: 'Roll Raid',
    castFrame: 2,
    frames: 8,
    frameRate: 12,
    spawnOffset: [-8, -8],
    travelOffset: [-8, 0],
    fx: ['fx-pet-panda-roll-dust', 'fx-pet-panda-roll-impact'],
  },
  'pet-panda-young-skill': {
    id: 'panda',
    form: 'young',
    name: 'Bamboo Sweep',
    castFrame: 3,
    // PIXELLAB_HOOK: v2 strip is 8×84 (was 64×64). frameWidth/Height load from the asset index.
    frames: 8,
    frameRate: 12,
    spawnOffset: [-20, -20],
    fx: ['fx-pet-panda-bamboo-sweep'],
  },
  'pet-panda-ancient-skill': {
    id: 'panda',
    form: 'ancient',
    name: 'Chi Blast',
    castFrame: 4,
    frames: 8,
    frameRate: 10,
    spawnOffset: [0, -40],
    fx: ['fx-pet-panda-chi-blast'],
    aoe: 'self',
  },
  'pet-lion-baby-skill': {
    id: 'lion',
    form: 'baby',
    name: 'Cub Pounce',
    castFrame: 3,
    frames: 8,
    frameRate: 12,
    spawnOffset: [-16, -12],
    travelOffset: [-16, 0],
    fx: ['fx-pet-lion-pounce-slash'],
  },
  'pet-lion-young-skill': {
    id: 'lion',
    form: 'young',
    name: 'Lion Roar',
    castFrame: 3,
    frames: 8,
    frameRate: 12,
    spawnOffset: [-24, -16],
    fx: ['fx-pet-lion-roar-wave'],
    cone: { range: 150, halfAngleDeg: 28, stunMs: 1500 },
  },
  'pet-lion-ancient-skill': {
    id: 'lion',
    form: 'ancient',
    name: 'Sunder Strike',
    castFrame: 4,
    frames: 8,
    frameRate: 12,
    spawnOffset: [0, -20],
    fx: ['fx-pet-lion-sunder-strike'],
    aoe: 'ground',
  },
  'pet-dragon-baby-skill': {
    id: 'dragon',
    form: 'baby',
    name: 'Smoke Breath',
    castFrame: 3,
    frames: 8,
    frameRate: 10,
    spawnOffset: [-18, -20],
    fx: ['fx-pet-dragon-smoke-breath'],
  },
  'pet-dragon-young-skill': {
    id: 'dragon',
    form: 'young',
    name: 'Scorching Fireball',
    castFrame: 3,
    frames: 8,
    frameRate: 10,
    spawnOffset: [-22, -28],
    fx: ['fx-pet-dragon-fireball', 'fx-pet-dragon-fireball-impact'],
    projectile: { pxPerFrame: 5 },
  },
  'pet-dragon-ancient-skill': {
    id: 'dragon',
    form: 'ancient',
    name: 'Apocalyptic Flame',
    castFrame: 4,
    frames: 12,
    frameRate: 10,
    spawnOffset: [-48, -40],
    fx: ['fx-pet-dragon-apocalypse-flame'],
    channel: { loopFrom: 4, loopTo: 9, frames: 14, frameRate: 12 },
  },
};

const FORM_BY_ORB = ['baby', 'young', 'ancient'];

/**
 * Cast strip for this orb. 0 baby, 1 young, 2 ancient.
 * @param {string} id
 * @param {number} orbIndex
 */
export function petSkillKey(id, orbIndex) {
  const index = Math.max(0, Math.min(2, Math.floor(Number(orbIndex)) || 0));
  const form = FORM_BY_ORB[index];
  return `pet-${id}-${form}-skill`;
}

/** @param {string} key @returns {PetSkillSpec|null} */
export function petSkillSpec(key) {
  return PET_SKILL_SPECS[key] ?? null;
}

/** Cast strips and the FX they spawn. Stage preload uses this set. */
export const PET_SKILL_LOAD_KEYS = [...new Set(
  Object.entries(PET_SKILL_SPECS).flatMap(([key, spec]) => [key, ...spec.fx])
)];
