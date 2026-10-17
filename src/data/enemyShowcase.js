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
 * Contact frame, using Phaser's `AnimationFrame.index`.
 * Every catalog attack sheet is 8 cells at 10 fps and has no
 * `timing.impactFrame` marker. That index is 1-based: the first cell
 * reports 1 and the last cell reports 8 (texture frames 0–7). The strike
 * is the frame nearest 80% of the strip: index 7 (texture cell 6). On an
 * 800 ms sheet it starts at 600 ms (75%) and its midpoint is about 81%.
 * The last cell reads as recovery, so the beat does not wait for index 8.
 * Key 2 starts `player-girl-hurt` and `sfx-enemy-<id>-hurt` on that
 * frame. The live barricade flash uses the same index. slime-mini has no
 * attack strip, so it is absent and key 2 reacts at once.
 *
 * v0.36.2 used index 5 (texture cell 4, halfway, 400 ms). Earlier indexes
 * followed the furthest east reach and several landed in the windup:
 * office-worker-v2 4, delivery 5, chef 5, nurse 5, brute 4, riot 4,
 * trashcan 3, sprinter 4, slime 4, exploder 4, cyborg 5, clown 4,
 * lava-balon 3, steel-balam 4.
 *
 * @type {Record<string, number>}
 */
export const ENEMY_ATTACK_HIT_FRAME = {
  'office-worker-v2': 7,
  delivery: 7,
  chef: 7,
  nurse: 7,
  brute: 7,
  riot: 7,
  trashcan: 7,
  sprinter: 7,
  slime: 7,
  exploder: 7,
  cyborg: 7,
  clown: 7,
  'lava-balon': 7,
  'steel-balam': 7,
};

/**
 * 1-based Phaser frame nearest 80% of an N-frame strip.
 * `floor(N * 0.8) + 1`, clamped to `[1, N]`. That index starts at
 * `floor(N * 0.8) / N` of the duration. For 8 frames it is 7 (cell 6:
 * start 75%, midpoint ~81%). 4 frames → 4. 1 frame → 1.
 * @param {number} frameCount
 */
export function lateAttackFrame(frameCount) {
  const n = Number(frameCount);
  if (!Number.isInteger(n) || n <= 0) return 1;
  const index = Math.floor(n * 0.8) + 1;
  if (index < 1) return 1;
  if (index > n) return n;
  return index;
}

/**
 * Contact frame for the strip that is actually playing.
 * A catalog id uses {@link ENEMY_ATTACK_HIT_FRAME} when that index fits.
 * Bare and legacy strips, which are not in the table, use the same ~80%
 * rule. Null when there is no strip to wait for.
 * @param {string|null|undefined} id
 * @param {number} frameCount
 * @returns {number|null}
 */
export function attackContactFrame(id, frameCount) {
  const total = Number(frameCount);
  const hasStrip = Number.isInteger(total) && total > 0;
  const listed = feelAttackHitFrame(id);
  if (listed != null && hasStrip && listed >= 1 && listed <= total) return listed;
  if (hasStrip) return lateAttackFrame(total);
  return null;
}

/**
 * Attack contact frame for the feel booth, or null when that id has no strike.
 * @param {string|null|undefined} id
 * @returns {number|null}
 */
export function feelAttackHitFrame(id) {
  if (!id || !Object.prototype.hasOwnProperty.call(ENEMY_ATTACK_HIT_FRAME, id)) return null;
  const frame = ENEMY_ATTACK_HIT_FRAME[id];
  return Number.isInteger(frame) ? frame : null;
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
