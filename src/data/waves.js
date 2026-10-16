import { GAME_CONFIG } from './GameConfig.js';
import { rosterForStage } from './stageRoster.js';

/**
 * Stage 1 wave schedule (timer 0–90s).
 *
 * Spawn totals are spread evenly across each window (not all at once).
 *
 * v0.22.1b thins the early windows so Stage 1 can be taught.
 * v0.26.2 slows the opening bites and adds one more soft walker so a
 * summoned pet can bank tier 2 before the wall breaks. HP on each row is
 * unchanged, so gold-by-HP does not move. Halt math is unchanged.
 * v0.35.9 lowers waves 1–3 contact DPS (4/6/10 → 3/5/8) so the wall keeps
 * a little more HP into wave 4. Counts, speeds, windows, HP rows, wave 4,
 * barricade max HP, and gold-by-HP stay put.
 *   Wave 1: count 5, DPS 3, speed 32
 *   Wave 2: count 6, DPS 5, speed 36
 *   Wave 3: count 10, DPS 8, speed 42
 *   Wave 4: count 48 (HP mix unchanged)
 *
 * Stage 1 HP table (initial max HP → gold via getGoldByHP):
 *   Wave 1: HP 40  (gold 10) — soft intro
 *   Wave 2: HP 70  (gold 10)
 *   Wave 3: HP 105 (gold 15) — first mid-tier
 *   Wave 4: mix — HP 50 (swarm, gold 10), HP 115 (gold 15), HP 165 (gold 20)
 *            weighted toward swarm so Stage 1 stays winnable with default DPS.
 *
 * `variant` is a spawn hook only (walker / runner / tank). It does not change
 * HP, speed, DPS, weight, gold, barricade HP, or stage length.
 * v0.28 stamps a visual `skins` list in waveDefsForStage. Those ids do not
 * change the numbers on these rows.
 */
export const STAGE_DURATION = 90;

export const WAVE_DEFS = [
  {
    wave: 1,
    startSec: 0,
    endSec: 20,
    total: 5,
    archetypes: [{ hp: 40, speed: 32, dps: 3, weight: 1, variant: 'walker' }],
  },
  {
    wave: 2,
    startSec: 21,
    endSec: 40,
    total: 6,
    archetypes: [{ hp: 70, speed: 36, dps: 5, weight: 1, variant: 'walker' }],
  },
  {
    wave: 3,
    startSec: 41,
    endSec: 60,
    total: 10,
    archetypes: [{ hp: 105, speed: 42, dps: 8, weight: 1, variant: 'walker' }],
  },
  {
    wave: 4,
    startSec: 61,
    endSec: 90,
    total: 48,
    archetypes: [
      { hp: 50, speed: 50, dps: 11, weight: 7, variant: 'runner' }, // swarm
      { hp: 115, speed: 40, dps: 16, weight: 2, variant: 'walker' }, // mid
      { hp: 165, speed: 33, dps: 20, weight: 1, variant: 'tank' }, // tank
    ],
  },
];

/**
 * Same HP / speed / DPS / weight / variant rows, plus the stage roster.
 * The copy is what WaveManager spawns. WAVE_DEFS itself stays the combat table.
 * @param {number} stage
 */
export function waveDefsForStage(stage) {
  const skins = rosterForStage(stage);
  return WAVE_DEFS.map((def) => ({
    ...def,
    archetypes: def.archetypes.map((arch) => ({ ...arch, skins })),
  }));
}

/** Barricade contact X — zombies stop here and deal DPS. */
export const BARRICADE_X = 650;

/**
 * Internal canvas (16:9). Was 800×450; DepthView.LAYOUT_SCALE maps that
 * composition onto this size. Combat tables below stay in field units.
 */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

/** Starting barricade HP for Stage 1 (tuned for close win/lose on wave 4). */
export const BARRICADE_MAX_HP = 720;

/**
 * Defender combat constants.
 * Fire cadence / weapon switch / handgun damage live in GameConfig.js.
 * Baby pet attacks live in PetCombat.js. Legacy PLAYER_FIRE_RATE / TURRET_*
 * below are unused by the live system but kept for reference.
 * PLAYER_BULLET_DAMAGE re-exports handgun damage.
 * Do not change STAGE_DURATION / WAVE_DEFS HP / BARRICADE_MAX_HP / gold tables.
 */
export const PLAYER_FIRE_RATE = 190;   // ms — superseded by GAME_CONFIG.WEAPONS.HANDGUN.FIRE_RATE
export const PLAYER_BULLET_DAMAGE = GAME_CONFIG.WEAPONS.HANDGUN.DAMAGE;
export const TURRET_FIRE_RATE = 240;   // ms — unused legacy turret cadence
export const TURRET_BULLET_DAMAGE = 22; // unused legacy turret damage
export const BULLET_SPEED = 470;
export const BULLET_SIZE = 8;
