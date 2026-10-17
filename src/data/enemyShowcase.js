import { DEMO_ENEMY_IDS } from './GameConfig.js';

/**
 * Solo-enemy feel booth (`?enemy=<id>` / `?feel=1`).
 *
 * Skill rows are the special strips. Basic walk / attack / hurt / die
 * stay on keys 1 and 2. Elemental hurt_* sheets are weapon reactions
 * and are not in this cycle. `cue` matches the mp3 stem under
 * assets/sfx/enemies/<id>/. An empty cue stays silent (no invented file).
 *
 * @type {Record<string, { anim: string, cue: string }[]>}
 */
export const ENEMY_SKILL_STRIPS = {
  'office-worker-v2': [],
  delivery: [],
  chef: [],
  nurse: [{ anim: 'zombie-nurse-attach', cue: 'skill-attach' }],
  brute: [
    { anim: 'zombie-brute-skill_ground_smash', cue: '' },
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
 * Contact frame, using Phaser 3.80's `AnimationFrame.index`.
 * `Animation.updateFrameSequence` sets `frame.index = i + 1`, so the
 * first cell is 1 and the last cell of an N-frame strip is N.
 * `textureFrame` is the sheet cell (0 … N-1). `AnimationFrame.progress`
 * is `(index - 1) / (N - 1)`.
 *
 * Every catalog attack sheet is 8 cells at 10 fps and has no
 * `timing.impactFrame` marker. Key 2 starts `player-girl-hurt` and
 * `sfx-enemy-<id>-hurt` on the contact index. The live barricade flash
 * uses this table. Feel key 2 uses it too, except the two overrides
 * below. slime-mini has no attack strip, so it is absent and key 2
 * reacts at once.
 *
 * v0.36.2 used index 5 (texture cell 4, halfway). v0.36.3 moved to index 7
 * (texture cell 6). On office / delivery / nurse that cell is the fully
 * extended end pose, so the hero hurt read as ~90–100% (Tester Fail #117).
 * Index 7 is not the last cell — the last cell is index 8 — but it is
 * already the end of the bite. Contact is now the first 1-based index
 * where `index / (N - 1) >= 0.8`. On 8 frames that is index 6 (texture
 * cell 5): after the midpoint, before the end pose.
 *
 * v0.36.6 keeps that shared index for the live barricade flash and for
 * every feel key 2 whose weapon actually extends there. Delivery's box
 * does: cell 5 is the first lean, and cells 6–7 hold it. Office's
 * briefcase and white arc extend on cell 4 (index 5); cells 5–7 are the
 * held end pose, so index 6 flinches after the swing. Nurse's arm stays
 * cocked through cell 5 (index 6); the white arc is cell 6 (index 7).
 * Feel key 2 uses {@link FEEL_ATTACK_HIT_OVERRIDE} for those two ids.
 * Delivery stays on index 6.
 *
 * Catalog skill timing (`impactFrame`, `gameplayHitFrame`) is 0-based.
 * Add 1 before comparing with `AnimationFrame.index`.
 *
 * @type {Record<string, number>}
 */
export const ENEMY_ATTACK_HIT_FRAME = {
  'office-worker-v2': 6,
  delivery: 6,
  chef: 6,
  nurse: 6,
  brute: 6,
  riot: 6,
  trashcan: 6,
  sprinter: 6,
  slime: 6,
  exploder: 6,
  cyborg: 6,
  clown: 6,
  'lava-balon': 6,
  'steel-balam': 6,
};

/**
 * Feel key 2 only. The live wall flash stays on {@link ENEMY_ATTACK_HIT_FRAME}.
 * Values are 1-based Phaser indexes of the attack strip (not the nurse attach).
 * office-worker-v2 is the first extended briefcase / white arc.
 * nurse is the white-arc strike. The shared index 6 is still the cocked arm.
 * @type {Record<string, number>}
 */
export const FEEL_ATTACK_HIT_OVERRIDE = {
  'office-worker-v2': 5,
  nurse: 7,
};

/**
 * First 1-based Phaser index whose `index / (N - 1)` is at least 0.8.
 * One frame returns 1. This is not `AnimationFrame.progress`, which uses
 * `(index - 1) / (N - 1)` and selected the end pose (index 7) on 8 frames.
 * @param {number} frameCount
 */
export function lateAttackFrame(frameCount) {
  const n = Number(frameCount);
  if (!Number.isInteger(n) || n <= 1) return 1;
  const denom = n - 1;
  for (let index = 1; index <= n; index += 1) {
    if (index / denom >= 0.8) return index;
  }
  return n;
}

/**
 * Catalog timing frames are 0-based sheet cells. Phaser's index is 1-based.
 * @param {number} catalogFrame
 * @returns {number|null}
 */
export function phaserIndexForCatalogFrame(catalogFrame) {
  const cell = Number(catalogFrame);
  if (!Number.isInteger(cell) || cell < 0) return null;
  return cell + 1;
}

/** Feel key 3 / skill 1 on the brute. The only strip that key plays. */
export const BRUTE_SMASH_ANIM = 'zombie-brute-skill_ground_smash';

/**
 * Key 3 row. Brute skill 1 is always {@link BRUTE_SMASH_ANIM}. Extra
 * hurt / break / blast / defeat rows are ignored and the cursor stays.
 * Every other id keeps walking the skill list.
 * @param {string|null|undefined} id
 * @param {{ anim: string, cue: string }[]|null|undefined} strips
 * @param {number} cursor
 * @returns {{ row: { anim: string, cue: string }|null, cursor: number }}
 */
export function feelSkillSelection(id, strips, cursor) {
  const list = Array.isArray(strips) ? strips : [];
  const current = Number.isInteger(cursor) && cursor >= 0 ? cursor : 0;
  if (id === 'brute') {
    const row = list.find((item) => item && item.anim === BRUTE_SMASH_ANIM) || null;
    return { row, cursor: current };
  }
  if (!list.length) return { row: null, cursor: current };
  const index = current % list.length;
  return { row: list[index], cursor: current + 1 };
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
function listedAttackHitFrame(id) {
  if (!id || !Object.prototype.hasOwnProperty.call(ENEMY_ATTACK_HIT_FRAME, id)) return null;
  const frame = ENEMY_ATTACK_HIT_FRAME[id];
  return Number.isInteger(frame) ? frame : null;
}

export function attackContactFrame(id, frameCount) {
  const total = Number(frameCount);
  const hasStrip = Number.isInteger(total) && total > 0;
  const listed = listedAttackHitFrame(id);
  if (listed != null && hasStrip && listed >= 1 && listed <= total) return listed;
  if (hasStrip) return lateAttackFrame(total);
  return null;
}

/**
 * Attack contact frame for feel key 2, or null when that id has no strike.
 * Office and nurse use {@link FEEL_ATTACK_HIT_OVERRIDE}. Everyone else uses
 * the live table. Delivery is not overridden.
 * @param {string|null|undefined} id
 * @returns {number|null}
 */
export function feelAttackHitFrame(id) {
  if (id && Object.prototype.hasOwnProperty.call(FEEL_ATTACK_HIT_OVERRIDE, id)) {
    const frame = FEEL_ATTACK_HIT_OVERRIDE[id];
    if (Number.isInteger(frame)) return frame;
  }
  return listedAttackHitFrame(id);
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
