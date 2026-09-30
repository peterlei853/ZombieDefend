/**
 * Stage 1 wave schedule (timer 0–90s).
 *
 * Spawn totals are spread evenly across each window (not all at once).
 *
 * Stage 1 HP table (initial max HP → gold via getGoldByHP):
 *   Wave 1: HP 40  (gold 10) — soft intro
 *   Wave 2: HP 70  (gold 10)
 *   Wave 3: HP 105 (gold 15) — first mid-tier
 *   Wave 4: mix — HP 50 (swarm, gold 10), HP 115 (gold 15), HP 165 (gold 20)
 *            weighted toward swarm so Stage 1 stays winnable with default DPS.
 */
export const STAGE_DURATION = 90;

export const WAVE_DEFS = [
  {
    wave: 1,
    startSec: 0,
    endSec: 20,
    total: 10,
    archetypes: [{ hp: 40, speed: 38, dps: 11, weight: 1 }],
  },
  {
    wave: 2,
    startSec: 21,
    endSec: 40,
    total: 15,
    archetypes: [{ hp: 70, speed: 42, dps: 13, weight: 1 }],
  },
  {
    wave: 3,
    startSec: 41,
    endSec: 60,
    total: 20,
    archetypes: [{ hp: 105, speed: 45, dps: 15, weight: 1 }],
  },
  {
    wave: 4,
    startSec: 61,
    endSec: 90,
    total: 90,
    archetypes: [
      { hp: 50, speed: 50, dps: 11, weight: 7 },   // swarm
      { hp: 115, speed: 40, dps: 16, weight: 2 },  // mid
      { hp: 165, speed: 33, dps: 20, weight: 1 },  // tank
    ],
  },
];

/** Barricade contact X — zombies stop here and deal DPS. */
export const BARRICADE_X = 650;

/** Game playfield. */
export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 450;

/** Starting barricade HP for Stage 1 (tuned for close win/lose on wave 4). */
export const BARRICADE_MAX_HP = 720;

/** Defender / turret combat constants. */
export const PLAYER_FIRE_RATE = 190;   // ms between shots
export const PLAYER_BULLET_DAMAGE = 30;
export const TURRET_FIRE_RATE = 240;   // ms between shots
export const TURRET_BULLET_DAMAGE = 22;
export const BULLET_SPEED = 470;
export const BULLET_SIZE = 8;
