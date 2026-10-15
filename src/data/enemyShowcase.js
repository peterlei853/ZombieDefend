import { DEMO_ENEMY_IDS } from './GameConfig.js';

/**
 * Solo-enemy feel booth (`?enemy=<id>` / `?feel=1`).
 *
 * Skill rows are the special strips that have a packed cue. Basic
 * walk / attack / hurt / die stay on keys 1 and 2. Elemental hurt_*
 * sheets are weapon reactions and are not in this cycle.
 * `cue` matches the mp3 stem under assets/sfx/enemies/<id>/.
 *
 * @type {Record<string, { anim: string, cue: string }[]>}
 */
export const ENEMY_SKILL_STRIPS = {
  'office-worker-v2': [],
  delivery: [],
  chef: [],
  nurse: [{ anim: 'zombie-nurse-attach', cue: 'skill-attach' }],
  brute: [
    { anim: 'zombie-brute-hurt_heavy', cue: 'skill-hurt_heavy' },
    { anim: 'zombie-brute-part_break', cue: 'skill-part_break' },
    { anim: 'zombie-brute-blasted_back', cue: 'skill-blasted_back' },
    { anim: 'zombie-brute-defeated', cue: 'skill-defeated' },
  ],
  riot: [{ anim: 'zombie-riot-armor_break', cue: 'skill-armor_break' }],
  trashcan: [{ anim: 'zombie-trashcan-break', cue: 'skill-break' }],
  sprinter: [
    { anim: 'zombie-sprinter-blasted_back', cue: 'skill-blasted_back' },
    { anim: 'zombie-sprinter-tumble', cue: 'skill-tumble' },
    { anim: 'zombie-sprinter-comedic_ko', cue: 'skill-comedic_ko' },
  ],
  slime: [{ anim: 'zombie-slime-split', cue: 'skill-split' }],
  'slime-mini': [{ anim: 'zombie-slime-mini-splatter', cue: 'skill-splatter' }],
  exploder: [{ anim: 'zombie-exploder-explode', cue: 'skill-explode' }],
  cyborg: [
    { anim: 'zombie-cyborg-hurt_spark', cue: 'skill-hurt_spark' },
    { anim: 'zombie-cyborg-fall', cue: 'skill-fall' },
    { anim: 'zombie-cyborg-explode', cue: 'skill-explode' },
  ],
  clown: [
    { anim: 'zombie-clown-hurt_loot', cue: 'skill-hurt_loot' },
    { anim: 'zombie-clown-loot_explode', cue: 'skill-loot_explode' },
  ],
  'lava-balon': [
    { anim: 'zombie-boss-lava-lava_slam', cue: 'skill-lava_slam' },
    { anim: 'zombie-boss-lava-volcanic_breath', cue: 'skill-volcanic_breath' },
    { anim: 'zombie-boss-lava-meteor_storm', cue: 'skill-meteor_storm' },
    { anim: 'zombie-boss-lava-enrage', cue: 'enrage' },
  ],
  'steel-balam': [
    { anim: 'zombie-boss-steel-ground_smash', cue: 'skill-ground_smash' },
    { anim: 'zombie-boss-steel-bio_acid_spit', cue: 'skill-bio_acid_spit' },
    { anim: 'zombie-boss-steel-steel_whirlwind', cue: 'skill-steel_whirlwind' },
    { anim: 'zombie-boss-steel-enrage', cue: 'enrage' },
  ],
};

/**
 * Packed cues for each showcase id. Stems match the mp3 filenames.
 * @type {Record<string, string[]>}
 */
export const ENEMY_SFX_FILES = {
  'office-worker-v2': ['hit', 'hurt', 'die'],
  delivery: ['hit', 'hurt', 'die'],
  chef: ['hit', 'hurt', 'die'],
  nurse: ['hit', 'hurt', 'die', 'skill-attach'],
  brute: ['hit', 'hurt', 'die', 'skill-hurt_heavy', 'skill-part_break', 'skill-blasted_back', 'skill-defeated'],
  riot: ['hit', 'hurt', 'die', 'skill-armor_break'],
  trashcan: ['hit', 'hurt', 'die', 'skill-break', 'skill-panic'],
  sprinter: ['hit', 'hurt', 'die', 'skill-blasted_back', 'skill-tumble', 'skill-comedic_ko'],
  slime: ['hit', 'hurt', 'die', 'skill-split'],
  'slime-mini': ['hit', 'hurt', 'die', 'skill-splatter'],
  exploder: ['hit', 'hurt', 'die', 'skill-explode'],
  cyborg: ['hit', 'hurt', 'die', 'skill-hurt_spark', 'skill-fall', 'skill-explode'],
  clown: ['hit', 'hurt', 'die', 'skill-hurt_loot', 'skill-loot_explode'],
  'lava-balon': ['hit', 'hurt', 'die', 'skill-lava_slam', 'skill-volcanic_breath', 'skill-meteor_storm', 'enrage'],
  'steel-balam': ['hit', 'hurt', 'die', 'skill-ground_smash', 'skill-bio_acid_spit', 'skill-steel_whirlwind', 'enrage'],
};

/**
 * @param {string|null|undefined} id
 * @returns {{ anim: string, cue: string }[]}
 */
export function enemySkillStrips(id) {
  if (!id || !ENEMY_SKILL_STRIPS[id]) return [];
  return ENEMY_SKILL_STRIPS[id];
}

/**
 * Cache key. `sfx-enemy-<id>-hit`, `sfx-enemy-<id>-skill-attach`, `sfx-enemy-<id>-enrage`.
 * @param {string} id
 * @param {string} cue
 */
export function enemySfxKey(id, cue) {
  return `sfx-enemy-${id}-${cue}`;
}

/**
 * @param {string} id
 * @param {string} cue
 */
export function enemySfxUrl(id, cue) {
  return `assets/sfx/enemies/${id}/${cue}.mp3`;
}

/** Every packed clip, in catalog order. */
export function enemySfxClips() {
  /** @type {{ key: string, url: string }[]} */
  const clips = [];
  for (const id of DEMO_ENEMY_IDS) {
    for (const cue of ENEMY_SFX_FILES[id] || []) {
      clips.push({ key: enemySfxKey(id, cue), url: enemySfxUrl(id, cue) });
    }
  }
  return clips;
}

/**
 * Key 1 chips about a third of the showcase HP so the third press
 * reaches the death strip and `die` cue. Does not change gold-by-HP.
 * @param {number} maxHp
 */
export function feelHitDamage(maxHp) {
  const hp = Number(maxHp);
  if (!(hp > 0)) return 1;
  return Math.max(1, Math.ceil(hp / 3));
}
